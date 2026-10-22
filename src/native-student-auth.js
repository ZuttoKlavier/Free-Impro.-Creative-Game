const providers = new Set(['wechat', 'apple']);
const modes = new Set(['login', 'link']);
let pending = null;

export function hasNativeStudentAuth() {
  return typeof window.FreeImproAuth?.signInSocial === 'function' || typeof window.FreeImproAndroid?.beginStudentAuth === 'function';
}

export function hasNativeAppleStudentAuth() {
  return typeof window.FreeImproAuth?.signInSocial === 'function' && !window.FreeImproAndroid;
}

function studentResult(result) {
  if (!result?.user || typeof result.user.id !== 'string' || !result.user.id || result.user.role !== 'student') throw new Error('账号登录结果异常，请重试。');
  return result;
}

function cancelPending() {
  if (!pending) return;
  const request = pending;
  pending = null;
  clearTimeout(request.timeout);
  window.FreeImproAndroid?.cancelStudentAuth?.(request.id);
  request.reject(new Error('登录已取消，请重新登录。'));
}

window.addEventListener('freeimpro-native-auth-result', ({ detail }) => {
  if (!pending || detail?.id !== pending.id) return;
  const request = pending;
  pending = null;
  clearTimeout(request.timeout);
  if (detail.error) request.reject(new Error(detail.error));
  else {
    try { request.resolve(studentResult(detail.result)); }
    catch (error) { request.reject(error); }
  }
});
for (const event of ['pagehide', 'freeimpro-classroom-disconnected', 'freeimpro-student-signed-out']) window.addEventListener(event, cancelPending);

export async function signInNativeStudent(provider, mode = 'login') {
  if (!providers.has(provider) || !modes.has(mode)) throw new Error('不支持的登录方式。');
  if (provider === 'apple' && !hasNativeAppleStudentAuth()) throw new Error('Apple 登录仅在 iPhone 客户端提供。');
  if (typeof window.FreeImproAuth?.signInSocial === 'function') return studentResult(await window.FreeImproAuth.signInSocial(provider, mode));
  const native = window.FreeImproAndroid;
  if (typeof native?.beginStudentAuth !== 'function') throw new Error('当前客户端尚未支持第三方授权，请更新客户端。');
  if (pending) throw new Error('登录正在进行，请稍候。');
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(cancelPending, 5 * 60 * 1000);
    pending = { id, resolve, reject, timeout };
    try {
      if (native.beginStudentAuth(id, provider, mode) === false) throw new Error('授权页面暂时无法打开，请稍后重试。');
    } catch (error) {
      if (pending?.id === id) {
        pending = null;
        clearTimeout(timeout);
        reject(error);
      }
    }
  });
}
