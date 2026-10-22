import { classroomFetch, isOfflineStudent } from './classroom-transport.js';
import { isStudentClient } from './student-client.js';
import { hasNativeStudentAuth, hasNativeAppleStudentAuth, signInNativeStudent } from './native-student-auth.js';
import './student-auth.css';

const providerNames = { wechat: '微信', apple: 'Apple', credential: '账号密码' };

export function initStudentAuth({ notify }) {
  const socialProviders = hasNativeAppleStudentAuth() ? ['wechat', 'apple'] : ['wechat'];
  const appleMarkup = socialProviders.includes('apple') ? '<div><button id="student-account-apple" class="secondary" disabled>Apple 登录</button><p id="student-account-apple-reason" class="muted"></p></div>' : '';
  const root = document.createElement('section');
  root.id = 'student-account';
  root.className = 'panel student-account';
  root.setAttribute('aria-labelledby', 'student-account-heading');
  root.innerHTML = `<div class="student-account-heading"><div><h2 id="student-account-heading">学生账号</h2><p id="student-account-summary" class="muted">登录或注册，保存你的学生身份。</p></div><button id="open-student-account" class="secondary" aria-expanded="false" aria-controls="student-account-content">登录 / 注册</button></div>
    <div id="student-account-content" hidden>
      <p id="student-account-status" class="muted" role="status" aria-live="polite"></p>
      <p id="student-account-error" class="inline-error" role="alert"></p>
      <div id="student-account-signed-in" hidden><p id="student-account-details"></p><button id="student-account-logout" class="secondary">退出学生账号</button></div>
      <div id="student-account-password-area"><div class="student-account-modes" role="group" aria-label="学生账号操作"><button id="student-account-login-mode" class="secondary active" aria-pressed="true">账号密码登录</button><button id="student-account-register-mode" class="secondary" aria-pressed="false">注册账号</button></div>
        <form id="student-account-password-form"><label id="student-account-name-label" hidden>你的名字<input id="student-account-name" maxlength="30" autocomplete="name" placeholder="老师认识的名字"></label><label>账号<input id="student-account-username" required minlength="3" maxlength="32" pattern="[A-Za-z0-9_]+" autocomplete="username" autocapitalize="none" placeholder="字母、数字或下划线"></label><label>密码<input id="student-account-password" required type="password" minlength="8" maxlength="128" autocomplete="current-password" placeholder="至少 8 位字符"></label><p id="student-account-register-note" class="muted" hidden>已连接课堂时注册，会保留当前课堂身份与图片记录。</p><button id="student-account-password-submit" class="primary" type="submit">登录</button></form>
      </div>
      <div class="student-account-other"><h3 id="student-account-other-heading">其他登录方式</h3><div class="student-account-providers"><div><button id="student-account-phone-open" class="secondary" disabled aria-expanded="false" aria-controls="student-account-phone-form">手机验证码登录</button><p id="student-account-phone-reason" class="muted"></p></div><div><button id="student-account-wechat" class="secondary" disabled>微信登录</button><p id="student-account-wechat-reason" class="muted"></p></div>${appleMarkup}</div>
        <form id="student-account-phone-form" hidden><label>手机号<input id="student-account-phone" required type="tel" autocomplete="tel" maxlength="20" placeholder="例如 +8613800000000"></label><div class="student-account-code"><label>短信验证码<input id="student-account-code" required inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" placeholder="6 位验证码"></label><button id="student-account-send-code" class="secondary" type="button">获取验证码</button></div><label>你的名字<input id="student-account-phone-name" maxlength="30" autocomplete="name" placeholder="首次登录时填写"></label><button id="student-account-phone-submit" class="primary" type="submit">验证并登录</button></form>
      </div>
      <button id="student-account-refresh" class="text-button">刷新登录方式</button>
    </div>`;
  document.querySelector('#my-view .my-heading').after(root);
  const $ = id => root.querySelector('#student-account-' + id);
  const openButton = root.querySelector('#open-student-account');
  let user = null, options = null, mode = 'login', opened = false, busy = false, loading = false, version = 0, optionsTask = null, taskVersion = -1;
  const native = () => isOfflineStudent() || isStudentClient();
  const clearSecrets = () => { $('password').value = ''; $('code').value = ''; };
  const showError = error => { $('error').textContent = error?.message || '暂时无法连接账号服务，请稍后重试。'; };
  async function api(path, data) {
    let response;
    try {
      response = await classroomFetch('/api/student' + path, { method: data === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: data === undefined ? {} : { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(12000) });
    } catch (error) {
      throw new Error(native() && error?.message && !['AbortError', 'TimeoutError'].includes(error.name) ? error.message : '暂时无法连接账号服务，可继续离线创作。');
    }
    let result;
    try { result = await response.json(); } catch { throw new Error('账号服务响应异常，请稍后重试。'); }
    if (!response.ok) throw Object.assign(new Error(result.error || '账号操作暂时无法完成。'), { status: response.status });
    return result;
  }
  function render() {
    const account = options?.account, linked = Boolean(account?.linked);
    $('summary').textContent = linked ? `${user?.name || '学生'} · 已登录学生账号` : user ? `${user.name} · 当前课堂身份尚未绑定登录账号` : '登录或注册，保存你的学生身份。';
    openButton.textContent = opened ? '收起' : linked ? '管理账号' : '登录 / 注册';
    openButton.setAttribute('aria-expanded', String(opened));
    $('content').hidden = !opened;
    $('signed-in').hidden = !linked;
    $('password-area').hidden = linked;
    $('details').textContent = [account?.username && `账号：${account.username}`, account?.phone && `手机：${account.phone}`, ...(account?.providers || []).filter(provider => providerNames[provider] && (provider !== 'apple' || hasNativeAppleStudentAuth())).map(provider => `已绑定 ${providerNames[provider]}`)].filter(Boolean).join(' · ');
    $('other-heading').textContent = linked ? '绑定其他登录方式' : '其他登录方式';
    $('name-label').hidden = mode !== 'register';
    $('name').required = mode === 'register';
    $('register-note').hidden = mode !== 'register';
    $('password').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
    $('password-submit').textContent = mode === 'register' ? '注册并登录' : '登录';
    ['login', 'register'].forEach(value => { $(value + '-mode').classList.toggle('active', mode === value); $(value + '-mode').setAttribute('aria-pressed', String(mode === value)); });
    $('password-submit').disabled = busy || loading || options?.password?.enabled !== true;
    ['login-mode', 'register-mode', 'username', 'password', 'name', 'phone', 'code', 'phone-name', 'logout', 'refresh'].forEach(id => $(id).disabled = busy);
    $('refresh').disabled = busy || loading;
    $('phone-open').textContent = account?.phone ? '手机号已绑定' : linked ? '绑定手机号' : '手机验证码登录';
    $('phone-open').disabled = busy || loading || options?.phone?.enabled !== true || Boolean(account?.phone);
    $('send-code').disabled = busy || loading || options?.phone?.enabled !== true;
    $('phone-submit').disabled = busy || loading || options?.phone?.enabled !== true;
    $('phone-submit').textContent = linked ? '验证并绑定' : '验证并登录';
    $('phone-reason').textContent = account?.phone ? '可用此手机号登录同一个学生账号。' : options?.phone?.enabled ? linked ? '验证手机，添加一种登录方式。' : '通过短信验证码登录。' : options?.phone?.reason || '打开账号面板后检查短信服务。';
    if (account?.phone) { $('phone-form').hidden = true; $('phone-open').setAttribute('aria-expanded', 'false'); }
    for (const provider of socialProviders) {
      const bound = account?.providers?.includes(provider), enabled = options?.[provider]?.enabled === true;
      $(provider).textContent = bound ? `${providerNames[provider]} 已绑定` : linked ? `绑定 ${providerNames[provider]}` : `${providerNames[provider]}登录`;
      $(provider).disabled = busy || loading || !enabled || native() && !hasNativeStudentAuth() || bound;
      $(provider + '-reason').textContent = bound ? '可用此方式登录同一个学生账号。' : !enabled ? options?.[provider]?.reason || '打开账号面板后检查平台配置。' : native() ? hasNativeStudentAuth() ? '打开系统授权页面，完成后返回课堂。' : '请更新客户端后使用第三方授权。' : '跳转到官方页面授权。';
    }
  }
  async function loadOptions() {
    if (optionsTask && taskVersion === version) return optionsTask;
    const ticket = version;
    taskVersion = ticket; loading = true; $('status').textContent = '正在检查登录方式…'; render();
    const task = (async () => {
      try { const result = await api('/account/options'); if (ticket !== version) return; options = result; $('status').textContent = ''; render(); }
      catch (error) { if (ticket === version) { options = null; $('status').textContent = ''; showError(error); } }
      finally { if (ticket === version) { loading = false; render(); } }
    })();
    optionsTask = task;
    try { await task; } finally { if (optionsTask === task) optionsTask = null; }
  }
  async function action(task) {
    if (busy) return;
    busy = true; $('error').textContent = ''; $('status').textContent = ''; render();
    try { await task(); } catch (error) { showError(error); }
    finally { busy = false; render(); }
  }
  async function authenticated(result, registered = false) {
    if (!result.user?.id || result.user.role !== 'student') throw new Error('账号登录结果异常，请重试。');
    clearSecrets();
    window.dispatchEvent(new CustomEvent('freeimpro-student-authenticated', { detail: { user: result.user } }));
    notify(registered ? '学生账号已注册，课堂身份已保存。' : '学生账号已登录，可输入课堂码加入课堂。');
    await loadOptions();
  }
  openButton.onclick = () => { opened = !opened; $('error').textContent = ''; render(); if (opened) loadOptions(); };
  $('refresh').onclick = () => { $('error').textContent = ''; loadOptions(); };
  ['login', 'register'].forEach(value => { $(value + '-mode').onclick = () => { mode = value; clearSecrets(); $('error').textContent = ''; if (value === 'register' && user && !$('name').value) $('name').value = user.name; render(); }; });
  $('password-form').onsubmit = event => { event.preventDefault(); action(async () => {
    const payload = { username: $('username').value.trim(), password: $('password').value, ...(mode === 'register' ? { name: $('name').value.trim() } : {}) };
    await authenticated(await api('/account/' + mode, payload), mode === 'register');
  }); };
  $('phone-open').onclick = () => { const expanded = $('phone-form').hidden; $('phone-form').hidden = !expanded; $('phone-open').setAttribute('aria-expanded', String(expanded)); if (expanded) $('phone').focus(); };
  $('send-code').onclick = () => { if (!$('phone').reportValidity()) return; action(async () => { await api('/account/phone/send', { phoneNumber: $('phone').value.trim() }); $('status').textContent = '验证码已发送，请查看手机短信。'; $('code').focus(); }); };
  $('phone-form').onsubmit = event => { event.preventDefault(); action(async () => { await authenticated(await api('/account/phone/verify', { phoneNumber: $('phone').value.trim(), code: $('code').value.trim(), name: $('phone-name').value.trim(), ...(options?.account?.linked ? { mode: 'link' } : {}) })); }); };
  for (const provider of socialProviders) $(provider).onclick = () => action(async () => {
    if (provider === 'apple' && !hasNativeAppleStudentAuth()) throw new Error('Apple 登录仅在 iPhone 客户端提供。');
    const socialMode = options?.account?.linked ? 'link' : 'login';
    if (native()) { await authenticated(await signInNativeStudent(provider, socialMode)); return; }
    const result = await api('/account/social/start', { provider, mode: socialMode });
    let url;
    try { url = new URL(result.url); } catch { throw new Error('授权地址异常，请稍后重试。'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('授权地址异常，请稍后重试。');
    location.assign(url.href);
  });
  $('logout').onclick = () => action(async () => {
    if (isOfflineStudent()) await window.FreeImproClassroom.disconnect(); else await api('/logout', {});
    clearSecrets(); window.dispatchEvent(new Event('freeimpro-student-signed-out')); notify('学生账号已退出，作品保留在本机。');
  });
  function session(next) {
    if (user?.id === next?.id) { user = next || null; render(); return; }
    version++; user = next || null; options = next ? null : options ? { ...options, account: null } : null; loading = false; clearSecrets(); $('status').textContent = ''; $('error').textContent = '';
    if (!next) mode = 'login';
    $('phone-form').hidden = true; $('phone-open').setAttribute('aria-expanded', 'false'); render();
    if (opened && next) loadOptions();
  }
  window.addEventListener('freeimpro-student-session', event => session(event.detail?.user));
  window.addEventListener('freeimpro-classroom-disconnected', () => session(null));
  render();
  return { open: () => { opened = true; render(); return loadOptions(); } };
}
