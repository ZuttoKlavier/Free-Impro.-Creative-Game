import { createHash, randomBytes } from 'node:crypto';

const fail = (status, message) => Object.assign(new Error(message), { status });
const digest = value => createHash('sha256').update(value).digest('hex');
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const lifetime = 15 * 60 * 1000;
const invalid = () => fail(401, '恢复码无效或已失效，请向原教师重新申请。');

export function createStudentRecovery(db, { now = Date.now } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS student_recovery_codes(
    digest TEXT PRIMARY KEY,
    teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    class_id TEXT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
    issuer_session TEXT NOT NULL REFERENCES sessions(token) ON DELETE CASCADE,
    created_at INTEGER NOT NULL, expires INTEGER NOT NULL, consumed_at INTEGER);
    CREATE INDEX IF NOT EXISTS student_recovery_by_student ON student_recovery_codes(student_id);
    CREATE TABLE IF NOT EXISTS student_recovery_limits(bucket TEXT PRIMARY KEY,window_start INTEGER NOT NULL,count INTEGER NOT NULL);`);
  const one = (sql, ...args) => db.prepare(sql).get(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  const atomic = fn => { db.exec('BEGIN IMMEDIATE'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; } };

  // Persist attempts independently of a failing issue/redeem transaction, so
  // restarts and repeated invalid codes cannot reset the limit.
  function limit(bucket, maximum) {
    atomic(() => {
      const at = now();
      run('DELETE FROM student_recovery_limits WHERE window_start<=?', at - lifetime);
      const existing = one('SELECT * FROM student_recovery_limits WHERE bucket=?', bucket);
      if (existing?.count >= maximum) throw fail(429, '恢复操作过于频繁，请十五分钟后再试。');
      if (existing) run('UPDATE student_recovery_limits SET count=count+1 WHERE bucket=?', bucket);
      else run('INSERT INTO student_recovery_limits VALUES(?,?,1)', bucket, at);
    });
  }
  function fields(data, names) {
    if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length !== names.length || names.some(name => !Object.hasOwn(data, name))) throw fail(400, '恢复内容无效。');
  }
  function owner(teacherId, classId, studentId) {
    const student = one(`SELECT u.* FROM users u
      JOIN members m ON m.student_id=u.id JOIN classrooms c ON c.id=m.class_id
      JOIN users t ON t.id=c.teacher_id
      WHERE u.id=? AND u.role='student' AND c.id=? AND c.teacher_id=?
      AND t.role='teacher' AND m.admitted=1`, studentId, classId, teacherId);
    if (!student) return null;
    // The existing schema has no authoritative registration owner. An exact
    // roster match is sufficient only when every existing association agrees.
    if (one('SELECT 1 FROM members m JOIN classrooms c ON c.id=m.class_id WHERE m.student_id=? AND c.teacher_id<>? LIMIT 1', studentId, teacherId)
      || one('SELECT 1 FROM image_conversations WHERE student_id=? AND teacher_id<>? LIMIT 1', studentId, teacherId)
      || one('SELECT 1 FROM image_jobs j JOIN classrooms c ON c.id=j.class_id WHERE j.student_id=? AND c.teacher_id<>? LIMIT 1', studentId, teacherId)) return null;
    return student;
  }
  function issuer(teacherId, sessionDigest) {
    return typeof sessionDigest === 'string' && /^[a-f0-9]{64}$/.test(sessionDigest) && one("SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.user_id=? AND u.role='teacher' AND s.expires>?", sessionDigest, teacherId, now());
  }
  function issue(teacher, data, sessionDigest) {
    if (!teacher || teacher.role !== 'teacher' || !issuer(teacher.id, sessionDigest)) throw fail(403, '请使用原教师的有效登录签发恢复码。');
    limit('issue:' + teacher.id, 60);
    fields(data, ['classId', 'studentId']);
    if (!uuid(data.classId) || !uuid(data.studentId)) throw fail(400, '请选择明确的课堂和学生编号。');
    if (!owner(teacher.id, data.classId, data.studentId)) throw fail(403, '学生归属尚未明确，不能签发恢复码。');
    limit('student:' + data.studentId, 3);
    return atomic(() => {
      if (!issuer(teacher.id, sessionDigest) || !owner(teacher.id, data.classId, data.studentId)) throw fail(403, '学生归属尚未明确，不能签发恢复码。');
      const code = randomBytes(32).toString('hex'), at = now(), expiresAt = at + lifetime;
      run('DELETE FROM student_recovery_codes WHERE expires<=? OR (student_id=? AND consumed_at IS NULL)', at, data.studentId);
      run('INSERT INTO student_recovery_codes(digest,teacher_id,student_id,class_id,issuer_session,created_at,expires) VALUES(?,?,?,?,?,?,?)', digest(code), teacher.id, data.studentId, data.classId, sessionDigest, at, expiresAt);
      return { code, expiresAt, classId: data.classId, studentId: data.studentId };
    });
  }
  function consume(data, address, createSession) {
    // Use the actual peer, never a caller-supplied forwarding header. The
    // public proxy shares this conservative classroom-sized limit.
    limit('redeem:' + digest(String(address || 'unknown')), 120);
    fields(data, ['classId', 'code']);
    if (!uuid(data.classId) || typeof data.code !== 'string' || !/^[a-f0-9]{64}$/.test(data.code)) throw invalid();
    return atomic(() => {
      const at = now(), hash = digest(data.code);
      const record = one('SELECT * FROM student_recovery_codes WHERE digest=? AND class_id=? AND expires>? AND consumed_at IS NULL', hash, data.classId, at);
      if (!record || !issuer(record.teacher_id, record.issuer_session)) throw invalid();
      const user = owner(record.teacher_id, record.class_id, record.student_id);
      if (!user) throw invalid();
      if (run('UPDATE student_recovery_codes SET consumed_at=? WHERE digest=? AND consumed_at IS NULL AND expires>?', at, hash, at).changes !== 1) throw invalid();
      // The normal session insert runs in this transaction. A failed insert
      // rolls consumption back; the HTTP cookie is sent only after commit.
      const cookie = createSession(user);
      return { user, classId: record.class_id, cookie };
    });
  }
  return { issue, consume };
}
