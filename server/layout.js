// Positions belong to numbered places, so changing a student's work never moves it.
export function createLayoutStore(db) {
  if (!db.prepare('PRAGMA table_info(members)').all().some(c => c.name === 'slot')) db.exec('ALTER TABLE members ADD COLUMN slot INTEGER');
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS member_slot ON members(class_id,slot) WHERE slot IS NOT NULL;
    CREATE TABLE IF NOT EXISTS classroom_places(class_id TEXT NOT NULL REFERENCES classrooms(id),slot INTEGER NOT NULL,x REAL NOT NULL,y REAL NOT NULL,PRIMARY KEY(class_id,slot));`);
  const read = classId => db.prepare('SELECT slot,x,y FROM classroom_places WHERE class_id=? ORDER BY slot').all(classId);
  function ensure(room) {
    const places = read(room.id), initial = !places.length;
    const cols = Math.ceil(Math.sqrt(room.capacity * 1.7)), rows = Math.ceil(room.capacity / cols);
    const candidates = Array.from({ length: 50 }, (_, i) => ({ x: .08 + (i % 10) * .84 / 9, y: .18 + Math.floor(i / 10) * .68 / 4 }));
    for (let slot = 1; slot <= room.capacity; slot++) {
      if (places.some(p => p.slot === slot)) continue;
      let position;
      if (initial) {
        const index = slot - 1, row = Math.floor(index / cols), count = Math.min(cols, room.capacity - row * cols);
        position = { x: count === 1 ? .5 : .1 + (index % cols) * .8 / (count - 1), y: rows === 1 ? .55 : .22 + row * .6 / (rows - 1) };
      } else {
        const distance = point => Math.min(...places.map(p => Math.hypot(point.x - p.x, point.y - p.y)));
        position = candidates.reduce((best, p) => distance(p) > distance(best) ? p : best);
      }
      const place = { slot, ...position }; places.push(place);
      db.prepare('INSERT INTO classroom_places VALUES(?,?,?,?)').run(room.id, slot, place.x, place.y);
    }
  }
  function assign(classId, studentId) {
    const member = db.prepare('SELECT admitted,slot FROM members WHERE class_id=? AND student_id=?').get(classId, studentId);
    if (!member?.admitted || member.slot != null) return;
    const place = db.prepare('SELECT slot FROM classroom_places p WHERE class_id=? AND NOT EXISTS(SELECT 1 FROM members m WHERE m.class_id=p.class_id AND m.slot=p.slot) ORDER BY slot LIMIT 1').get(classId);
    if (place) db.prepare('UPDATE members SET slot=? WHERE class_id=? AND student_id=?').run(place.slot, classId, studentId);
  }
  // Upgrade existing classrooms without changing accounts, works, or memberships.
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const room of db.prepare('SELECT id,capacity FROM classrooms').all()) {
      ensure(room);
      for (const member of db.prepare('SELECT student_id FROM members WHERE class_id=? AND admitted=1 ORDER BY joined_at,rowid').all(room.id)) assign(room.id, member.student_id);
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { read, ensure, assign, move(classId, slot, x, y) { db.prepare('UPDATE classroom_places SET x=?,y=? WHERE class_id=? AND slot=?').run(x, y, classId, slot); } };
}
