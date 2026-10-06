import { validateRhythm, fitRhythm, resizeSteps, validStep } from '../src/rhythm-data.js';
const failure = (status, message) => Object.assign(new Error(message), { status });
const keysAre = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

// Rhythm belongs to a student in a classroom, so accepting a new sample preserves it.
export function createArrangementStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS classroom_arrangements(
      class_id TEXT PRIMARY KEY REFERENCES classrooms(id),
      bars INTEGER NOT NULL CHECK(bars BETWEEN 1 AND 16),
      revision INTEGER NOT NULL CHECK(revision >= 0)
    );
    CREATE TABLE IF NOT EXISTS classroom_rhythm_tracks(
      class_id TEXT NOT NULL REFERENCES classroom_arrangements(class_id),
      student_id TEXT NOT NULL,
      steps TEXT NOT NULL,
      PRIMARY KEY(class_id,student_id),
      FOREIGN KEY(class_id,student_id) REFERENCES members(class_id,student_id)
    );
    CREATE TABLE IF NOT EXISTS student_rhythm_requests(
      class_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      submission_id TEXT NOT NULL,
      rhythm TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY(class_id,student_id),
      FOREIGN KEY(class_id,student_id) REFERENCES members(class_id,student_id)
    );
    CREATE TABLE IF NOT EXISTS student_rhythm_receipts(
      class_id TEXT NOT NULL, student_id TEXT NOT NULL, request_id TEXT NOT NULL,
      PRIMARY KEY(class_id,student_id,request_id)
    );
  `);
  const header = classId => db.prepare('SELECT bars,revision FROM classroom_arrangements WHERE class_id=?').get(classId) || { bars: 1, revision: 0 };
  const resize = resizeSteps;
  const read = classId => {
    const { bars, revision } = header(classId);
    const rows = db.prepare(`SELECT m.student_id,t.steps FROM members m
      LEFT JOIN classroom_rhythm_tracks t ON t.class_id=m.class_id AND t.student_id=m.student_id
      WHERE m.class_id=? AND m.admitted=1 AND EXISTS(
        SELECT 1 FROM submissions s WHERE s.class_id=m.class_id AND s.student_id=m.student_id AND s.status='current'
      ) ORDER BY m.slot,m.joined_at,m.rowid`).all(classId);
    return { bars, revision, tracks: rows.map(row => ({ studentId: row.student_id, steps: resize(row.steps ? JSON.parse(row.steps) : [], bars * 16) })) };
  };
  const edit = (classId, data, request = null) => {
    const changingBars = keysAre(data, ['revision', 'bars']);
    const changingTrack = keysAre(data, ['revision', 'track']);
    if ((!changingBars && !changingTrack) || !Number.isSafeInteger(data.revision) || data.revision < 0) throw failure(400, '请提交有效的节奏版本及一项修改。');
    if (changingBars && (!Number.isInteger(data.bars) || data.bars < 1 || data.bars > 16)) throw failure(400, '小节数必须是 1–16 的整数。');
    if (changingTrack && (!keysAre(data.track, ['studentId', 'steps']) || typeof data.track.studentId !== 'string' || !data.track.studentId || !Array.isArray(data.track.steps) || data.track.steps.length > 256 || !data.track.steps.every(validStep))) throw failure(400, '请提交有效学生及完整节奏。');
    db.exec('BEGIN IMMEDIATE');
    try {
      const current = header(classId);
      if (data.revision !== current.revision) throw failure(409, '节奏已在其他页面更新，请刷新后重新编辑。');
      if (request) {
        const pending = db.prepare("SELECT 1 FROM student_rhythm_requests r JOIN submissions s ON s.id=r.submission_id AND s.status='current' WHERE r.class_id=? AND r.student_id=? AND r.request_id=? AND r.status='pending'").get(classId, request.studentId, request.requestId);
        if (!pending) throw failure(409, '节奏申请已经变更，请刷新后处理。');
      }
      if (changingTrack) {
        const admitted = db.prepare(`SELECT 1 FROM members m WHERE m.class_id=? AND m.student_id=? AND m.admitted=1
          AND EXISTS(SELECT 1 FROM submissions s WHERE s.class_id=m.class_id AND s.student_id=m.student_id AND s.status='current')`).get(classId, data.track.studentId);
        if (!admitted) throw failure(400, '只能编辑已入课且已提交声音的学生节奏。');
        if (data.track.steps.length !== current.bars * 16) throw failure(400, '节奏长度必须与当前小节数一致，每小节 16 格。');
      }
      db.prepare('INSERT OR IGNORE INTO classroom_arrangements VALUES(?,1,0)').run(classId);
      if (changingBars) {
        // Save the shortened arrays, rather than hiding the tail, so re-expansion starts silent.
        const tracks = db.prepare('SELECT student_id,steps FROM classroom_rhythm_tracks WHERE class_id=?').all(classId);
        const update = db.prepare('UPDATE classroom_rhythm_tracks SET steps=? WHERE class_id=? AND student_id=?');
        for (const track of tracks) update.run(JSON.stringify(resize(JSON.parse(track.steps), data.bars * 16)), classId, track.student_id);
        db.prepare('UPDATE classroom_arrangements SET bars=?,revision=revision+1 WHERE class_id=?').run(data.bars, classId);
      } else {
        db.prepare('INSERT INTO classroom_rhythm_tracks VALUES(?,?,?) ON CONFLICT(class_id,student_id) DO UPDATE SET steps=excluded.steps').run(classId, data.track.studentId, JSON.stringify(data.track.steps));
        db.prepare('UPDATE classroom_arrangements SET revision=revision+1 WHERE class_id=?').run(classId);
      }
      if (request) db.prepare("UPDATE student_rhythm_requests SET status='accepted' WHERE class_id=? AND student_id=? AND request_id=?").run(classId, request.studentId, request.requestId);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  };
  const requests = (classId, studentId = null) => db.prepare(`SELECT * FROM student_rhythm_requests WHERE class_id=? ${studentId ? 'AND student_id=?' : ''} ORDER BY created_at DESC`).all(...[classId, ...(studentId ? [studentId] : [])]).map(row => ({ studentId: row.student_id, requestId: row.request_id, submissionId: row.submission_id, rhythm: JSON.parse(row.rhythm), status: row.status, createdAt: row.created_at }));
  const propose = (classId, studentId, data) => {
    if (!keysAre(data, ['requestId', 'submissionId', 'rhythm']) || typeof data.requestId !== 'string' || !/^[a-f0-9-]{36}$/.test(data.requestId) || typeof data.submissionId !== 'string') throw failure(400, '节奏提交信息无效。');
    let rhythm; try { rhythm = validateRhythm(data.rhythm); } catch (e) { throw failure(400, e.message); }
    db.exec('BEGIN IMMEDIATE');
    try {
      if (!db.prepare('SELECT 1 FROM student_rhythm_receipts WHERE class_id=? AND student_id=? AND request_id=?').get(classId, studentId, data.requestId)) {
        const current = db.prepare("SELECT s.id FROM submissions s JOIN members m ON m.class_id=s.class_id AND m.student_id=s.student_id WHERE s.class_id=? AND s.student_id=? AND s.status='current' AND m.admitted=1").get(classId, studentId);
        if (!current || current.id !== data.submissionId) throw failure(409, '课堂声音已变更，请刷新并向当前声音提交节奏。');
        db.prepare(`INSERT INTO student_rhythm_requests VALUES(?,?,?,?,?,'pending',?) ON CONFLICT(class_id,student_id) DO UPDATE SET request_id=excluded.request_id,submission_id=excluded.submission_id,rhythm=excluded.rhythm,status='pending',created_at=excluded.created_at`).run(classId, studentId, data.requestId, current.id, JSON.stringify(rhythm), Date.now());
        db.prepare('INSERT INTO student_rhythm_receipts VALUES(?,?,?)').run(classId, studentId, data.requestId);
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  };
  const decide = (classId, data) => {
    if (!keysAre(data, ['studentId', 'requestId', 'decision', 'revision']) || typeof data.studentId !== 'string' || !data.studentId || typeof data.requestId !== 'string' || !Number.isSafeInteger(data.revision) || data.revision < 0 || !['accept', 'reject'].includes(data.decision)) throw failure(400, '节奏审批信息无效。');
    const request = requests(classId, data.studentId).find(r => r.requestId === data.requestId && r.status === 'pending');
    if (!request) throw failure(409, '节奏申请已更新或处理，请刷新后重试。');
    if (data.decision === 'reject') { db.prepare("UPDATE student_rhythm_requests SET status='rejected' WHERE class_id=? AND student_id=? AND request_id=?").run(classId, data.studentId, data.requestId); return; }
    const current = db.prepare("SELECT id FROM submissions WHERE class_id=? AND student_id=? AND status='current'").get(classId, data.studentId);
    if (current?.id !== request.submissionId) throw failure(409, '学生声音已经更换，请学生重新提交节奏。');
    edit(classId, { revision: data.revision, track: { studentId: data.studentId, steps: fitRhythm(request.rhythm, header(classId).bars) } }, data);
  };
  return { read, edit, requests, propose, decide };
}
