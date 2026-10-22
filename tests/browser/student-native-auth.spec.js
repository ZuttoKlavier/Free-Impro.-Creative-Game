import { test, expect } from '@playwright/test';

async function nativePage(browser, bridge) {
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 FreeImproStudent/0.3.0 ' + (bridge === 'ios' ? 'iOS' : 'Android') });
  const page = await context.newPage();
  await page.addInitScript(({ bridge }) => {
    window.nativeAuthCalls = [];
    window.nativeAuthCancelled = [];
    window.nativeAuthUser = { id: 'a53d291a-2ba5-4aee-9392-92ae6bd85cce', name: '手机授权学生', role: 'student' };
    window.addEventListener('freeimpro-student-authenticated', event => { window.completedNativeAuth = event.detail.user; });
    if (bridge === 'android') window.FreeImproAndroid = {
      beginStudentAuth(id, provider, mode) { window.nativeAuthCalls.push({ id, provider, mode }); return true; },
      cancelStudentAuth(id) { window.nativeAuthCancelled.push(id); },
      pendingImport() { return ''; },
    };
    if (bridge === 'ios') window.FreeImproAuth = {
      async signInSocial(provider, mode) { window.nativeAuthCalls.push({ provider, mode }); return { user: window.nativeAuthUser }; },
    };
  }, { bridge });
  let socialRequests = 0;
  page.on('request', request => { if (request.url().includes('/account/social/start')) socialRequests++; });
  await page.route('**/api/student/account/options', route => route.fulfill({ json: {
    password: { enabled: true }, phone: { enabled: false, reason: '短信尚未配置' },
    apple: { enabled: true }, wechat: { enabled: true }, account: null,
  } }));
  await page.goto('/');
  await page.locator('#classroom-tab').click();
  await page.locator('#open-student-account').click();
  await expect(page.locator('#student-account-password-submit')).toBeEnabled();
  return { page, context, socialRequests: () => socialRequests };
}

test('Android authorization uses the native request and ignores unrelated callback ids', async ({ browser }) => {
  const { page, context, socialRequests } = await nativePage(browser, 'android');
  try {
    await expect(page.locator('#student-account-wechat')).toBeEnabled();
    await expect(page.locator('#student-account-apple')).toHaveCount(0);
    await expect(page.locator('#student-account-apple-reason')).toHaveCount(0);
    expect(await page.evaluate(async () => {
      try { await (await import('/src/native-student-auth.js')).signInNativeStudent('apple'); return ''; }
      catch (error) { return error.message; }
    })).toContain('仅在 iPhone');
    expect(await page.evaluate(() => window.nativeAuthCalls)).toEqual([]);
    await page.locator('#student-account-wechat').click();
    await expect.poll(() => page.evaluate(() => window.nativeAuthCalls.length)).toBe(1);
    await page.evaluate(() => {
      window.dispatchEvent(new Event('freeimpro-background'));
      window.dispatchEvent(new CustomEvent('freeimpro-native-auth-result', { detail: { id: 'other-request', result: { user: window.nativeAuthUser } } }));
    });
    expect(await page.evaluate(() => window.completedNativeAuth)).toBeUndefined();
    expect(await page.evaluate(() => window.nativeAuthCancelled)).toEqual([]);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('freeimpro-native-auth-result', { detail: { id: window.nativeAuthCalls[0].id, result: { user: window.nativeAuthUser } } })));
    await expect.poll(() => page.evaluate(() => window.completedNativeAuth?.name)).toBe('手机授权学生');
    const call = await page.evaluate(() => window.nativeAuthCalls[0]);
    expect(call).toEqual({ id: expect.any(String), provider: 'wechat', mode: 'login' });
    expect(socialRequests()).toBe(0);
    await expect(page.locator('#student-account-password')).toHaveValue('');
  } finally { await context.close(); }
});

test('Android disconnection cancels pending authorization and rejects a late result', async ({ browser }) => {
  const { page, context } = await nativePage(browser, 'android');
  try {
    await page.locator('#student-account-wechat').click();
    await expect.poll(() => page.evaluate(() => window.nativeAuthCalls.length)).toBe(1);
    await page.evaluate(() => {
      window.dispatchEvent(new Event('freeimpro-classroom-disconnected'));
      window.dispatchEvent(new CustomEvent('freeimpro-native-auth-result', { detail: { id: window.nativeAuthCalls[0].id, result: { user: window.nativeAuthUser } } }));
    });
    await expect(page.locator('#student-account-error')).toContainText('登录已取消');
    expect(await page.evaluate(() => window.nativeAuthCancelled)).toHaveLength(1);
    expect(await page.evaluate(() => window.completedNativeAuth)).toBeUndefined();
  } finally { await context.close(); }
});

test('iOS authorization consumes the native result and older clients explain the required update', async ({ browser }) => {
  const { page, context, socialRequests } = await nativePage(browser, 'ios');
  try {
    await page.locator('#student-account-apple').click();
    await expect.poll(() => page.evaluate(() => window.completedNativeAuth?.name)).toBe('手机授权学生');
    expect(await page.evaluate(() => window.nativeAuthCalls)).toEqual([{ provider: 'apple', mode: 'login' }]);
    expect(socialRequests()).toBe(0);
  } finally { await context.close(); }
  const older = await nativePage(browser, 'none');
  try {
    await expect(older.page.locator('#student-account-apple')).toHaveCount(0);
    await expect(older.page.locator('#student-account-wechat')).toBeDisabled();
    await expect(older.page.locator('#student-account-wechat-reason')).toContainText('更新客户端');
  } finally { await older.context.close(); }
});
