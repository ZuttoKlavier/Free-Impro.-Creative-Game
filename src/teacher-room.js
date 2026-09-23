import './teacher-room.css';

export function teacherRoomMarkup(room, itemMarkup, escape) {
  const received = new Set(room.submissions.filter(s => s.status === 'current').map(s => s.student_id));
  const pending = room.submissions.filter(s => s.status === 'pending').length;
  const waiting = room.members.filter(m => !m.admitted).length;
  const environment = ({ 教室: 'classroom', 厨房: 'kitchen', 操场: 'playground' })[room.background];
  const members = room.members.filter(m => m.admitted);
  const stat = (label, value) => `<div><strong>${value}</strong><span>${label}</span></div>`;
  return `<div class="teacher-summary" aria-label="课堂统计">${stat('已入课 / 名额', `${room.memberCount} / ${room.capacity}`)}${stat('已收到作品', received.size)}${stat('尚未提交', Math.max(0, room.memberCount - received.size))}${stat('待处理更换', pending)}${stat('等待扩容', waiting)}</div>
    <div class="teacher-tools"><div><h3>邀请学生加入课堂</h3><p class="muted">输入上方课堂码，或用平板相机扫描右侧二维码。平板和教师电脑需访问同一个局域网地址。</p><form id="capacity-form"><label for="increase-capacity">课堂人数</label><input id="increase-capacity" type="number" min="${room.capacity}" max="50" value="${room.capacity}" required><button class="secondary">更新人数</button></form><p class="muted">最多 50 人，增加名额会保留已有学生的位置。</p></div><img id="room-qr" alt="加入课堂二维码" width="140" height="140"></div>
    <div class="teacher-preparation"><section class="teacher-scene-panel"><div class="teacher-section-title"><div><span class="section-kicker">01 / 布置课堂</span><h3>${escape(room.background)} · 场景位置预览</h3></div><span class="pill">${room.capacity} 个预留位置</span></div><p id="place-help" class="muted">拖动编号调整位置，松手后保存。也可选中编号，使用方向键微调。</p><div class="teacher-scene ${environment}${room.capacity > 25 ? ' many-places' : ''}" aria-label="${escape(room.background)}场景预留位置"><div class="scene-decoration" aria-hidden="true"><span>${room.background === '教室' ? '♪ 声音课堂 ♫' : room.background === '厨房' ? '生活的节奏' : '一起听见世界'}</span></div>${(room.layout || []).map(p => {
      const member = members.find(m => m.slot === p.slot);
      const label = `${p.slot}号位置${member ? ' · ' + member.name : ' · 待分配'}`;
      return `<button class="place-marker${member ? ' assigned' : ''}" data-slot="${p.slot}" style="left:${p.x * 100}%;top:${p.y * 100}%" aria-label="${escape(label)}" aria-describedby="place-help" title="${escape(label)}">${p.slot}</button>`;
    }).join('')}</div><p id="layout-status" role="status" class="muted">位置保存在这间课堂，刷新后仍会保留。</p><p class="scene-explanation">这里仅显示编号位置。角色留在等待区，后续参与演奏时才进入场景。</p></section>
    <section class="teacher-waiting"><div class="teacher-section-title"><div><span class="section-kicker">02 / 收集声音</span><h3>作品等待区</h3></div><span class="pill teal">${received.size} 份作品</span></div><p class="muted">先听一听大家的声音。新的更换申请不会覆盖原作品，直到你接受。</p><div class="teacher-roster">${members.length ? members.map(member => `<article class="member-card" data-member-slot="${member.slot}"><h3><span class="member-place">${member.slot}</span>${escape(member.name)} <span class="status-pill">${received.has(member.student_id) ? '等待演奏' : '等待提交'}</span></h3>${room.submissions.filter(s => s.student_id === member.student_id).map(item => itemMarkup(item) + (item.status === 'pending' ? `<div class="decision-actions"><button class="primary" data-id="${escape(item.id)}" data-decision="accept">接受更换</button><button class="secondary" data-id="${escape(item.id)}" data-decision="reject">保留原声音</button></div>` : '')).join('') || '<p class="muted">尚未提交作品，已保留场景位置。</p>'}</article>`).join('') : '<div class="waiting-empty"><span>♫</span><h3>等待第一位声音伙伴</h3><p>学生加入并提交后，作品会自动出现在这里。</p></div>'}</div></section></div>
    ${waiting ? `<section class="expansion-queue"><h3>等待教师扩容 · ${waiting} 人</h3><p class="muted">增加上方课堂人数后，按入课顺序分配名额。</p><div>${room.members.filter(m => !m.admitted).map(m => `<span class="status-pill">${escape(m.name)}</span>`).join('')}</div></section>` : ''}`;
}

export function bindTeacherRoom({ root, room, save, settled, notify, begin }) {
  const stage = root.querySelector('.teacher-scene'), status = root.querySelector('#layout-status');
  let drag = null, saving = false;
  const clamp = n => Math.max(.05, Math.min(.95, n));
  const showPosition = (marker, position) => { marker.style.left = position.x * 100 + '%'; marker.style.top = position.y * 100 + '%'; };
  const highlight = slot => {
    root.querySelectorAll('[data-member-slot]').forEach(card => card.classList.toggle('place-highlight', Number(card.dataset.memberSlot) === slot));
  };
  async function persist(marker, position, previous) {
    saving = true; status.textContent = '正在保存位置…';
    try { await save(Number(marker.dataset.slot), position.x, position.y); status.textContent = '位置已保存'; }
    catch (e) { showPosition(marker, previous); status.textContent = '保存失败，已恢复原位置。'; notify(e.message || '位置保存失败，请重试。', true); }
    finally { saving = false; settled(Number(marker.dataset.slot), status.textContent); }
  }
  for (const marker of stage.querySelectorAll('.place-marker')) {
    const place = room.layout.find(p => p.slot === Number(marker.dataset.slot));
    marker.onfocus = () => highlight(place.slot);
    marker.onblur = () => highlight(null);
    marker.onpointerdown = event => {
      if (saving || drag || !event.isPrimary || event.button !== 0) return;
      begin(); event.preventDefault(); marker.focus({ preventScroll: true });
      drag = { marker, id: event.pointerId, startX: event.clientX, startY: event.clientY, previous: { x: place.x, y: place.y }, position: { x: place.x, y: place.y } };
      marker.setPointerCapture(event.pointerId); marker.classList.add('dragging');
    };
    marker.onpointermove = event => {
      if (!drag || drag.id !== event.pointerId) return;
      const bounds = stage.getBoundingClientRect();
      drag.position = { x: clamp(drag.previous.x + (event.clientX - drag.startX) / bounds.width), y: clamp(drag.previous.y + (event.clientY - drag.startY) / bounds.height) };
      showPosition(marker, drag.position);
    };
    const end = (event, cancel = false) => {
      if (!drag || drag.id !== event.pointerId) return;
      const saved = drag; drag = null; marker.classList.remove('dragging');
      if (marker.hasPointerCapture(event.pointerId)) marker.releasePointerCapture(event.pointerId);
      if (cancel) { showPosition(marker, saved.previous); settled(place.slot); return; }
      if (saved.previous.x === saved.position.x && saved.previous.y === saved.position.y) { settled(place.slot); return; }
      persist(marker, saved.position, saved.previous);
    };
    marker.onpointerup = end; marker.onpointercancel = event => end(event, true); marker.onlostpointercapture = event => end(event, true);
    marker.onkeydown = event => {
      const direction = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] })[event.key];
      if (!direction) return; event.preventDefault(); if (saving || drag) return;
      begin(); const amount = event.shiftKey ? .05 : .01, position = { x: clamp(place.x + direction[0] * amount), y: clamp(place.y + direction[1] * amount) };
      showPosition(marker, position); persist(marker, position, place);
    };
  }
  return { get busy() { return saving || !!drag; } };
}
