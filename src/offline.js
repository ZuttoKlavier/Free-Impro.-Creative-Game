export async function initOffline() {
  if (navigator.userAgent.includes('FreeImproTeacher/')) return;
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !window.isSecureContext) return;
  const status = document.createElement('span'); status.id = 'offline-ready'; status.setAttribute('role', 'status');
  status.textContent = '正在准备离线使用…'; document.querySelector('footer')?.append(status);
  try {
    const registration = await navigator.serviceWorker.register(navigator.userAgent.includes('FreeImproStudent/') ? '/student-sw.js' : '/sw.js');
    let timeout;
    try { await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('offline setup timeout')), 20000); })]); }
    finally { clearTimeout(timeout); }
    status.textContent = '已准备离线创作';
    const updated = () => { if (registration.waiting && navigator.serviceWorker.controller) status.textContent = '有新版本：结束课堂后关闭全部页面，再重新打开'; };
    updated(); registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', updated));
  } catch { status.textContent = '暂未准备离线使用，请保持联网并稍后重新打开'; }
}
