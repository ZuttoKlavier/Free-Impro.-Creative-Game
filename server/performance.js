import { applySubmissionRhythm } from './arrangement.js';
import { validateRhythm } from '../src/rhythm-data.js';
const failure = (status, message) => Object.assign(new Error(message), { status });

export function createPerformanceStore(db, now = Date.now) {
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS one_accepted ON submissions(class_id,student_id) WHERE status='accepted'");
  const sessions = new Map();
  const live = id => { const state = sessions.get(id); return state?.playing && now() - state.updatedAt < 30000 ? state : null; };
  const read = id => {
    const state = live(id);
    return { playing: !!state, activeStudentIds: state?.activeStudentIds || [], updatedAt: sessions.get(id)?.updatedAt ?? null };
  };
  const stage = id => {
    const state = live(id);
    return { ...read(id), timeline: state?.timeline || null, serverNow: now() };
  };
  function checkOwner(id, clientId) {
    const current = live(id);
    if (current && current.clientId !== clientId) throw failure(409, '这间课堂正在另一个教师窗口演奏，请先在那里停止。');
  }
  function report(id, data) {
    if (typeof data.clientId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(data.clientId) || typeof data.playing !== 'boolean' || !Array.isArray(data.activeStudentIds) || data.activeStudentIds.length > 50 || new Set(data.activeStudentIds).size !== data.activeStudentIds.length || data.activeStudentIds.some(value => typeof value !== 'string') || (!data.playing && data.activeStudentIds.length)) throw failure(400, '演奏状态无效。');
    checkOwner(id, data.clientId);
    for (const studentId of data.activeStudentIds) {
      if (!db.prepare("SELECT 1 FROM members m JOIN submissions s ON s.class_id=m.class_id AND s.student_id=m.student_id WHERE m.class_id=? AND m.student_id=? AND m.admitted=1 AND s.status='current'").get(id, studentId)) throw failure(400, '参与演奏的学生需已入课并提交声音。');
    }
    let timeline = null;
    if (data.playing && data.timeline != null) {
      const t = data.timeline;
      if (!Number.isFinite(t.bpm) || t.bpm < 40 || t.bpm > 240 || !Number.isFinite(t.swing) || t.swing < 0 || t.swing > .5 || !Number.isFinite(t.volume) || t.volume < 0 || t.volume > 1 || !Number.isInteger(t.bars) || t.bars < 1 || t.bars > 16 || !Number.isSafeInteger(t.loop) || t.loop < 0 || !Number.isFinite(t.remaining) || t.remaining < 0 || t.remaining > t.bars * 240 / t.bpm + 1 || !Array.isArray(t.tracks) || t.tracks.length !== data.activeStudentIds.length || new Set(t.tracks.map(track => track.id)).size !== t.tracks.length) throw failure(400, '舞台同步状态无效。');
      const tracks = t.tracks.map(track => {
        if (!data.activeStudentIds.includes(track.id) || !Number.isFinite(track.volume) || track.volume < 0 || track.volume > 1 || ![track.position?.x, track.position?.y].every(n => Number.isFinite(n) && n >= 0 && n <= 1) || !db.prepare("SELECT 1 FROM submissions WHERE id=? AND class_id=? AND student_id=? AND status='current'").get(track.submissionId, id, track.id)) throw failure(400, '舞台声部无效。');
        let pattern;
        try { pattern = validateRhythm({ bars: t.bars, steps: track.pattern }).steps; } catch { throw failure(400, '舞台节奏无效。'); }
        return { id: track.id, submissionId: track.submissionId, pattern, volume: track.volume, position: { x: track.position.x, y: track.position.y } };
      });
      timeline = { bpm: t.bpm, swing: t.swing, volume: t.volume, bars: t.bars, loop: t.loop, remaining: t.remaining, tracks };
    }
    sessions.set(id, { clientId: data.clientId, playing: data.playing, activeStudentIds: [...data.activeStudentIds], timeline, updatedAt: now() });
  }
  function activate(id, data) {
    checkOwner(id, data.clientId);
    if (!Array.isArray(data.submissionIds) || !data.submissionIds.length || data.submissionIds.length > 50 || new Set(data.submissionIds).size !== data.submissionIds.length || data.submissionIds.some(value => typeof value !== 'string')) throw failure(400, '请选择需要启用的作品。');
    db.exec('BEGIN IMMEDIATE');
    try {
      const items = data.submissionIds.map(submissionId => {
        const item = db.prepare('SELECT * FROM submissions WHERE id=? AND class_id=?').get(submissionId, id);
        if (!item) throw failure(404, '作品不属于这个课堂。');
        if (!['accepted', 'current'].includes(item.status)) throw failure(409, '作品已更新，请重新加载后再启用。');
        return item;
      });
      for (const item of items) if (item.status === 'accepted') {
        db.prepare("UPDATE submissions SET status='superseded',audio=NULL,image=NULL WHERE class_id=? AND student_id=? AND status='current'").run(id, item.student_id);
        db.prepare("UPDATE submissions SET status='current' WHERE id=?").run(item.id);
        applySubmissionRhythm(db, item);
      }
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  return { read, stage, report, activate, checkOwner };
}
