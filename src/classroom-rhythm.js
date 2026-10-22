export function classroomRhythmMarkup(room, sounds, teacher, escape) {
  const requests = room.rhythmRequests || [], bars = room.arrangement?.bars || 1;
  const status = { pending: '待教师接受', accepted: '教师已接受', rejected: '教师未接受' };
  const list = requests.map(r => {
    let heldUntil = -1;
    const pattern = r.rhythm.steps.map((s, i) => {
      const held = i < heldUntil;
      if (typeof s === 'number') heldUntil = i + s;
      return `${i && i % 16 === 0 ? ' / ' : ''}${typeof s === 'number' ? '●' : held ? '━' : s ? '●' : '·'}`;
    }).join('');
    return `<article class="panel"><strong>${escape(room.members.find(m => m.student_id === r.studentId)?.name || '我的节奏')}</strong><p>${r.rhythm.bars} 小节 · ${status[r.status]}</p><p aria-label="提交的节奏">${pattern}</p>${teacher && r.status === 'pending' ? `<button class="primary" data-rhythm-accept="${escape(r.requestId)}">接受节奏</button> <button class="secondary" data-rhythm-reject="${escape(r.requestId)}">保留原节奏</button>` : ''}</article>`;
  }).join('');
  const choices = sounds.filter(s => s.rhythm);
  const picker = teacher || !choices.length ? '' : `<label>选择已保存的节奏<select id="rhythm-sound">${choices.map(s => `<option value="${escape(s.id)}">${escape(s.name)} · ${s.rhythm.bars} 小节</option>`).join('')}</select></label><button id="send-rhythm" class="primary" ${!room.submissions.some(s => s.status === 'current') ? 'disabled' : ''}>提交节奏给教师</button>`;
  if (!teacher && !list && !picker) return '';
  return `<section class="panel classroom-rhythm"><h3>${teacher ? '学生节奏申请' : '节奏'}</h3>${teacher ? `<p>课堂为 ${bars} 小节。短节奏重复填满，长节奏取前 ${bars} 小节。</p>` : ''}${list || (teacher ? '<p>暂无节奏申请。</p>' : '')}${picker}</section>`;
}
