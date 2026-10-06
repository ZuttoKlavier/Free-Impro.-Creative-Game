export function classroomRhythmMarkup(room, sounds, teacher, escape) {
  const requests = room.rhythmRequests || [], bars = room.arrangement?.bars || 1;
  const status = { pending: '待教师接受', accepted: '教师已接受 · 演奏中由下一遍启用', rejected: '教师未接受' };
  const list = requests.map(r => `<article class="panel"><strong>${escape(room.members.find(m => m.student_id === r.studentId)?.name || '我的节奏')}</strong><p>${r.rhythm.bars} 小节 · ${status[r.status]}</p><p aria-label="提交的节奏">${r.rhythm.steps.map((s, i) => `${i && i % 16 === 0 ? ' / ' : ''}${s ? '●' : '·'}`).join('')}</p>${teacher && r.status === 'pending' ? `<button class="primary" data-rhythm-accept="${escape(r.requestId)}">接受节奏</button> <button class="secondary" data-rhythm-reject="${escape(r.requestId)}">保留原节奏</button>` : ''}</article>`).join('');
  const choices = sounds.filter(s => s.rhythm);
  const picker = teacher ? '' : `<label>选择已保存的节奏<select id="rhythm-sound">${choices.map(s => `<option value="${escape(s.id)}">${escape(s.name)} · ${s.rhythm.bars} 小节</option>`).join('')}</select></label><button id="send-rhythm" class="primary" ${!choices.length || !room.submissions.some(s => s.status === 'current') ? 'disabled' : ''}>提交节奏给教师</button><p>请先在声音库点击“节奏编创”并保存，再提交声音到课堂。此处只提交节奏，应用于你当前的课堂声音。</p>`;
  return `<section class="panel classroom-rhythm"><h3>${teacher ? '学生节奏申请' : '我的课堂节奏'}</h3><p>课堂为 ${bars} 小节。短节奏重复填满，长节奏取前 ${bars} 小节。教师接受后更新你的轨道；本地作品保留原稿。</p>${list || '<p>暂无节奏申请。</p>'}${picker}</section>`;
}
