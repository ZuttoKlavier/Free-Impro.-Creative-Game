import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, randomInt, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createImageGenerator, validateImage } from './images.js';
import { createLayoutStore } from './layout.js';

const hashPassword = promisify(scrypt);
const error = (status, message) => Object.assign(new Error(message), { status });
const clean = (value, min, max) => typeof value === 'string' && value.trim().length >= min && value.trim().length <= max;
const publicUser = u => ({ id: u.id, username: u.username, name: u.name, role: u.role });
const digest = token => createHash('sha256').update(token).digest('hex');

// Accept the bounded mono PCM WAV exported by the student client, checking real bytes.
export function validateWav(encoded) {
  if (typeof encoded !== 'string' || encoded.length > 530000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw error(400, '请提交有效的 WAV 声音。');
  const audio = Buffer.from(encoded, 'base64');
  if (audio.length < 46 || audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE' || audio.toString('ascii', 12, 16) !== 'fmt ' || audio.readUInt32LE(16) !== 16 || audio.readUInt16LE(20) !== 1 || audio.readUInt16LE(22) !== 1 || audio.readUInt16LE(34) !== 16 || audio.toString('ascii', 36, 40) !== 'data') throw error(400, '声音格式无效，请从本地声音库重新提交。');
  const rate = audio.readUInt32LE(24), length = audio.readUInt32LE(40);
  if (rate < 8000 || rate > 192000 || length !== audio.length - 44 || length % 2 || audio.readUInt32LE(4) !== audio.length - 8 || audio.readUInt32LE(28) !== rate * 2 || audio.readUInt16LE(32) !== 2 || length / (rate * 2) > 1 || length === 0) throw error(400, '每个声音需为有效的、最长 1 秒的单声道采样。');
  return { audio, duration: length / (rate * 2) };
}

export function createApp({ dbPath = 'data/classroom.sqlite', secureCookies = false, imageGenerator = createImageGenerator() } = {}) {
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, salt TEXT NOT NULL, password TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS classrooms(id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, teacher_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, capacity INTEGER NOT NULL, background TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS members(class_id TEXT NOT NULL REFERENCES classrooms(id), student_id TEXT NOT NULL REFERENCES users(id), admitted INTEGER NOT NULL, joined_at INTEGER NOT NULL, PRIMARY KEY(class_id,student_id));
    CREATE TABLE IF NOT EXISTS submissions(id TEXT PRIMARY KEY, class_id TEXT NOT NULL REFERENCES classrooms(id), student_id TEXT NOT NULL REFERENCES users(id), request_id TEXT NOT NULL, name TEXT NOT NULL, duration REAL NOT NULL, audio BLOB, status TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(student_id,request_id));
    CREATE UNIQUE INDEX IF NOT EXISTS one_current ON submissions(class_id,student_id) WHERE status='current';
    CREATE UNIQUE INDEX IF NOT EXISTS one_pending ON submissions(class_id,student_id) WHERE status='pending';
  `);
  const columns = db.prepare('PRAGMA table_info(submissions)').all().map(c => c.name);
  if (!columns.includes('image')) db.exec('ALTER TABLE submissions ADD COLUMN image BLOB');
  if (!columns.includes('image_kind')) db.exec('ALTER TABLE submissions ADD COLUMN image_kind TEXT');
  const layout = createLayoutStore(db);
  const imageRequests = new Set(), imageLimits = new Map();
  const one = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  const transaction = fn => { db.exec('BEGIN IMMEDIATE'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  const authLimits = new Map();
  function session(req) { const token = /(?:^|;\s*)fi_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1]; return token ? { token: digest(token), user: one('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?', digest(token), Date.now()) } : {}; }
  function setSession(res, userId) { const token = randomBytes(32).toString('hex'); run('DELETE FROM sessions WHERE expires<?', Date.now()); run('INSERT INTO sessions VALUES(?,?,?)', digest(token), userId, Date.now() + 30 * 86400000); res.setHeader('Set-Cookie', `fi_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${secureCookies ? '; Secure' : ''}`); }
  function roomFor(user, id) {
    const room = one('SELECT * FROM classrooms WHERE id=?', id); if (!room) throw error(404, '课堂不存在。');
    if (room.teacher_id !== user.id && !one('SELECT 1 FROM members WHERE class_id=? AND student_id=?', id, user.id)) throw error(403, '你尚未加入这个课堂。');
    return room;
  }
  function snapshot(room, user) {
    const teacher = room.teacher_id === user.id;
    const members = all(`SELECT m.student_id,m.admitted,m.slot,u.name FROM members m JOIN users u ON u.id=m.student_id WHERE class_id=? ${teacher ? '' : 'AND student_id=?'} ORDER BY joined_at,m.rowid`, ...[room.id, ...(teacher ? [] : [user.id])]);
    const submissions = all(`SELECT id,student_id,name,duration,status,created_at,image IS NOT NULL AS has_image,image_kind FROM submissions WHERE class_id=? AND status IN ('current','pending','rejected') ${teacher ? '' : 'AND student_id=?'} ORDER BY created_at DESC`, ...[room.id, ...(teacher ? [] : [user.id])]);
    return { ...room, memberCount: one('SELECT COUNT(*) AS n FROM members WHERE class_id=? AND admitted=1', room.id).n, members, submissions, ...(teacher ? { layout: layout.read(room.id) } : {}) };
  }
  async function body(req) {
    let size = 0; const chunks = [];
    for await (const chunk of req) { size += chunk.length; if (size > 1300000) throw error(413, '提交内容过大。'); chunks.push(chunk); }
    try { const value = JSON.parse(Buffer.concat(chunks).toString()); if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(); return value; } catch { throw error(400, '请求内容无效。'); }
  }
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    try {
      const path = new URL(req.url, 'http://local').pathname;
      if (req.method === 'GET' && path === '/api/health') { send(200, { ok: true }); return; }
      if (req.method === 'GET' && path === '/api/image-status') { send(200, { configured: imageGenerator.configured }); return; }
      if (!['GET', 'POST'].includes(req.method)) throw error(405, '不支持的操作。');
      if (req.method === 'POST') {
        let origin;
        try { origin = new URL(req.headers.origin); } catch { throw error(403, '请求来源无效。'); }
        if (!['http:', 'https:'].includes(origin.protocol) || origin.host !== req.headers.host) throw error(403, '请从本应用页面发起操作。');
      }
      if (req.method === 'POST' && ['/api/register', '/api/login'].includes(path)) {
        const key = req.socket.remoteAddress, now = Date.now();
        for (const [ip, limit] of authLimits) if (now - limit.start > 900000) authLimits.delete(ip);
        const limit = authLimits.get(key) || { start: now, count: 0 }; authLimits.set(key, limit);
        if (++limit.count > 120) throw error(429, '操作过于频繁，请 15 分钟后重试。');
        const data = await body(req);
        if (!clean(data.username, 3, 32) || !/^[a-zA-Z0-9_]+$/.test(data.username) || typeof data.password !== 'string' || data.password.length < 8 || data.password.length > 128) throw error(400, '账号使用 3–32 位字母、数字或下划线，密码使用 8–128 位字符。');
        const username = data.username.toLowerCase(); let user = one('SELECT * FROM users WHERE username=?', username);
        if (path === '/api/register') {
          if (!clean(data.name, 1, 30) || !['student', 'teacher'].includes(data.role)) throw error(400, '请填写姓名并选择身份。');
          if (user) throw error(409, '这个账号已被使用。');
          const salt = randomBytes(16).toString('hex'), password = (await hashPassword(data.password, salt, 64)).toString('hex');
          // Recheck after asynchronous password hashing to handle concurrent registration.
          if (one('SELECT 1 FROM users WHERE username=?', username)) throw error(409, '这个账号已被使用。');
          user = { id: randomUUID(), username, name: data.name.trim(), role: data.role, salt, password };
          run('INSERT INTO users VALUES(?,?,?,?,?,?)', ...Object.values(user));
        } else {
          const check = await hashPassword(data.password, user?.salt || 'not-an-account', 64);
          if (!user || !timingSafeEqual(check, Buffer.from(user.password, 'hex'))) throw error(401, '账号或密码不正确。');
        }
        const old = session(req); if (old.token) run('DELETE FROM sessions WHERE token=?', old.token);
        setSession(res, user.id); send(200, { user: publicUser(user) }); return;
      }
      const { token, user } = session(req); if (!user) throw error(401, '请先登录，或重新登录以恢复连接。');
      if (req.method === 'POST' && path === '/api/characters') {
        if (!imageGenerator.configured) throw error(503, '图像生成尚未配置，请让教师在服务器设置 OpenAI API 密钥。照片仍可保存在本地。');
        const now = Date.now();
        for (const [id, history] of imageLimits) { const recent = history.filter(t => now - t < 3600000); if (recent.length) imageLimits.set(id, recent); else imageLimits.delete(id); }
        const history = imageLimits.get(user.id) || [];
        if (history.length >= 10) throw error(429, '本小时生成次数已用完，请稍后再来。');
        if (imageRequests.has(user.id) || imageRequests.size >= 3) throw error(429, '正在生成其他形象，请稍后重试。');
        const data = await body(req); validateImage(data.photo);
        if (imageRequests.has(user.id) || imageRequests.size >= 3) throw error(429, '正在生成其他形象，请稍后重试。');
        imageRequests.add(user.id); imageLimits.set(user.id, [...history, now]);
        const controller = new AbortController();
        const cancel = () => { if (!res.writableEnded) controller.abort(); }; res.on('close', cancel);
        try { const result = await imageGenerator.generate(data.photo, AbortSignal.any([controller.signal, AbortSignal.timeout(240000)])); send(200, result); }
        finally { imageRequests.delete(user.id); res.off('close', cancel); }
        return;
      }
      if (req.method === 'GET' && path === '/api/me') { send(200, { user: publicUser(user) }); return; }
      if (req.method === 'POST' && path === '/api/logout') { run('DELETE FROM sessions WHERE token=?', token); res.setHeader('Set-Cookie', `fi_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureCookies ? '; Secure' : ''}`); send(200, { ok: true }); return; }
      if (req.method === 'GET' && path === '/api/classrooms') {
        const rooms = user.role === 'teacher' ? all('SELECT * FROM classrooms WHERE teacher_id=? ORDER BY created_at DESC', user.id) : all('SELECT c.* FROM classrooms c JOIN members m ON c.id=m.class_id WHERE student_id=? ORDER BY c.created_at DESC', user.id);
        send(200, { classrooms: rooms.map(r => snapshot(r, user)) }); return;
      }
      if (req.method === 'POST' && path === '/api/classrooms') {
        if (user.role !== 'teacher') throw error(403, '只有教师可以创建课堂。');
        const data = await body(req);
        if (!clean(data.name, 1, 50) || !Number.isInteger(data.capacity) || data.capacity < 1 || data.capacity > 50 || !['教室', '厨房', '操场'].includes(data.background)) throw error(400, '请填写课堂名称、1–50 人及场景。');
        let code; do { code = String(randomInt(100000, 1000000)); } while (one('SELECT 1 FROM classrooms WHERE code=?', code));
        const id = randomUUID(); transaction(() => { run('INSERT INTO classrooms VALUES(?,?,?,?,?,?,?)', id, code, user.id, data.name.trim(), data.capacity, data.background, Date.now()); layout.ensure({ id, capacity: data.capacity }); });
        send(201, { classroom: snapshot(roomFor(user, id), user) }); return;
      }
      if (req.method === 'POST' && path === '/api/join') {
        if (user.role !== 'student') throw error(403, '请用学生账号进入课堂。');
        const data = await body(req); if (typeof data.code !== 'string' || !/^\d{6}$/.test(data.code)) throw error(400, '请输入 6 位课堂码。');
        const room = one('SELECT * FROM classrooms WHERE code=?', data.code); if (!room) throw error(404, '没有找到这个课堂，请检查课堂码。');
        transaction(() => { const count = one('SELECT COUNT(*) AS n FROM members WHERE class_id=? AND admitted=1', room.id).n; run('INSERT OR IGNORE INTO members(class_id,student_id,admitted,joined_at) VALUES(?,?,?,?)', room.id, user.id, count < room.capacity ? 1 : 0, Date.now()); layout.assign(room.id, user.id); });
        send(200, { classroom: snapshot(room, user) }); return;
      }
      const match = /^\/api\/classrooms\/([^/]+)(?:\/(capacity|submit|layout))?$/.exec(path);
      if (match) {
        const room = roomFor(user, match[1]);
        if (req.method === 'GET' && !match[2]) { send(200, { classroom: snapshot(room, user) }); return; }
        if (req.method === 'POST' && match[2] === 'layout') {
          if (room.teacher_id !== user.id) throw error(403, '只有本课堂教师可以调整位置。');
          const data = await body(req);
          if (!Number.isInteger(data.slot) || data.slot < 1 || data.slot > room.capacity || ![data.x, data.y].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0.05 && n <= 0.95)) throw error(400, '请选择有效的位置，并将它保持在场景内。');
          layout.move(room.id, data.slot, data.x, data.y);
          send(200, { classroom: snapshot(room, user) }); return;
        }
        if (req.method === 'POST' && match[2] === 'capacity') {
          if (room.teacher_id !== user.id) throw error(403, '只有本课堂教师可以扩容。');
          const data = await body(req); if (!Number.isInteger(data.capacity) || data.capacity < room.capacity || data.capacity > 50) throw error(400, '人数只能增加，最多 50 人。');
          transaction(() => { run('UPDATE classrooms SET capacity=? WHERE id=?', data.capacity, room.id); layout.ensure({ id: room.id, capacity: data.capacity }); const count = one('SELECT COUNT(*) AS n FROM members WHERE class_id=? AND admitted=1', room.id).n; const waiting = all('SELECT student_id FROM members WHERE class_id=? AND admitted=0 ORDER BY joined_at,rowid LIMIT ?', room.id, data.capacity - count); for (const member of waiting) { run('UPDATE members SET admitted=1 WHERE class_id=? AND student_id=?', room.id, member.student_id); layout.assign(room.id, member.student_id); } });
          send(200, { classroom: snapshot(roomFor(user, room.id), user) }); return;
        }
        if (req.method === 'POST' && match[2] === 'submit') {
          if (user.role !== 'student' || !one('SELECT 1 FROM members WHERE class_id=? AND student_id=? AND admitted=1', room.id, user.id)) throw error(403, '课堂人数已满，请等待教师扩容。');
          const data = await body(req);
          if (!clean(data.name, 1, 40) || typeof data.requestId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(data.requestId)) throw error(400, '作品名称或提交标识无效。');
          const old = one('SELECT * FROM submissions WHERE student_id=? AND request_id=?', user.id, data.requestId);
          if (old) { if (old.class_id !== room.id) throw error(409, '提交标识重复。'); send(200, { classroom: snapshot(room, user) }); return; }
          const { audio, duration } = validateWav(data.audio);
          const image = validateImage(data.image), imageKind = image ? data.imageKind : null;
          if (image && !['avatar', 'photo'].includes(imageKind)) throw error(400, '图片类型无效。');
          transaction(() => {
            const current = one("SELECT 1 FROM submissions WHERE class_id=? AND student_id=? AND status='current'", room.id, user.id);
            run("UPDATE submissions SET status='superseded',audio=NULL,image=NULL WHERE class_id=? AND student_id=? AND status IN ('pending','rejected')", room.id, user.id);
            run('INSERT INTO submissions(id,class_id,student_id,request_id,name,duration,audio,status,created_at,image,image_kind) VALUES(?,?,?,?,?,?,?,?,?,?,?)', randomUUID(), room.id, user.id, data.requestId, data.name.trim(), duration, audio, current ? 'pending' : 'current', Date.now(), image, imageKind);
          });
          send(201, { classroom: snapshot(room, user) }); return;
        }
      }
      const sub = /^\/api\/submissions\/([^/]+)\/(audio|image|accept|reject)$/.exec(path);
      if (sub) {
        const item = one('SELECT * FROM submissions WHERE id=?', sub[1]); if (!item) throw error(404, '作品不存在。');
        const room = roomFor(user, item.class_id);
        if (room.teacher_id !== user.id && item.student_id !== user.id) throw error(403, '你无法访问这份作品。');
        if (sub[2] === 'image' && req.method === 'GET') { if (!item.image) throw error(404, '这份作品没有图片。'); res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(Buffer.from(item.image)); return; }
        if (sub[2] === 'audio' && req.method === 'GET') { if (!item.audio) throw error(404, '这份作品已被更新。'); res.writeHead(200, { 'Content-Type': 'audio/wav' }); res.end(Buffer.from(item.audio)); return; }
        if (req.method === 'POST' && ['accept', 'reject'].includes(sub[2])) {
          if (room.teacher_id !== user.id) throw error(403, '只有本课堂教师可以处理更换申请。');
          if (item.status !== 'pending') throw error(409, '申请已更新，请刷新后处理最新申请。');
          transaction(() => { if (sub[2] === 'accept') run("UPDATE submissions SET status='superseded',audio=NULL,image=NULL WHERE class_id=? AND student_id=? AND status='current'", room.id, item.student_id); run('UPDATE submissions SET status=? WHERE id=?', sub[2] === 'accept' ? 'current' : 'rejected', item.id); });
          send(200, { classroom: snapshot(room, user) }); return;
        }
      }
      throw error(404, '没有找到这个操作。');
    } catch (e) { if (!res.headersSent) send(e.status || 500, { error: e.status ? e.message : '服务暂时无法完成操作，请重试。' }); else res.end(); if (!e.status) console.error(e); }
  });
  server.requestTimeout = 15000;
  return { server, db };
}
