import { classroomFetch, canUseClassroom } from './classroom-transport.js';
import { listSounds, updateSound, attachImageResult } from './storage.js';
import { toDataURL } from './images.js';

export function initStudentImages({ notify, onSaved, editIdentity }) {
  const root = document.createElement('section'); root.id = 'student-image-profile'; root.className = 'panel'; root.hidden = true;
  root.innerHTML = '<h2>我的形象</h2><img id="student-fixed-avatar" alt="固定学生形象" width="96" height="96" hidden><p id="student-profile-status" role="status"></p><button id="register-student-profile" class="secondary">注册学生账号</button><button id="create-student-avatar" class="secondary" hidden>制作固定形象</button><p class="muted">注册后可生成形象，每天一张；固定形象与作品配图共用额度。姓名可以重复。</p>';
  document.querySelector('#my-view .my-heading').after(root);
  const $ = id => root.querySelector('#' + id);
  let user = null, state = null, refreshing = false, version = 0;
  const cache = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
  const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
  async function api(path, data) {
    const response = await classroomFetch('/api/student' + path, { method: data ? 'POST' : 'GET', headers: data ? { 'Content-Type': 'application/json' } : {}, body: data ? JSON.stringify(data) : undefined, signal: AbortSignal.timeout(12000) });
    let result; try { result = await response.json(); } catch { throw new Error('暂时无法读取图片状态。'); }
    if (!response.ok) throw Object.assign(new Error(result.error || '申请暂时无法处理。'), { status: response.status }); return result;
  }
  function render() {
    root.hidden = !user; if (!user) return;
    $('register-student-profile').hidden = state?.registered === true;
    $('create-student-avatar').hidden = !state?.registered || state.hasAvatar;
    $('create-student-avatar').disabled = Boolean(state?.pendingJobId) || state?.remaining === 0;
    $('student-profile-status').textContent = state?.pendingJobId ? '图像生成中' : state?.hasAvatar ? `固定形象已保存 · 今日剩余 ${state.remaining} 张` : state?.registered ? `已注册 · 今日剩余 ${state.remaining} 张` : '连接课堂后，可以注册学生账号并制作固定形象。';
    const saved = read('fi-fixed-avatar-' + user.id); $('student-fixed-avatar').hidden = !saved;
    if (saved) $('student-fixed-avatar').src = saved; else $('student-fixed-avatar').removeAttribute('src');
  }
  async function refresh() {
    if (!user || !canUseClassroom() || refreshing) return;
    const ticket = version, selectedUser = user.id, current = () => ticket === version && user?.id === selectedUser;
    refreshing = true;
    try {
      const status = await api('/image-status'); if (!current()) return;
      if (status.userId !== selectedUser) { state = null; render(); return; }
      state = status; cache('fi-image-profile-' + selectedUser, status); render();
      if (status.hasAvatar && !read('fi-fixed-avatar-' + selectedUser)) {
        const response = await classroomFetch('/api/student/image-profile/avatar', { signal: AbortSignal.timeout(12000) });
        if (!response.ok) throw new Error('形象正在同步，请稍候。'); const avatar = await response.blob(), value = await toDataURL(avatar);
        if (!current()) return; cache('fi-fixed-avatar-' + selectedUser, value); render();
        window.dispatchEvent(new CustomEvent('freeimpro-image-result', { detail: { kind: 'identity', avatar } }));
      }
      const { jobs } = await api('/image-jobs'); if (!current()) return;
      const localRequest = read('fi-image-request-' + selectedUser);
      if (localRequest && jobs.some(job => job.id === localRequest.requestId && ['completed', 'rejected'].includes(job.status))) { try { localStorage.removeItem('fi-image-request-' + selectedUser); } catch {} }
      const sounds = await listSounds(); let changed = false;
      for (const job of jobs) {
        if (job.kind !== 'work') continue;
        const sound = sounds.find(s => s.id === job.workId && s.imageRequest?.id === job.id && s.imageRequest?.userId === selectedUser); if (!sound) continue;
        if (job.status === 'rejected') {
          changed = await updateSound(sound.id, s => s.imageRequest?.id === job.id && s.imageRequest?.userId === selectedUser ? { ...s, imageRequest: null } : null) || changed; continue;
        }
        if (job.status !== 'completed') continue;
        const response = await classroomFetch('/api/student/image-jobs/' + job.id + '/result', { signal: AbortSignal.timeout(12000) });
        if (!response.ok) continue; const avatar = await response.blob(); if (!current()) return;
        const attached = await attachImageResult(sound.id, job.id, selectedUser, avatar); changed = attached || changed;
        if (attached) window.dispatchEvent(new CustomEvent('freeimpro-image-result', { detail: { kind: 'work', workId: sound.id, jobId: job.id, avatar } }));
      }
      if (changed) await onSaved();
      window.dispatchEvent(new CustomEvent('freeimpro-image-status', { detail: state }));
    } catch { if (current()) $('student-profile-status').textContent = state?.pendingJobId ? '图像生成中 · 恢复连接后自动同步' : '暂时无法同步形象，可继续离线创作。'; }
    finally { refreshing = false; }
  }
  async function request({ kind, workId, workName, photo }) {
    if (!user || !canUseClassroom()) throw new Error('请先在“我的”连接课堂。');
    const selectedUser = user.id;
    await refresh(); if (user?.id !== selectedUser) throw new Error('课堂连接已更改，请重新申请。');
    if (!state?.registered) throw new Error('请先在“我的”注册学生账号。');
    if (kind === 'work' && !state.hasAvatar) throw new Error('请先在“我的”完成固定学生形象。');
    const photoData = await toDataURL(photo);
    if (user?.id !== selectedUser) throw new Error('课堂连接已更改，请重新申请。');
    const old = read('fi-image-request-' + selectedUser);
    const same = old && old.kind === kind && old.workId === workId && old.photo === photoData && (kind === 'identity' || old.workName === workName);
    const payload = same ? old : { requestId: crypto.randomUUID(), classId: state.classId, kind, ...(kind === 'work' ? { workId, workName } : {}), photo: photoData };
    if (!same && (state.remaining === 0 || state.pendingJobId)) throw new Error(state.pendingJobId ? '图像生成中，请等待当前申请完成。' : '今天的图片额度已使用，明天再来。');
    cache('fi-image-request-' + selectedUser, payload);
    if (kind === 'work') {
      const saved = await updateSound(workId, sound => ({ ...sound, photo, imageRequest: { id: payload.requestId, userId: selectedUser } }));
      if (!saved) throw new Error('声音已经删除，本次未申请。');
    }
    try {
      const result = await api('/image-jobs', payload);
      if (user?.id !== selectedUser) throw new Error('课堂连接已更改，申请将保留在原账号。');
      state = { ...state, remaining: 0, pendingJobId: result.job.status === 'completed' ? undefined : result.job.id }; render();
      if (kind === 'work') await onSaved(); await refresh(); return result.job;
    } catch (e) {
      // Retry an unknown network outcome with the same request ID. A rejected
      // request releases only the local marker, never a server daily allowance.
      if (e.status) {
        try { localStorage.removeItem('fi-image-request-' + selectedUser); } catch {}
        if (kind === 'work') await updateSound(workId, s => s.imageRequest?.id === payload.requestId ? { ...s, imageRequest: null } : null);
      }
      throw e;
    }
  }
  $('register-student-profile').onclick = async () => { $('register-student-profile').disabled = true; try { await api('/image-profile/register', {}); await refresh(); notify('学生账号已注册，可制作固定形象。'); } catch (e) { notify(e.message, true); } finally { $('register-student-profile').disabled = false; } };
  $('create-student-avatar').onclick = editIdentity;
  window.addEventListener('freeimpro-student-session', event => {
    const next = event.detail.user;
    if (user?.id !== next?.id) { version++; user = next; state = next ? read('fi-image-profile-' + next.id) : null; }
    render(); if (next) refresh();
  });
  window.addEventListener('freeimpro-classroom-disconnected', () => { version++; user = null; state = null; render(); });
  window.addEventListener('online', refresh);
  setInterval(() => { if (!document.hidden) refresh(); }, 6000);
  return { request, refresh, get status() { return state; } };
}
