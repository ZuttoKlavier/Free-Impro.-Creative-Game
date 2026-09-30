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
  `);
  const header = classId => db.prepare('SELECT bars,revision FROM classroom_arrangements WHERE class_id=?').get(classId) || { bars: 1, revision: 0 };
  const resize = (steps, length) => Array.from({ length }, (_, index) => steps[index] === true);
  const read = classId => {
    const { bars, revision } = header(classId);
    const rows = db.prepare(`SELECT m.student_id,t.steps FROM members m
      LEFT JOIN classroom_rhythm_tracks t ON t.class_id=m.class_id AND t.student_id=m.student_id
      WHERE m.class_id=? AND m.admitted=1 AND EXISTS(
        SELECT 1 FROM submissions s WHERE s.class_id=m.class_id AND s.student_id=m.student_id AND s.status='current'
      ) ORDER BY m.slot,m.joined_at,m.rowid`).all(classId);
    return { bars, revision, tracks: rows.map(row => ({ studentId: row.student_id, steps: resize(row.steps ? JSON.parse(row.steps) : [], bars * 16) })) };
  };
  const edit = (classId, data) => {
    const changingBars = keysAre(data, ['revision', 'bars']);
    const changingTrack = keysAre(data, ['revision', 'track']);
    if ((!changingBars && !changingTrack) || !Number.isSafeInteger(data.revision) || data.revision < 0) throw failure(400, '请提交有效的节奏版本及一项修改。');
    if (changingBars && (!Number.isInteger(data.bars) || data.bars < 1 || data.bars > 16)) throw failure(400, '小节数必须是 1–16 的整数。');
    if (changingTrack && (!keysAre(data.track, ['studentId', 'steps']) || typeof data.track.studentId !== 'string' || !data.track.studentId || !Array.isArray(data.track.steps) || data.track.steps.length > 256 || !data.track.steps.every(step => typeof step === 'boolean'))) throw failure(400, '请提交有效学生及由开关组成的完整节奏。');
    db.exec('BEGIN IMMEDIATE');
    try {
      const current = header(classId);
      if (data.revision !== current.revision) throw failure(409, '节奏已在其他页面更新，请刷新后重新编辑。');
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
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  };
  return { read, edit };
}
