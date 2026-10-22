import { test, expect } from '@playwright/test';

const headers = { Origin: 'http://127.0.0.1:4307' };
const empty = () => ({ version: 1, pages: { student: {}, teacher: {} } });
async function snapshot(page) { const response = await page.request.get('/api/ui-design'); expect(response.ok()).toBe(true); return response.json(); }
async function publish(page, design) {
  const current = await snapshot(page);
  const response = await page.request.post('/api/admin/ui-design', { headers, data: { revision: current.revision, design } });
  expect(response.ok()).toBe(true); return response.json();
}
async function openEditor(page) {
  await page.goto('/api/admin/console');
  await page.getByLabel('管理员账号', { exact: true }).fill('browser_admin');
  await page.locator('#login-password').fill('synthetic-admin-password-123');
  await page.getByRole('button', { name: '登录后台', exact: true }).click();
  await expect(page.locator('#admin-shell')).toBeVisible();
  await publish(page, empty());
  await page.getByRole('button', { name: '页面编辑', exact: true }).click();
  await expect(page.locator('#ui-editor-mode')).toBeEnabled();
  if (process.env.ADMIN_BROWSER_PREVIEW === 'cloud') {
    await expect(page.locator('#ui-editor-frame')).toHaveAttribute('src', /\/api\/admin\/preview\/student\?uiPreview=1$/);
    await expect(page.locator('#ui-editor-mode-help')).toContainText('不进行真实课堂操作');
  }
  return page.frameLocator('#ui-editor-frame');
}
async function color(page, property, value) {
  await page.locator('#ui-property-' + property).evaluate((input, next) => {
    input.value = next; input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}
async function save(page) {
  await expect(page.locator('#ui-editor-save')).toBeEnabled();
  await page.locator('#ui-editor-save').click();
  await expect(page.locator('#ui-editor-notice')).toContainText('已保存并应用');
  await expect(page.locator('#ui-editor-save')).toBeDisabled();
}

test('管理员点选真实元素，草稿仅预览，保存后普通页面读取，恢复默认可持久保存', async ({ page, browser }, testInfo) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const frame = await openEditor(page);
  await page.locator('#ui-editor-mode').click();
  await page.locator('#ui-editor-frame').scrollIntoViewIfNeeded();
  await frame.locator('.nav-record-disc').click();
  await expect(page.locator('#ui-editor-target')).toHaveValue('record');
  await expect(frame.locator('#capture-overlay')).toBeHidden();
  await page.locator('#ui-property-width').fill('72');
  await page.locator('#ui-property-x').fill('12');
  await expect(frame.locator('.nav-record-disc')).toHaveCSS('width', '72px');
  await expect(frame.locator('.nav-record-disc')).toHaveCSS('translate', '12px');
  await page.locator('#ui-editor-target').selectOption('navigation');
  await color(page, 'backgroundColor', '#dae8f6');
  await expect(frame.locator('.student-bottom-nav')).toHaveCSS('background-color', 'rgb(218, 232, 246)');
  expect((await snapshot(page)).design).toEqual(empty());
  await save(page);
  expect((await snapshot(page)).design.pages.student.record).toEqual({ width: 72, x: 12 });

  const guest = await browser.newContext();
  try {
    const visitor = await guest.newPage(); await visitor.goto('http://127.0.0.1:4307/');
    await expect(visitor.locator('.student-bottom-nav')).toHaveCSS('background-color', 'rgb(218, 232, 246)');
    await expect(visitor.locator('#fi-ui-outline')).toHaveCount(0);
    expect((await guest.request.post('http://127.0.0.1:4307/api/admin/ui-design', { headers, data: { revision: 0, design: empty() } })).status()).toBe(401);
    expect((await guest.request.get('http://127.0.0.1:4307/api/admin/preview/student')).status()).toBe(401);
  } finally { await guest.close(); }

  await page.locator('#ui-editor-page').selectOption('teacher');
  await expect(page.locator('#ui-editor-mode')).toBeEnabled(); await page.locator('#ui-editor-mode').click();
  await expect(frame.locator('#auth-panel')).toBeVisible();
  await expect(frame.locator('#auth-panel .muted')).toContainText('教师专用登录');
  await expect(frame.locator('#open-my-classroom, #open-my-avatar, #join-form')).toHaveCount(0);
  await page.locator('#ui-editor-target').selectOption('title');
  await page.locator('#ui-property-fontSize').fill('36');
  await expect(frame.locator('.intro h1')).toHaveCSS('font-size', '36px');
  await save(page);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('page-editor-desktop.png'), fullPage: true });

  await page.locator('#ui-editor-page').selectOption('student');
  await expect(page.locator('#ui-editor-mode')).toBeEnabled(); await page.locator('#ui-editor-mode').click();
  await page.locator('#ui-editor-reset-page').click();
  expect((await snapshot(page)).design.pages.student).not.toEqual({});
  await save(page);
  const reset = await snapshot(page);
  expect(reset.design.pages.student).toEqual({});
  expect(reset.design.pages.teacher.title.fontSize).toBe(36);
  expect(errors).toEqual([]);
});

test('页面切换与离开编辑器保留草稿，撤销和重新登录清除草稿，窄屏布局可操作', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openEditor(page); await page.locator('#ui-editor-mode').click();
  await color(page, 'backgroundColor', '#f6eeee');
  await page.getByRole('button', { name: '数据概览', exact: true }).click();
  await page.getByRole('button', { name: '页面编辑', exact: true }).click();
  await expect(page.locator('#ui-editor-dirty')).toHaveText('有未保存修改');
  await expect(page.locator('#ui-editor-mode')).toHaveAttribute('aria-checked', 'false');
  await page.locator('#ui-editor-mode').click();
  await page.locator('#ui-editor-page').selectOption('teacher');
  await expect(page.locator('#ui-editor-mode')).toBeEnabled();
  await page.locator('#ui-editor-mode').click();
  await color(page, 'backgroundColor', '#eeeeff');
  await page.locator('#ui-editor-discard').click();
  await expect(page.locator('#ui-editor-dirty')).toHaveText('已保存');
  expect((await snapshot(page)).design).toEqual(empty());
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('page-editor-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await expect(page.locator('#login-screen')).toBeVisible();
  await expect(page.locator('#ui-editor-frame')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '页面编辑', exact: true })).toBeHidden();
});

test('版本冲突保留草稿，重新载入后可继续；会话撤销后禁止保存并移除编辑器', async ({ page }) => {
  await openEditor(page); await page.locator('#ui-editor-mode').click();
  await color(page, 'backgroundColor', '#ffeeee');
  const other = empty(); other.pages.teacher.page = { backgroundColor: '#eeeeff' };
  const newer = await publish(page, other);
  await page.locator('#ui-editor-save').click();
  await expect(page.locator('#ui-editor-conflict')).toBeVisible();
  await expect(page.locator('#ui-property-backgroundColor')).toHaveValue('#ffeeee');
  expect((await snapshot(page)).revision).toBe(newer.revision);
  await page.locator('#ui-editor-conflict-reload').click();
  await expect(page.locator('#ui-editor-dirty')).toHaveText('已保存');
  await color(page, 'backgroundColor', '#eeffee');
  expect((await page.request.post('/api/admin/logout', { headers, data: {} })).status()).toBe(200);
  await page.locator('#ui-editor-save').click();
  await expect(page.locator('#login-screen')).toBeVisible();
  await expect(page.locator('#ui-editor-frame')).toHaveCount(0);
  expect((await snapshot(page)).design).toEqual(other);
});
