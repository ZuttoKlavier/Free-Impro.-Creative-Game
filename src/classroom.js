import { clientRole, apiBase } from './client-role.js';
import QRCode from 'qrcode';
import { listSounds, outbox } from './storage.js';
import './classroom.css';
import { toDataURL } from './images.js';
import { teacherRoomMarkup, teacherWaitingMarkup, bindTeacherRoom } from './teacher-room.js';
import { rhythmMarkup, bindRhythmEditor } from './teacher-rhythm.js';
import { performanceMarkup, createTeacherPerformance } from './teacher-performance.js';
import { isStudentClient } from './student-client.js';
import { classroomRhythmMarkup } from './classroom-rhythm.js';
import { classroomFetch, isOfflineStudent, canUseClassroom } from './classroom-transport.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const readCache = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const writeCache = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
async function api(path, data) {
  let response;
  try { response = await classroomFetch(apiBase + path, { method: data ? 'POST' : 'GET', credentials: 'same-origin', headers: data ? { 'Content-Type': 'application/json' } : {}, body: data ? JSON.stringify(data) : undefined, signal: AbortSignal.timeout(12000) }); }
  catch (error) { throw new ApiError(isOfflineStudent() && !['AbortError', 'TimeoutError'].includes(error?.name) && error?.message ? error.message : '暂时连接不上课堂服务，作品已保留在本地。', 0); }
  if (response.status >= 500) throw new ApiError('课堂服务暂不可用，请稍后重试。', 0);
  let result; try { result = await response.json(); } catch { throw new ApiError('课堂服务响应异常，请重新启动课堂服务后重试。', 0); } if (!response.ok) throw new ApiError(result.error, response.status); return result;
}
const audioBase64 = async blob => { const bytes = new Uint8Array(await blob.arrayBuffer()); let text = ''; for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(text); };

export function initClassroom({ notify, show, stopPlayback }) {
  const root = document.getElementById('classroom-view');
  let user = null, rooms = [], selectedRoom = '', sounds = [], queue = [], online = true, refreshing = false, sending = false, authMode = 'login', signature = '', sessionVersion = 0;
  let teacherBinding = null, rhythmBinding = null, performance = null, layoutVersion = 0;
  let joinBase = new URL('/', location.href).href;
  const rhythmViews = new Map();
  const mediaURLs = new Set();
  const rhythmView = id => { if (!rhythmViews.has(id)) rhythmViews.set(id, {}); return rhythmViews.get(id); };
  const editing = () => teacherBinding?.busy || rhythmBinding?.busy || performance?.busy;
  const savingEdits = () => teacherBinding?.busy || rhythmBinding?.busy || performance?.editingPosition;
  const canLeave = () => { if (!editing()) return true; notify(document.fullscreenElement ? '请先退出全屏舞台。' : '请先等待编排保存完成；保存失败时可重试或重新载入。', true); return false; };
  const cacheKey = () => `fi-rooms-${user?.id}`;
  const getRoom = () => rooms.find(r => r.id === selectedRoom) || rooms[0];
  const pendingCode = new URLSearchParams(location.search).get('class') || '';
  root.innerHTML = `<div class="class-heading"><div><div class="eyebrow">CLASSROOM / 一起创作</div><h2>把你的声音，带进课堂</h2><p class="muted">登录后进入老师的课堂，选择一份声音分享。</p></div><div id="identity"></div></div>
    <p id="classroom-connection" hidden><a href="/connection" target="_blank" rel="noopener">平板连接与设备检查 ↗</a></p>
    <div id="connection-note" class="connection-note" hidden></div>
    <section id="auth-panel" class="panel auth-panel"><div class="auth-tabs"><button id="mode-login" class="active">登录</button><button id="mode-register">注册账号</button></div><form id="auth-form"><div id="register-fields" hidden><label>你的名字<input id="auth-name" maxlength="30" autocomplete="name" placeholder="老师认识的名字"></label><input id="auth-role" type="hidden" value="${clientRole}"></div><label>账号<input id="auth-username" required minlength="3" maxlength="32" pattern="[A-Za-z0-9_]+" autocomplete="username" placeholder="字母、数字或下划线"></label><label>密码<input id="auth-password" type="password" required minlength="8" maxlength="128" autocomplete="current-password" placeholder="至少 8 位字符"></label><p id="auth-error" class="inline-error" role="alert"></p><button id="auth-submit" class="primary" type="submit">登录</button></form><p class="muted">首次注册和登录需连接账号服务。已登录设备可在连接中断时查看本地课堂记录、准备作品。</p></section>
    <div id="signed-in" hidden><div class="class-tools"><form id="join-form" class="panel join-panel"><h3>加入课堂</h3><label for="class-code">老师给你的 6 位课堂码</label><div class="save-row"><input id="class-code" required inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="输入课堂码"><button class="primary">进入课堂</button></div><p class="muted">也可以用平板相机扫描教师展示的二维码。</p></form>
    <form id="create-form" class="panel" hidden><h3>创建课堂</h3><div class="create-fields"><label>课堂名称<input id="class-name" required maxlength="50" placeholder="例如：生活中的打击乐"></label><label>人数<input id="class-capacity" type="number" min="1" max="50" value="15" required></label><label>环境<select id="class-background"><option>教室</option><option>厨房</option><option>操场</option></select></label></div><button class="primary">创建并生成课堂码</button></form></div>
    <div class="class-list-heading"><h3>我的课堂</h3><button id="refresh-class" class="secondary">刷新状态</button></div><div id="room-list" class="room-list"></div><section id="room-detail"></section><section id="outbox-panel"></section></div>
    <dialog id="submit-dialog"><h2>提交这份声音？</h2><p id="submit-summary"></p><p class="muted">每人一份课堂作品。更换声音需教师接受；原声音会保留到接受为止。</p><form method="dialog" class="dialog-actions"><button class="secondary" value="cancel">取消</button><button class="primary" value="submit">确认提交</button></form></dialog>`;
  const $ = id => root.querySelector('#' + id);
  if (!isStudentClient()) fetch('/connection.json').then(async response => {
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return;
    const connection = await response.json(), url = new URL(connection.classroomUrl);
    if (url.protocol !== 'https:' || url.username || url.password) return;
    joinBase = url.href; $('classroom-connection').hidden = navigator.userAgent.includes('FreeImproTeacher/'); signature = ''; renderRooms();
  }).catch(() => {});
  if (clientRole === 'teacher') { $('join-form').remove(); $('submit-dialog').remove(); $('outbox-panel').remove(); } else { $('create-form').remove(); }
  $('auth-panel').querySelector('.muted').textContent = clientRole === 'teacher' ? '教师专用登录。现有教师账号可继续使用，学生账号请使用学生端。' : '学生专用登录。现有学生账号可继续使用。';
  if ($('class-code')) $('class-code').value = /^\d{6}$/.test(pendingCode) ? pendingCode : '';
  function setAuthMode(mode) { authMode = mode; $('register-fields').hidden = mode !== 'register'; $('auth-name').required = mode === 'register'; $('auth-password').autocomplete = mode === 'register' ? 'new-password' : 'current-password'; $('auth-submit').textContent = mode === 'register' ? '注册并登录' : '登录'; $('mode-login').classList.toggle('active', mode === 'login'); $('mode-register').classList.toggle('active', mode === 'register'); $('auth-error').textContent = '';
  }
  $('mode-login').onclick = () => setAuthMode('login'); $('mode-register').onclick = () => setAuthMode('register');
  if (clientRole === 'student') {
    $('auth-panel').querySelector('.auth-tabs').hidden = true;
    $('auth-username').parentElement.firstChild.textContent = '姓名';
    $('auth-username').removeAttribute('pattern'); $('auth-username').minLength = 1; $('auth-username').maxLength = 30; $('auth-username').placeholder = '请输入姓名';
    const code = $('auth-password'); code.parentElement.firstChild.textContent = '课堂码'; code.type = 'text'; code.inputMode = 'numeric'; code.pattern = '[0-9]{6}'; code.minLength = 6; code.maxLength = 6; code.autocomplete = 'off'; code.placeholder = '老师提供的 6 位课堂码'; code.value = /^\d{6}$/.test(pendingCode) ? pendingCode : '';
    $('auth-submit').textContent = '连接课堂';
    $('auth-panel').querySelector('.muted').textContent = '填写姓名和老师提供的课堂码，即可连接课堂，无需密码。';
  }
  function renderIdentity() {
    root.querySelector('.class-heading h2').textContent = clientRole === 'teacher' ? '布置一堂声音课堂' : '把你的声音，带进课堂';
    root.querySelector('.class-heading .muted').textContent = clientRole === 'teacher' ? '设置人数与场景，接收每位学生的声音伙伴。' : '填写姓名和课堂码，连接老师的课堂。';
    $('auth-panel').hidden = !!user; $('signed-in').hidden = !user;
    const shortcut = document.getElementById('account-shortcut'); if (shortcut) shortcut.textContent = user ? user.name : '登录 / 注册';
    $('identity').innerHTML = user ? `<span class="identity-name">${escape(user.name)} · ${user.role === 'teacher' ? '教师' : '学生'}</span><button id="logout" class="text-button">${clientRole === 'student' ? '退出连接' : '退出账号'}</button>` : '';
    if ($('logout')) $('logout').onclick = async () => {
      if (!canLeave()) return;
      try { performance?.stop(); if (isOfflineStudent()) await window.FreeImproClassroom.disconnect(); else await api('/logout', {}); sessionVersion++; user = null; rooms = []; queue = []; localStorage.removeItem('fi-' + clientRole + '-user'); signature = ''; renderIdentity(); renderRooms(); stopPlayback(); }
      catch (e) { notify('暂时无法完成安全退出，请恢复课堂连接后重试。', true); }
    };
    if ($('join-form')) $('join-form').hidden = user?.role !== 'student'; if ($('create-form')) $('create-form').hidden = user?.role !== 'teacher';
    $('connection-note').hidden = online; $('connection-note').textContent = '连接中断 · 以下为上次保存的课堂记录。可以继续创作并排队提交，恢复连接后发送。';
    if (clientRole === 'student') window.dispatchEvent(new CustomEvent('freeimpro-student-session', { detail: { user: online && canUseClassroom() ? user : null } }));
  }
  $('auth-form').onsubmit = async event => {
    event.preventDefault(); $('auth-submit').disabled = true; $('auth-error').textContent = '';
    try { const result = await api(clientRole === 'student' ? '/enter-classroom' : '/' + authMode, clientRole === 'student' ? { name: $('auth-username').value.trim(), code: $('auth-password').value.trim() } : { username: $('auth-username').value.trim(), password: $('auth-password').value, name: $('auth-name').value.trim(), role: $('auth-role').value }); user = result.user; online = true; sessionVersion++; writeCache('fi-' + clientRole + '-user', user); rooms = readCache(cacheKey()) || []; selectedRoom = ''; $('auth-password').value = ''; signature = ''; renderIdentity(); await refresh(); }
    catch (e) { $('auth-error').textContent = e.message; } finally { $('auth-submit').disabled = false; }
  };
  async function action(form, task) { const button = form.querySelector('button'); button.disabled = true; try { await task(); } catch (e) { notify(e.message, true); } finally { button.disabled = false; } }
  if ($('join-form')) $('join-form').onsubmit = event => { event.preventDefault(); action($('join-form'), async () => {
    const code = $('class-code').value;
    const cached = rooms.find(r => r.code === code && r.members.some(m => m.student_id === user?.id));
    const openCached = () => { selectedRoom = cached.id; online = false; renderIdentity(); renderRooms(); notify('已打开本地课堂记录，作品将在连接恢复并验证登录后发送。'); };
    if (!navigator.onLine && cached) { openCached(); return; }
    try { const result = await api('/join', { code }); selectedRoom = result.classroom.id; await refresh(); notify(result.classroom.members[0]?.admitted ? '已进入课堂，可以提交声音了。' : '课堂人数已满，已登记等待教师扩容。'); }
    catch (error) { if (error.status === 0 && cached) openCached(); else throw error; }
  }); };
  if ($('create-form')) $('create-form').onsubmit = event => { event.preventDefault(); if (!canLeave()) return; action($('create-form'), async () => { const result = await api('/classrooms', { name: $('class-name').value, capacity: Number($('class-capacity').value), background: $('class-background').value }); selectedRoom = result.classroom.id; await refresh(); notify('课堂已创建，把课堂码分享给学生。'); }); };
  $('refresh-class').onclick = () => refresh(true);
  function renderRooms() {
    if (editing()) return;
    const state = JSON.stringify({ user: user?.id, rooms, selectedRoom, sending, sounds: sounds.map(s => ({ id: s.id, name: s.name, rhythm: s.rhythm })), queue: queue.map(q => ({ key: q.key, name: q.name, error: q.error })) });
    if (signature === state) return;
    const focus = rhythmBinding?.captureFocus(); rhythmBinding?.destroy(); rhythmBinding = null;
    signature = state; teacherBinding = null;
    mediaURLs.forEach(url => URL.revokeObjectURL(url)); mediaURLs.clear();
    $('room-list').innerHTML = rooms.length ? rooms.map(r => `<button class="room-chip ${getRoom()?.id === r.id ? 'active' : ''}" data-room="${escape(r.id)}">${escape(r.name)}<small>${r.memberCount} / ${r.capacity} 人</small></button>`).join('') : '<p class="muted">还没有课堂。创建或输入课堂码后，就会出现在这里。</p>';
    $('room-list').querySelectorAll('[data-room]').forEach(button => button.onclick = () => { if (!canLeave()) return; selectedRoom = button.dataset.room; renderRooms(); });
    const room = getRoom(); $('room-detail').innerHTML = '';
    if (performance && (!room || user?.role !== 'teacher' || performance.roomId !== room.id)) { performance.dispose(); performance = null; }
    if (room && user) {
      const teacher = user.role === 'teacher';
      $('room-detail').innerHTML = `<div class="panel class-detail"><div class="room-title"><div><span class="section-kicker">${escape(room.background)} · ${room.memberCount} / ${room.capacity} 人</span><h2>${escape(room.name)}</h2></div><div class="room-code"><small>课堂码</small><strong>${escape(room.code)}</strong></div></div>${teacher ? teacherMarkup(room) : studentMarkup(room) + classroomRhythmMarkup(room, sounds, false, escape)}</div>`;
      if (teacher) {
        if (!performance) performance = createTeacherPerformance({ root, room, api, escape, notify,
          waitingMarkup: updated => teacherWaitingMarkup(updated, itemMarkup, escape),
          canPlay: () => { if (!rhythmBinding?.busy) return true; notify('节奏尚未保存，请先等待保存完成或重试。', true); return false; },
          receive: (updated, withLayout = false) => {
            layoutVersion++; rooms = rooms.map(r => r.id === updated.id ? { ...r, members: updated.members, memberCount: updated.memberCount, submissions: updated.submissions, performance: updated.performance, ...(withLayout ? { layout: updated.layout } : {}) } : r); writeCache(cacheKey(), rooms);
            const current = rooms.find(r => r.id === performance?.roomId); if (current) performance.sync(current);
          },
          settled: () => { signature = ''; renderRooms(); },
        });
        performance.sync(room); performance.attach();
        teacherBinding = bindTeacherRoom({ root, room, notify,
          begin: () => { layoutVersion++; },
          save: async (slot, x, y) => {
            const result = await api('/classrooms/' + room.id + '/layout', { slot, x, y });
            layoutVersion++; rooms = rooms.map(r => r.id === room.id ? result.classroom : r); writeCache(cacheKey(), rooms);
          },
          settled: (slot, message) => {
            signature = ''; renderRooms();
            root.querySelector(`[data-slot="${slot}"]`)?.focus({ preventScroll: true });
            if (message && $('layout-status')) $('layout-status').textContent = message;
          },
        });
        const updateRoom = result => { layoutVersion++; rooms = rooms.map(r => r.id === room.id ? result.classroom : r); writeCache(cacheKey(), rooms); performance?.sync(result.classroom); };
        rhythmBinding = bindRhythmEditor({ root, room, view: rhythmView(room.id), escape, notify,
          begin: () => { layoutVersion++; },
          save: async data => { const result = await api('/classrooms/' + room.id + '/arrangement', data); updateRoom(result); return result.classroom.arrangement; },
          reload: async () => updateRoom(await api('/classrooms/' + room.id)),
          settled: () => { signature = ''; renderRooms(); },
        });
        if (focus) root.querySelector(focus)?.focus({ preventScroll: true });
        const joinURL = new URL(joinBase); joinURL.search = '?class=' + room.code; joinURL.hash = '';
        const qr = $('room-qr'); QRCode.toDataURL(joinURL.href, { width: 140, margin: 1 }).then(url => { if (qr.isConnected) qr.src = url; }).catch(() => { if (qr.isConnected) qr.alt = '二维码生成失败，请使用课堂码'; });
        $('capacity-form').onsubmit = event => { event.preventDefault(); action($('capacity-form'), async () => { await api('/classrooms/' + room.id + '/capacity', { capacity: Number($('increase-capacity').value) }); await refresh(); }); };
        root.querySelectorAll('[data-rhythm-accept], [data-rhythm-reject]').forEach(button => button.onclick = async () => {
          if (savingEdits()) { notify('请先等待当前修改保存。'); return; }
          button.disabled = true;
          const requestId = button.dataset.rhythmAccept || button.dataset.rhythmReject;
          const request = room.rhythmRequests.find(r => r.requestId === requestId);
          try { const result = await api('/classrooms/' + room.id + '/rhythm-decision', { studentId: request.studentId, requestId, decision: button.dataset.rhythmAccept ? 'accept' : 'reject', revision: room.arrangement.revision }); updateRoom(result); renderRooms(); notify(button.dataset.rhythmAccept ? '节奏已接受；播放中从下一遍完整 loop 启用。' : '已保留原节奏。'); }
          catch (e) { notify(e.message, true); await refresh(); } finally { button.disabled = false; }
        });
      } else {
        if ($('send-sound')) $('send-sound').onclick = () => chooseSound(sounds.find(s => s.id === $('class-sound').value));
        if ($('send-rhythm')) $('send-rhythm').onclick = async () => {
          const sound = sounds.find(s => s.id === $('rhythm-sound').value), current = room.submissions.find(s => s.status === 'current');
          if (!sound?.rhythm || !current) return;
          try { await outbox('put', { key: user.id + ':' + room.id + ':rhythm', kind: 'rhythm', userId: user.id, classId: room.id, className: room.name, name: sound.name + ' · 节奏', rhythm: sound.rhythm, submissionId: current.id, requestId: crypto.randomUUID() }); await loadLocal(); renderRooms(); await flush(); } catch (e) { notify(e.message, true); }
        };
      }
      $('room-detail').querySelectorAll('.classroom-rhythm [aria-label="提交的节奏"]').forEach(el => { el.style.overflowWrap = 'anywhere'; });
    }
    if ($('outbox-panel')) $('outbox-panel').innerHTML = queue.length ? `<div class="panel queue-panel"><h3>待发送作品</h3>${queue.map(q => `<div class="queue-row"><div><strong>${escape(q.name)}</strong><p>${escape(q.className)} · ${escape(sending ? '正在发送…' : q.error || '等待发送')}</p></div><button class="text-button" data-cancel="${escape(q.key)}">取消发送</button></div>`).join('')}<button id="retry-queue" class="secondary">重试发送</button></div>` : '';
    if ($('retry-queue')) $('retry-queue').onclick = () => flush();
    root.querySelectorAll('[data-cancel]').forEach(b => b.onclick = async () => { if (sending) { notify('正在发送，请稍后再操作。'); return; } await outbox('delete', b.dataset.cancel); await loadLocal(); renderRooms(); });
    if (canUseClassroom()) root.querySelectorAll('[data-classroom-media]').forEach(async element => {
      try {
        const response = await classroomFetch(element.dataset.classroomMedia, { signal: AbortSignal.timeout(12000) });
        if (!response.ok) return;
        const blob = await response.blob(); if (!element.isConnected || !canUseClassroom()) return;
        const url = URL.createObjectURL(blob); mediaURLs.add(url); element.src = url;
      } catch { /* A media retry must not interrupt local creation or classroom polling. */ }
    });
  }
  const mediaAttribute = path => `${isOfflineStudent() ? 'data-classroom-media' : 'src'}="${path}"`;
  const itemMarkup = item => `<div class="submission-item">${item.has_image ? `<img class="submission-image" ${mediaAttribute(`${apiBase}/submissions/${escape(item.id)}/image`)} alt="${item.image_kind === 'avatar' ? '动漫形象' : '照片草稿'}">` : ''}<div><strong>${escape(item.name)}</strong><span class="status-pill ${item.status}">${item.enabled ? '已启用 · 正在演奏' : ({ current: '已接收', pending: '更换待接受', accepted: '已接受 · 等待循环切换', rejected: '更换未通过' })[item.status]}</span><p>${item.image_kind === 'photo' ? '照片草稿 · ' : ''}${item.duration.toFixed(3)} 秒 · ${new Date(item.created_at).toLocaleString('zh-CN')}</p></div><audio controls preload="none" ${mediaAttribute(`${apiBase}/submissions/${escape(item.id)}/audio`)} aria-label="试听 ${escape(item.name)}"></audio></div>`;
  function studentMarkup(room) {
    const admitted = room.members.find(m => m.student_id === user.id)?.admitted;
    return `${!admitted ? '<p class="waiting-note">课堂人数已满，等待教师扩容后即可提交。</p>' : ''}<div class="student-submissions">${room.submissions.length ? room.submissions.map(itemMarkup).join('') : '<p class="muted">还没有提交声音。请选择本地作品，将你的声音加入课堂。</p>'}</div><div class="submission-picker"><label for="class-sound">选择本地声音</label><div class="save-row"><select id="class-sound">${sounds.length ? sounds.map(s => `<option value="${escape(s.id)}">${escape(s.name)} · ${s.duration.toFixed(2)} 秒</option>`).join('') : '<option>先到声音库保存一份作品</option>'}</select><button id="send-sound" class="primary" ${!admitted || !sounds.length ? 'disabled' : ''}>${room.submissions.some(s => s.status === 'current') ? '申请更换声音' : '提交声音'}</button></div><p class="muted">作品中的照片或动漫形象会与声音一起提交。照片草稿会明确标注。</p></div>`;
  }
  function teacherMarkup(room) { return teacherRoomMarkup(room, itemMarkup, escape) + classroomRhythmMarkup(room, [], true, escape) + performanceMarkup(room, escape, teacherWaitingMarkup(room, itemMarkup, escape)) + rhythmMarkup(room, escape, rhythmView(room.id)); }
  async function loadLocal() { if (clientRole === 'teacher') { sounds = []; queue = []; return; } sounds = await listSounds(); queue = (await outbox('list')).filter(q => q.userId === user?.id); }
  async function refresh(explicit = false) {
    if (!canUseClassroom()) { await loadLocal(); renderIdentity(); renderRooms(); return; }
    if (refreshing) { if (explicit) setTimeout(() => refresh(true), 300); return; } refreshing = true;
    const version = sessionVersion, layoutAtStart = layoutVersion;
    try {
      const me = await api('/me'); if (version !== sessionVersion) return; user = me.user; online = true; writeCache('fi-' + clientRole + '-user', user);
      const result = await api('/classrooms'); if (version !== sessionVersion) return; if (layoutAtStart === layoutVersion && !savingEdits()) { rooms = result.classrooms; writeCache(cacheKey(), rooms); const current = rooms.find(r => r.id === performance?.roomId); if (current) performance.sync(current); }
    } catch (e) {
      if (version !== sessionVersion) return;
      if (e.status === 401 || e.status === 403) { user = null; rooms = []; localStorage.removeItem('fi-' + clientRole + '-user'); online = true; }
      else { online = false; user ||= readCache('fi-' + clientRole + '-user'); if (user?.role !== clientRole) user = null; if (user && !editing()) rooms = readCache(cacheKey()) || []; }
      if (explicit) notify(e.message, true);
    } finally { refreshing = false; await loadLocal(); renderIdentity(); renderRooms(); }
    if (online && user && queue.length) await flush();
  }
  let chosen;
  async function chooseSound(sound) {
    show(); if (!user) { notify('请先登录学生账号，再选择课堂提交。'); return; }
    if (user.role !== 'student') { notify('教师账号用于接收作品，请用学生账号提交。'); return; }
    if (!getRoom()) { notify('请先输入老师的课堂码。'); return; }
    if (!sound) { notify('请先在声音库保存一个声音。'); return; }
    const room = getRoom(); if (!room.members.find(m => m.student_id === user.id)?.admitted) { notify('课堂人数已满，正在等待教师扩容。'); return; }
    chosen = { sound, room, userId: user.id }; $('submit-summary').textContent = `将“${sound.name}”发送到“${room.name}”（${room.code}）。`; $('submit-dialog').showModal();
  }
  if ($('submit-dialog')) $('submit-dialog').onclose = async () => {
    if ($('submit-dialog').returnValue !== 'submit' || !chosen || chosen.userId !== user?.id) return;
    try { const { sound, room } = chosen; await outbox('put', { key: user.id + ':' + room.id, userId: user.id, classId: room.id, className: room.name, name: sound.name, blob: sound.blob, image: sound.avatar || sound.photo || null, imageKind: sound.avatar ? 'avatar' : sound.photo ? 'photo' : null, requestId: crypto.randomUUID() }); await loadLocal(); renderRooms(); await flush(); }
    catch (e) { notify('无法保存待发送作品，请检查本地存储空间。', true); }
  };
  async function flush() {
    if (sending || !user || !canUseClassroom()) return; sending = true; renderRooms(); const userId = user.id;
    try {
      const items = (await outbox('list')).filter(q => q.userId === userId);
      for (const item of items) {
        if (user?.id !== userId) break;
        try {
          const result = item.kind === 'rhythm'
            ? await api('/classrooms/' + item.classId + '/rhythm-request', { requestId: item.requestId, submissionId: item.submissionId, rhythm: item.rhythm })
            : await api('/classrooms/' + item.classId + '/submit', { name: item.name, requestId: item.requestId, audio: await audioBase64(item.blob), image: item.image ? await toDataURL(item.image) : null, imageKind: item.imageKind || null });
          // A new selection may have replaced this queued request during an upload.
          const current = (await outbox('list')).find(q => q.key === item.key); if (current?.requestId === item.requestId) await outbox('delete', item.key);
          if (user?.id !== userId) break;
          online = true; rooms = rooms.map(r => r.id === result.classroom.id ? result.classroom : r); writeCache(cacheKey(), rooms); notify(item.kind === 'rhythm' ? '节奏已发送，等待教师接受。' : result.classroom.submissions.some(s => s.status === 'pending') ? '更换申请已发送，等待教师接受。' : '声音已被课堂接收。');
        } catch (e) {
          const current = (await outbox('list')).find(q => q.key === item.key); if (current?.requestId === item.requestId) await outbox('put', { ...item, error: e.message });
          if (!e.status) online = false;
          if (e.status === 401) { sessionVersion++; user = null; localStorage.removeItem('fi-' + clientRole + '-user'); }
          notify(e.message, true); break;
        }
      }
    } finally { sending = false; await loadLocal(); renderIdentity(); renderRooms(); }
  }
  window.addEventListener('online', () => refresh());
  window.addEventListener('freeimpro-classroom-disconnected', () => { sessionVersion++; user = null; rooms = []; queue = []; online = true; signature = ''; renderIdentity(); renderRooms(); });
  window.addEventListener('sounds-changed', () => loadLocal().then(renderRooms));
  setInterval(() => { if (!document.hidden && !root.hidden && user) refresh(); }, 8000);
  renderIdentity(); refresh();
  if (/^\d{6}$/.test(pendingCode)) queueMicrotask(show);
  return { refresh, chooseSound };
}
