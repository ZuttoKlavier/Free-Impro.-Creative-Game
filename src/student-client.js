export const isStudentClient = () => navigator.userAgent.includes('FreeImproStudent/');

export async function exportLocalFile(blob, name) {
  if (!isStudentClient()) {
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000); return;
  }
  const files = window.FreeImproFiles;
  if (!files) throw new Error('本机文件服务不可用，请重新打开学生客户端。');
  const id = files.begin(name, blob.type);
  if (!id) throw new Error('无法创建本地文件，请检查设备剩余空间。');
  let completed = false;
  try {
    for (let offset = 0; offset < blob.size; offset += 48 * 1024) {
      const bytes = new Uint8Array(await blob.slice(offset, offset + 48 * 1024).arrayBuffer());
      const encoded = btoa(String.fromCharCode(...bytes));
      if (!files.append(id, encoded)) throw new Error('文件保存失败，请检查剩余空间，备份最大 250 MB。');
    }
    if (!files.finish(id)) throw new Error('文件尚未保存成功，请重试。');
    completed = true;
  } finally {
    if (!completed) files.cancel?.(id);
  }
}

// Capture inside the student application; do not launch a camera/gallery app.
export function capturePhoto() {
  return new Promise((resolve, reject) => {
    const dialog = document.createElement('dialog'); dialog.style.maxWidth = 'min(94vw, 640px)';
    dialog.innerHTML = '<h2>拍下声音的主人</h2><video autoplay muted playsinline style="width:100%;max-height:65vh;border-radius:12px"></video><p role="status">正在打开相机…</p><div class="dialog-actions"><button data-cancel class="secondary">取消</button><button data-shoot class="primary" disabled>拍照</button></div>';
    const video = dialog.querySelector('video'), shoot = dialog.querySelector('[data-shoot]');
    let stream, done = false;
    const finish = (blob, error) => {
      if (done) return; done = true; stream?.getTracks().forEach(track => track.stop()); video.srcObject = null;
      document.removeEventListener('visibilitychange', visibility); window.removeEventListener('freeimpro-background', background); window.removeEventListener('pagehide', background);
      dialog.close(); dialog.remove(); error ? reject(error) : resolve(blob);
    };
    const background = () => finish(null);
    const visibility = () => { if (document.hidden && !isStudentClient()) background(); };
    dialog.querySelector('[data-cancel]').onclick = () => finish(null); dialog.oncancel = () => finish(null);
    document.addEventListener('visibilitychange', visibility); window.addEventListener('freeimpro-background', background); window.addEventListener('pagehide', background);
    shoot.onclick = () => {
      if (!video.videoWidth || !video.videoHeight) return;
      shoot.disabled = true; const canvas = document.createElement('canvas');
      const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => blob ? finish(blob) : finish(null, new Error('照片保存失败，请重试。')), 'image/jpeg', .9);
    };
    document.body.append(dialog); dialog.showModal();
    navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } }).then(async result => {
      if (done) { result.getTracks().forEach(track => track.stop()); return; }
      stream = result; video.srcObject = stream; await video.play(); if (done) return;
      shoot.disabled = false; dialog.querySelector('[role="status"]').textContent = '将想保留的主体放在画面中间。';
    }).catch(() => finish(null, new Error('相机无法打开，请允许学生客户端使用相机。')));
  });
}
