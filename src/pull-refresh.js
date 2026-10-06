// Only release beyond the threshold refreshes; cancellation never does.
export function installPullRefresh({ canRefresh, refresh, onError, threshold = 80 }) {
  const indicator = document.createElement('div');
  indicator.className = 'pull-refresh'; indicator.hidden = true;
  indicator.setAttribute('role', 'status'); document.body.append(indicator);
  let start = null, distance = 0, running = false;
  const reset = () => { start = null; distance = 0; if (!running) indicator.hidden = true; };
  const top = target => {
    if (window.scrollY > 0) return false;
    for (let node = target; node && node !== document.body; node = node.parentElement) {
      if (node.scrollTop > 0) return false;
    }
    return true;
  };
  document.addEventListener('touchstart', event => {
    reset();
    if (running || event.touches.length !== 1 || !canRefresh() || !top(event.target)
      || event.target.closest('button, input, textarea, select, audio, video, canvas, dialog, [role="slider"]')) return;
    const touch = event.touches[0]; start = { x: touch.clientX, y: touch.clientY };
  }, { passive: true });
  document.addEventListener('touchmove', event => {
    if (!start) return;
    if (event.touches.length !== 1 || !canRefresh()) { reset(); return; }
    const touch = event.touches[0], dy = touch.clientY - start.y, dx = touch.clientX - start.x;
    if (Math.abs(dx) > Math.max(12, Math.abs(dy)) || dy < 0) { reset(); return; }
    if (dy > 8 && event.cancelable) event.preventDefault();
    distance = dy;
    indicator.hidden = distance < threshold;
    indicator.textContent = '下拉刷新 · 松开刷新';
  }, { passive: false });
  document.addEventListener('touchend', async () => {
    const ready = start && distance >= threshold && canRefresh();
    reset(); if (!ready || running) return;
    running = true; indicator.hidden = false; indicator.textContent = '正在刷新…';
    try { await refresh(); } catch (error) { onError(error); }
    finally { running = false; indicator.hidden = true; }
  });
  document.addEventListener('touchcancel', reset, { passive: true });
  window.addEventListener('pagehide', reset);
  document.addEventListener('visibilitychange', reset);
}
