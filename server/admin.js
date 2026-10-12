import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import { createAdminDatabase } from './admin-database.js';

const hashPassword = promisify(scrypt);
const digest = value => createHash('sha256').update(value).digest('hex');
const fail = (status, message) => Object.assign(new Error(message), { status });
const clean = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max && !/[\p{Cc}]/u.test(value);
const accountName = value => typeof value === 'string' && /^[a-zA-Z0-9_]{3,32}$/.test(value);
const passwordOK = (value, min = 8) => typeof value === 'string' && value.length >= min && value.length <= 128;
const publicAdmin = row => ({ id: row.id, username: row.username, name: row.name });
const tables = {
  users: '教师与学生', classrooms: '课堂', members: '课堂成员', submissions: '作品提交',
  classroom_places: '课堂位置', classroom_arrangements: '课堂编排', classroom_rhythm_tracks: '学生节奏',
  student_rhythm_requests: '节奏申请', student_rhythm_receipts: '节奏回执', student_profiles: '学生形象',
  image_jobs: '图片申请', image_conversations: '生图对话', sessions: '登录会话',
  image_mcp_tokens: '教师工具连接', image_mcp_activity: '工具活动',
  admin_accounts: '管理员', admin_sessions: '管理员会话', admin_audit: '管理操作记录',
};
const hidden = new Set(['salt', 'password', 'token', 'digest', 'claim_id']);
const blobs = new Set(['audio', 'image', 'photo', 'reference', 'result', 'avatar']);
const labels = { id: '编号', username: '账号', name: '名称', role: '身份', code: '课堂码', teacher_id: '教师编号', student_id: '学生编号', class_id: '课堂编号', capacity: '人数上限', background: '场景', admitted: '已入课', slot: '位置', joined_at: '入课时间', created_at: '创建时间', updated_at: '更新时间', expires: '到期时间', user_id: '账号编号', status: '状态', duration: '时长', audio: '声音', image: '图片', image_kind: '图片类型', photo: '参考照片', reference: '参考形象', result: '生成图片', avatar: '固定形象', kind: '类型', work_name: '作品名称', work_id: '作品编号', day: '申请日期', completed_day: '回传日期', conversation_url: '学生对话', registered_at: '注册时间', bars: '小节数', revision: '版本', steps: '节奏', rhythm: '节奏', x: '横坐标', y: '纵坐标', request_id: '请求编号', submission_id: '作品编号', admin_id: '管理员编号', action: '操作', target: '目标编号', at: '操作时间', last_tool_at: '最近工具调用' };

export function initializeAdmin(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS admin_accounts(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,name TEXT NOT NULL,salt TEXT NOT NULL,password TEXT NOT NULL,created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS admin_sessions(token TEXT PRIMARY KEY,admin_id TEXT NOT NULL REFERENCES admin_accounts(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS admin_audit(id TEXT PRIMARY KEY,admin_id TEXT NOT NULL REFERENCES admin_accounts(id),action TEXT NOT NULL,target TEXT NOT NULL,at INTEGER NOT NULL);`);
}

// Only the local setup command calls this. No HTTP registration endpoint exists.
export async function provisionAdmin(db, { username, password, name = '管理员' }) {
  if (!accountName(username) || !passwordOK(password, 12) || !clean(name, 30)) throw fail(400, '管理员账号使用 3–32 位字母、数字或下划线，密码使用 12–128 位字符，姓名最多 30 字。');
  initializeAdmin(db);
  username = username.toLowerCase();
  const salt = randomBytes(16).toString('hex'), hashed = (await hashPassword(password, salt, 64)).toString('hex');
  db.exec('BEGIN IMMEDIATE');
  try {
    const old = db.prepare('SELECT id FROM admin_accounts WHERE username=?').get(username);
    const id = old?.id || randomUUID();
    db.prepare('INSERT INTO admin_accounts VALUES(?,?,?,?,?,?) ON CONFLICT(username) DO UPDATE SET name=excluded.name,salt=excluded.salt,password=excluded.password').run(id, username, name.trim(), salt, hashed, Date.now());
    db.prepare('DELETE FROM admin_sessions WHERE admin_id=?').run(id);
    db.exec('COMMIT');
    return { id, username, name: name.trim() };
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

export function createAdmin({ db, dbPath, secureCookies, body, layout, performance, images }) {
  initializeAdmin(db);
  const database = createAdminDatabase({ dbPath });
  const one = (sql, ...args) => db.prepare(sql).get(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const attempts = new Map();
  const cookie = (token, maxAge) => `fi_session_admin=${token}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=${maxAge}${secureCookies ? '; Secure' : ''}`;
  function session(req) {
    const token = /(?:^|;\s*)fi_session_admin=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    return { token: token ? digest(token) : null, admin: token ? one('SELECT a.id,a.username,a.name FROM admin_accounts a JOIN admin_sessions s ON a.id=s.admin_id WHERE s.token=? AND s.expires>?', digest(token), Date.now()) : null };
  }
  function audit(admin, action, target = '') { run('INSERT INTO admin_audit VALUES(?,?,?,?,?)', randomUUID(), admin.id, action, target, Date.now()); }
  function atomic(fn) { db.exec('BEGIN IMMEDIATE'); try { fn(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } }
  function source(req) {
    let origin; try { origin = new URL(req.headers.origin); } catch { throw fail(403, '请从后台页面发起操作。'); }
    if (origin.origin !== req.headers.origin || origin.host !== req.headers.host || !(secureCookies ? origin.protocol === 'https:' : ['http:', 'https:'].includes(origin.protocol))) throw fail(403, '请从后台页面发起操作。');
  }
  function fields(data, permitted) { if (Object.keys(data).some(key => !permitted.includes(key))) throw fail(400, '包含不支持的修改。'); }
  const existing = (table, id) => { const row = one(`SELECT * FROM ${table} WHERE id=?`, id); if (!row) throw fail(404, '记录不存在。'); return row; };
  function noLive(classIds) { if (classIds.some(id => performance.read(id).playing)) throw fail(409, '课堂正在演奏，请先在教师端停止后管理关联数据。'); }
  function removeClass(id) {
    for (const table of ['classroom_rhythm_tracks', 'student_rhythm_requests', 'student_rhythm_receipts', 'classroom_places', 'image_jobs', 'submissions', 'members', 'classroom_arrangements']) run(`DELETE FROM ${table} WHERE class_id=?`, id);
    run('DELETE FROM classrooms WHERE id=?', id);
  }
  function tableQuery(url) {
    const table = url.searchParams.get('table') || 'users';
    if (!Object.hasOwn(tables, table)) throw fail(400, '请选择有效的数据表。');
    const info = all(`PRAGMA table_info(${table})`).filter(column => !hidden.has(column.name));
    const q = url.searchParams.get('q') || '', role = url.searchParams.get('role');
    if (q.length > 100 || (role && !['teacher', 'student'].includes(role))) throw fail(400, '搜索条件无效。');
    const where = [], args = [];
    if (table === 'users' && role) { where.push('role=?'); args.push(role); }
    const searchable = info.filter(column => !blobs.has(column.name));
    if (q && searchable.length) {
      where.push('(' + searchable.map(column => `CAST("${column.name}" AS TEXT) LIKE ? ESCAPE '\\'`).join(' OR ') + ')');
      args.push(...searchable.map(() => '%' + q.replace(/[\\%_]/g, '\\$&') + '%'));
    }
    return { table, info, args, where: where.length ? ' WHERE ' + where.join(' AND ') : '' };
  }
  function selectRows({ table, info, where, args }, limit, offset) {
    const selection = info.map(column => blobs.has(column.name) ? `length("${column.name}") AS "${column.name}"` : `"${column.name}"`).join(',');
    return all(`SELECT rowid AS _internalRowId,${selection} FROM ${table}${where} ORDER BY rowid DESC LIMIT ? OFFSET ?`, ...args, limit, offset).map(row => {
      for (const column of info) if (blobs.has(column.name) && row[column.name] !== null) row[column.name] = { bytes: row[column.name], type: column.name === 'audio' ? 'audio/wav' : 'image/png', url: `/api/admin/assets?table=${table}&column=${column.name}&row=${row._internalRowId}` };
      return row;
    });
  }
  function records(url) {
    const query = tableQuery(url), { table, info, where, args } = query;
    const page = Number(url.searchParams.get('page') || '1');
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000000) throw fail(400, '页码无效。');
    const rows = selectRows(query, 25, (page - 1) * 25);
    return { table, columns: info.map(column => ({ key: column.name, label: labels[column.name] || column.name })), rows, page, pageSize: 25, total: one(`SELECT COUNT(*) AS n FROM ${table}${where}`, ...args).n };
  }
  async function handle(req, res) {
    const url = new URL(req.url, 'http://local');
    if (!url.pathname.startsWith('/api/admin/')) return false;
    const path = url.pathname.slice('/api/admin'.length);
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    if (path === '/console' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'none'" });
      res.end(readFileSync(new URL('../public/admin.html', import.meta.url))); return true;
    }
    if (!['GET', 'POST'].includes(req.method)) throw fail(405, '不支持的操作。');
    if (req.method === 'POST') source(req);
    if (path === '/login' && req.method === 'POST') {
      if (!one('SELECT 1 FROM admin_accounts LIMIT 1')) throw fail(503, '管理员尚未配置，请在服务电脑运行 npm run admin:setup。');
      const ip = req.socket.remoteAddress, now = Date.now();
      for (const [key, value] of attempts) if (now - value.start > 900000) attempts.delete(key);
      const entry = attempts.get(ip) || { start: now, count: 0 }; attempts.set(ip, entry);
      if (++entry.count > 20) throw fail(429, '尝试过于频繁，请 15 分钟后重试。');
      const data = await body(req); fields(data, ['username', 'password']);
      if (!accountName(data.username) || !passwordOK(data.password, 12)) throw fail(401, '管理员账号或密码不正确。');
      const row = one('SELECT * FROM admin_accounts WHERE username=?', data.username.toLowerCase());
      const check = await hashPassword(data.password, row?.salt || 'not-an-admin', 64);
      // Local password rotation during hashing must not revive the old password.
      if (!row || !timingSafeEqual(check, Buffer.from(row.password, 'hex'))) throw fail(401, '管理员账号或密码不正确。');
      const old = session(req), token = randomBytes(32).toString('hex');
      atomic(() => {
        if (one('SELECT password FROM admin_accounts WHERE id=?', row.id)?.password !== row.password) throw fail(401, '管理员账号或密码不正确。');
        if (old.token) run('DELETE FROM admin_sessions WHERE token=?', old.token);
        run('DELETE FROM admin_sessions WHERE expires<=?', now); run('INSERT INTO admin_sessions VALUES(?,?,?)', digest(token), row.id, now + 8 * 3600000); audit(row, 'admin.login');
      });
      res.setHeader('Set-Cookie', cookie(token, 28800)); send(200, { admin: publicAdmin(row) }); return true;
    }
    const { admin, token } = session(req);
    if (!admin) throw fail(401, '请先使用管理员账号登录后台。');
    if (path.startsWith('/database/')) { await database.proxy(req, res); return true; }
    if (req.method === 'GET') {
      if (path === '/me') { send(200, { admin }); return true; }
      if (path === '/overview') {
        const count = (table, clause = '') => one(`SELECT COUNT(*) AS n FROM ${table}${clause}`).n;
        send(200, { counts: { teachers: count('users', " WHERE role='teacher'"), students: count('users', " WHERE role='student'"), classrooms: count('classrooms'), submissions: count('submissions'), imageJobs: count('image_jobs') }, tables: Object.entries(tables).map(([name, label]) => ({ name, label, count: count(name) })) }); return true;
      }
      if (path === '/records') { send(200, records(url)); return true; }
      if (path === '/export') {
        const query = tableQuery(url);
        const selected = selectRows(query, 10001, 0);
        if (selected.length > 10000) throw fail(413, '结果超过一万条，请缩小搜索范围后导出。');
        const rows = selected.map(({ _internalRowId, ...row }) => row);
        const result = JSON.stringify({ table: query.table, exportedAt: Date.now(), columns: query.info.map(column => ({ key: column.name, label: labels[column.name] || column.name })), rows });
        if (Buffer.byteLength(result) > 8 * 1024 * 1024) throw fail(413, '结果超过 8 MiB，请缩小搜索范围后导出。');
        audit(admin, 'data.export', query.table);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${query.table}.json"` });
        res.end(result); return true;
      }
      if (path === '/assets') {
        const table = url.searchParams.get('table'), column = url.searchParams.get('column'), row = Number(url.searchParams.get('row'));
        if (!Object.hasOwn(tables, table) || !blobs.has(column) || !all(`PRAGMA table_info(${table})`).some(c => c.name === column) || !Number.isSafeInteger(row) || row < 1) throw fail(400, '素材地址无效。');
        const result = one(`SELECT "${column}" AS bytes FROM ${table} WHERE rowid=?`, row);
        if (!result?.bytes) throw fail(404, '素材不存在。');
        res.writeHead(200, { 'Content-Type': column === 'audio' ? 'audio/wav' : 'image/png', 'Content-Disposition': `inline; filename="${table}-${row}-${column}.${column === 'audio' ? 'wav' : 'png'}"` });
        res.end(Buffer.from(result.bytes)); return true;
      }
      throw fail(404, '没有找到这个管理操作。');
    }
    const data = await body(req);
    if (path === '/logout') { fields(data, []); atomic(() => { run('DELETE FROM admin_sessions WHERE token=?', token); audit(admin, 'admin.logout'); }); res.setHeader('Set-Cookie', cookie('', 0)); send(200, { ok: true }); return true; }
    if (path === '/users/create') {
      fields(data, ['username', 'password', 'name', 'role']);
      if (!accountName(data.username) || !passwordOK(data.password) || !clean(data.name, 30) || !['student', 'teacher'].includes(data.role)) throw fail(400, '请填写有效账号、姓名、身份和至少 8 位密码。');
      const username = data.username.toLowerCase(), salt = randomBytes(16).toString('hex'), password = (await hashPassword(data.password, salt, 64)).toString('hex'), id = randomUUID();
      atomic(() => { if (one('SELECT 1 FROM users WHERE username=?', username)) throw fail(409, '账号已经存在。'); run('INSERT INTO users(id,username,name,role,salt,password) VALUES(?,?,?,?,?,?)', id, username, data.name.trim(), data.role, salt, password); audit(admin, 'users.create', id); });
      send(201, { ok: true }); return true;
    }
    const match = /^\/(users|classrooms|submissions|image-jobs)\/([a-f0-9-]{36})\/(update|password|revoke|delete|reject)$/.exec(path);
    if (!match) throw fail(404, '没有找到这个管理操作。');
    const [, entity, id, action] = match, table = entity === 'image-jobs' ? 'image_jobs' : entity;
    existing(table, id);
    if (entity === 'users' && action === 'password') {
      fields(data, ['password']); if (!passwordOK(data.password)) throw fail(400, '新密码需为 8–128 位字符。');
      const salt = randomBytes(16).toString('hex'), password = (await hashPassword(data.password, salt, 64)).toString('hex');
      atomic(() => { existing(table, id); run('UPDATE users SET salt=?,password=? WHERE id=?', salt, password, id); run('DELETE FROM sessions WHERE user_id=?', id); run('DELETE FROM image_mcp_tokens WHERE teacher_id=?', id); audit(admin, 'users.password', id); });
    } else if (entity === 'users' && action === 'revoke') {
      fields(data, []); atomic(() => { run('DELETE FROM sessions WHERE user_id=?', id); run('DELETE FROM image_mcp_tokens WHERE teacher_id=?', id); audit(admin, 'users.revoke', id); });
    } else if (['users', 'classrooms', 'submissions'].includes(entity) && action === 'update') {
      fields(data, ['name']); if (!clean(data.name, entity === 'classrooms' ? 50 : entity === 'submissions' ? 40 : 30)) throw fail(400, '名称不能为空或超过长度限制。');
      atomic(() => { run(`UPDATE ${table} SET name=? WHERE id=?`, data.name.trim(), id); audit(admin, entity + '.update', id); });
    } else if (entity === 'image-jobs' && action === 'reject') {
      fields(data, []);
      atomic(() => { const job = existing(table, id); if (!['pending', 'processing'].includes(job.status)) throw fail(409, '只能取消仍在处理的图片申请。'); run("UPDATE image_jobs SET status='rejected',photo=NULL,reference=NULL,claim_id=NULL,updated_at=? WHERE id=?", Date.now(), id); audit(admin, 'image-jobs.reject', id); });
    } else if (['users', 'classrooms', 'submissions'].includes(entity) && action === 'delete') {
      fields(data, ['confirmation']); if (data.confirmation !== id) throw fail(400, '请明确确认删除这条记录。');
      atomic(() => {
        const row = existing(table, id);
        if (entity === 'classrooms') { noLive([id]); removeClass(id); }
        if (entity === 'submissions') { noLive([row.class_id]); run('DELETE FROM student_rhythm_requests WHERE submission_id=?', id); run('DELETE FROM submissions WHERE id=?', id); }
        if (entity === 'users') {
          const owned = all('SELECT id FROM classrooms WHERE teacher_id=?', id).map(c => c.id), joined = all('SELECT class_id FROM members WHERE student_id=?', id).map(c => c.class_id);
          noLive([...owned, ...joined]); owned.forEach(removeClass);
          for (const child of ['classroom_rhythm_tracks', 'student_rhythm_requests', 'student_rhythm_receipts', 'submissions', 'image_jobs', 'members', 'student_profiles']) run(`DELETE FROM ${child} WHERE student_id=?`, id);
          run('DELETE FROM image_conversations WHERE student_id=? OR teacher_id=?', id, id);
          run('DELETE FROM image_mcp_tokens WHERE teacher_id=?', id); run('DELETE FROM sessions WHERE user_id=?', id); run('DELETE FROM users WHERE id=?', id);
        }
        audit(admin, entity + '.delete', id);
      });
    } else throw fail(404, '没有找到这个管理操作。');
    send(200, { ok: true }); return true;
  }
  return { handle, close: database.close };
}
