import { listSounds, updateSound } from './storage.js';
import { capturePhoto, isStudentClient } from './student-client.js';
import { createObjectProp } from './student-avatar-data.js';
import './student-avatar.css';

// An opt-in integration view, kept apart from the once-only identity workflow.
// It edits a work's prop/photo without changing audio, rhythm or Plus images.
export function initStudentAvatar({ notify = () => {}, onSaved = async () => {} } = {}) {
  const enabled = new URLSearchParams(location.search).get('avatar-preview') === '1' || window.FreeImproAvatar?.preview === true;
  let ownerId = null, session = 0, version = 0, active, controller;
  const current = ticket => active && ticket === version;
  const clear = () => {
    ++version; controller?.destroy(); controller = undefined;
    const previous = active; active = undefined;
    if (previous?.open) previous.close(); previous?.remove();
  };
  const sessionChanged = user => {
    const next = typeof user?.id === 'string' ? user.id : null;
    if (next !== ownerId) { ownerId = next; ++session; clear(); }
  };
  window.addEventListener('freeimpro-student-session', event => sessionChanged(event.detail?.user));
  window.addEventListener('freeimpro-student-authenticated', event => sessionChanged(event.detail?.user));
  window.addEventListener('freeimpro-student-signed-out', () => sessionChanged(null));
  window.addEventListener('freeimpro-classroom-disconnected', () => { ++session; clear(); ownerId = null; });
  window.addEventListener('freeimpro-background', clear);
  window.addEventListener('pagehide', clear);

  async function open(workId = null) {
    if (!enabled) return;
    clear();
    const ticket = version, selectedSession = session, selectedOwner = ownerId;
    const dialog = active = document.createElement('dialog'); dialog.className = 'student-avatar-dialog';
    const bar = document.createElement('div'); bar.className = 'student-avatar-bar';
    const title = document.createElement('strong'); title.textContent = '小伙伴体验';
    const close = document.createElement('button'); close.className = 'secondary'; close.textContent = '关闭'; close.onclick = clear;
    bar.append(title, close);
    const loading = document.createElement('p'); loading.className = 'student-avatar-loading'; loading.setAttribute('role','status'); loading.textContent = '正在迎接小伙伴…';
    const host = document.createElement('div'); host.className = 'student-avatar-host';
    dialog.append(bar,loading,host); document.body.append(dialog);
    dialog.addEventListener('cancel', event => { event.preventDefault(); clear(); });
    dialog.addEventListener('close', () => { if (active === dialog) clear(); });
    dialog.showModal();
    const stillCurrent = () => current(ticket) && selectedSession === session && selectedOwner === ownerId;
    try {
      const work = workId ? (await listSounds()).find(item => item.id === workId) : null;
      if (!stillCurrent()) return;
      if (workId && !work) throw new Error('这份声音已被删除，请重新选择。');
      title.textContent = work ? `${work.name} · 小伙伴` : '小伙伴体验';
      const { mountStudentAvatar } = await import('./generated/student-avatar/runtime.js');
      if (!stillCurrent()) return;
      controller = mountStudentAvatar(host, {
        assetBase: new URL('./student-avatar-assets/', document.baseURI).href,
        ownsSystemTicker: true, // This view owns the student's only Pixi app.
        captureProvider: isStudentClient() ? ({ signal }) => capturePhoto({ signal }) : undefined,
        title: work ? '拍下声音的主人' : '我的小伙伴',
        initialProp: work?.objectProp?.ownerId === selectedOwner ? work.objectProp : undefined,
        disclosure: work ? '照片和手持物品保存在这份声音作品中。当前使用共享体验角色，不改变你的固定学生形象。' : '当前使用共享体验角色。拍照可体验持物；从声音详情进入后，才会保存到对应作品。',
        async onPropChanged(definition, metadata) {
          if (!stillCurrent() || !metadata.isCurrent()) throw new DOMException('已取消','AbortError');
          if (!workId) return;
          const prop = createObjectProp(definition, metadata, { ownerId: selectedOwner });
          const saved = await updateSound(workId, latest => {
            if (!stillCurrent() || !metadata.isCurrent()) return null;
            return { ...latest, objectProp: prop, propPhoto: metadata.photo };
          });
          if (!saved) throw new Error('这份声音已删除或操作已取消，本次未保存。');
          if (!stillCurrent() || !metadata.isCurrent()) return;
          await onSaved();
          notify('物品已保存在这份声音中。');
        },
        onError: error => { if (stillCurrent()) notify(error.message || '小伙伴暂时无法打开。',true); },
      });
      await controller.ready;
      if (!stillCurrent()) return;
      loading.hidden = true;
    } catch (error) {
      if (!stillCurrent() || error.name === 'AbortError') return;
      loading.hidden = false; loading.textContent = error.message || '小伙伴暂时无法打开，请关闭后重试。';
      notify(loading.textContent,true);
    }
  }
  if (enabled) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary student-avatar-open'; button.textContent = '小伙伴体验';
    button.addEventListener('click', () => { void open(); }); document.querySelector('.my-heading')?.append(button);
  }
  return { enabled, open, close: clear };
}
