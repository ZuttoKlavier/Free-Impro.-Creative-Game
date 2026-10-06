// The Android bridge exposes classroom actions and one explicitly shared file.
// It has no open-URL, filesystem-path, intent-launch or network-request method.
export function installAndroidStudentBridge() {
  const native = window.FreeImproAndroid;
  if (!native || !navigator.userAgent.includes('FreeImproStudent/') || window.__androidStudentBridgeInstalled) return;
  const heading = document.querySelector('.my-heading');
  if (!heading) {
    const observer = new MutationObserver(() => { if (document.querySelector('.my-heading')) { observer.disconnect(); installAndroidStudentBridge(); } });
    observer.observe(document.documentElement, { childList: true, subtree: true }); return;
  }
  window.__androidStudentBridgeInstalled = true;
  // Android's native false means a failed MediaStore publish. Preserve that
  // error while the shared export API reserves false for a cancelled save.
  const files = window.FreeImproFiles;
  if (files) window.FreeImproFiles = {
    begin: (name, mime) => files.begin(name, mime), append: (id, chunk) => files.append(id, chunk),
    finish: id => { if (!files.finish(id)) throw new Error('文件尚未保存成功，请重试。'); return true; },
    cancel: id => files.cancel?.(id),
  };
  const status = document.createElement('p'); status.className = 'muted'; status.setAttribute('role', 'status'); heading.append(status);
  const button = (label, parent, action) => { const element = document.createElement('button'); element.className = 'text-button'; element.textContent = label; element.onclick = action; parent.append(element); return element; };
  button('连接设置', heading, () => native.settings());
  const requests = new Map();
  window.addEventListener('freeimpro-android-result', ({ detail }) => {
    const pending = requests.get(detail?.id); if (!pending) return;
    requests.delete(detail.id); clearTimeout(pending.timeout); detail.error ? pending.reject(new Error(detail.error)) : pending.resolve(detail.value);
  });
  window.addEventListener('pagehide', () => { for (const [id, request] of requests) { clearTimeout(request.timeout); native.cancelScanRequest?.(id); request.resolve(''); } requests.clear(); });
  const scan = button('扫描课堂码', heading, async () => {
    scan.disabled = true; status.textContent = '';
    try {
      const id = crypto.randomUUID();
      const code = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { requests.delete(id); native.cancelScanRequest?.(id); reject(new Error('扫码已结束，可以手动填写课堂码。')); }, 120000);
        requests.set(id, { resolve, reject, timeout });
        if (native.scanClassroom(id) === false) { requests.delete(id); clearTimeout(timeout); reject(new Error('页面正在准备，请稍后再扫码。')); }
      });
      if (!code) return;
      if (!/^[0-9]{6}$/.test(code)) throw new Error('这不是有效课堂码。');
      for (const input of document.querySelectorAll('#auth-password, #class-code')) { input.value = code; input.dispatchEvent(new Event('input', { bubbles: true })); }
      status.textContent = '课堂码已填写，请确认姓名后连接课堂。';
    } catch (error) { status.textContent = error.message || '扫码失败，可以手动填写课堂码。'; }
    finally { scan.disabled = false; }
  });
  const importInfo = document.createElement('p'); importInfo.className = 'muted'; heading.append(importInfo);
  const importButton = button('导入收到的备份', heading, () => importPending(false));
  const cancelImport = button('取消收到的文件', heading, () => { if (pending) native.finishImport(pending.token); refreshImport(); });
  let pending = null, importing = false, photoButton;
  function refreshImport() {
    try { const raw = native.pendingImport(); pending = raw ? JSON.parse(raw) : null; }
    catch { pending = null; }
    if (pending && (typeof pending.token !== 'string' || typeof pending.name !== 'string' || !Number.isFinite(pending.size) || pending.size <= 0 || !['application/json', 'image/jpeg', 'image/png', 'image/webp'].includes(pending.type))) pending = null;
    const backup = pending?.type === 'application/json';
    importInfo.textContent = pending ? backup ? '已收到备份：' + pending.name + '。确认后合并导入，原有作品保留。' : '已收到照片：' + pending.name + '。先在声音详情选择“制作形象”，再导入这张照片。' : '旧备份或照片可从系统文件或相册分享至“声音课堂 · 学生”，再在应用中确认导入。';
    importButton.hidden = !backup; cancelImport.hidden = !pending;
    if (!photoButton && document.querySelector('.photo-actions')) photoButton = button('导入收到的照片', document.querySelector('.photo-actions'), () => importPending(true));
    if (photoButton) photoButton.hidden = !pending || backup;
  }
  async function confirmImport(item, photo) {
    const dialog = document.createElement('dialog'), title = document.createElement('h2'), text = document.createElement('p'), actions = document.createElement('div');
    title.textContent = photo ? '导入这张照片？' : '导入这份备份？';
    text.textContent = item.name + (photo ? ' 将进入当前声音的照片裁切。保存后才绑定作品，不自动上传。' : ' 将合并到本机声音库，相同 ID 跳过；无效或超额备份不会写入。');
    actions.className = 'dialog-actions'; dialog.append(title, text, actions); document.body.append(dialog);
    return new Promise(resolve => {
      let confirmed = false;
      button('取消', actions, () => dialog.close());
      button('确认导入', actions, () => { confirmed = true; dialog.close(); });
      dialog.addEventListener('close', () => { dialog.remove(); resolve(confirmed); }, { once: true }); dialog.showModal();
    });
  }
  async function importPending(photo) {
    if (!pending || importing || photo !== pending.type.startsWith('image/')) return;
    const item = { ...pending }, input = document.getElementById(photo ? 'photo-file' : 'backup-file'), selectedSound = document.getElementById('character-sound')?.value;
    if (!input || photo && !selectedSound) { status.textContent = '请先选择要制作形象的声音作品。'; return; }
    if (input.dataset.importing === 'true' || photo && document.getElementById('character-controls')?.inert) { status.textContent = '请等待上一项操作完成，再导入收到的文件。'; return; }
    importing = true;
    try {
      if (!await confirmImport(item, photo)) return;
      const maximum = photo ? 10 * 1024 * 1024 : 250 * 1024 * 1024;
      if (item.size > maximum) throw new Error('文件过大，请选择较小的文件。');
      const chunks = []; let offset = 0;
      while (offset < item.size) {
        const encoded = native.readImport(item.token, offset); if (!encoded) throw new Error('文件已变化或无法读取，请重新分享。');
        const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
        if (!bytes.length || bytes.length > 48 * 1024 || offset + bytes.length > item.size) throw new Error('文件内容无效，请重新分享。');
        chunks.push(bytes); offset += bytes.length;
        // Allow the UI to remain responsive while restoring large image backups.
        if (chunks.length % 16 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      }
      if (photo && document.getElementById('character-sound')?.value !== selectedSound) throw new Error('选择的声音已变化，请重新确认照片导入。');
      if (input.dataset.importing === 'true' || photo && document.getElementById('character-controls')?.inert) throw new Error('请等待上一项操作完成，再导入收到的文件。');
      const transfer = new DataTransfer(); transfer.items.add(new File(chunks, item.name, { type: item.type }));
      input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true })); native.finishImport(item.token);
      status.textContent = photo ? '照片已送入裁切，确认后保存到所选声音。' : '备份已交给声音库检查，请查看导入结果。'; refreshImport();
    } catch (error) { status.textContent = error.message || '文件导入失败，原有作品保留。'; }
    finally { importing = false; }
  }
  window.addEventListener('freeimpro-android-import', refreshImport);
  window.addEventListener('sounds-changed', refreshImport);
  refreshImport();
}
