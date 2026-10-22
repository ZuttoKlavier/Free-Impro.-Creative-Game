import { test, expect } from '@playwright/test';

const headers = () => ({ Origin: process.env.TEST_APP_ORIGIN });
const account = () => 'student_' + crypto.randomUUID().slice(0, 8);
const password = 'StudentTest123!';

async function openAccount(page) {
  await page.locator('#classroom-tab').click();
  await page.locator('#open-student-account').click();
  await expect(page.locator('#student-account-password-submit')).toBeEnabled();
}

test('student can register before joining a classroom, sign out and log back into the same account', async ({ page }) => {
  const username = account();
  await page.request.post('/api/teacher/register', { headers: headers(), data: { username: 'teacher_' + crypto.randomUUID().slice(0, 8), password, name: '登录测试教师', role: 'teacher' } });
  const created = await page.request.post('/api/teacher/classrooms', { headers: headers(), data: { name: '登录后入课', capacity: 15, background: '教室' } });
  const room = (await created.json()).classroom;
  await page.goto('/');
  await openAccount(page);
  await page.locator('#student-account-register-mode').click();
  await page.locator('#student-account-name').fill('账号测试学生');
  await page.locator('#student-account-username').fill(username);
  await page.locator('#student-account-password').fill(password);
  await page.locator('#student-account-password-submit').click();
  await expect(page.locator('#student-account-signed-in')).toBeVisible();
  await expect(page.locator('#student-account-details')).toContainText(username);
  const registered = (await (await page.request.get('/api/student/me')).json()).user;
  await expect(page.locator('#student-account-password')).toHaveValue('');

  await page.locator('#student-account-logout').click();
  await expect(page.locator('#student-account-password-area')).toBeVisible();
  await expect(page.locator('#student-account-signed-in')).toBeHidden();
  expect((await page.request.get('/api/student/me')).status()).toBe(401);
  await page.locator('#student-account-login-mode').click();
  await page.locator('#student-account-refresh').click();
  await expect(page.locator('#student-account-password-submit')).toBeEnabled();
  await page.locator('#student-account-password').fill('WrongPassword123!');
  await page.locator('#student-account-password-submit').click();
  await expect(page.locator('#student-account-error')).not.toHaveText('');
  expect((await page.request.get('/api/student/me')).status()).toBe(401);
  await page.locator('#student-account-password').fill(password);
  await page.locator('#student-account-password-submit').click();
  await expect(page.locator('#student-account-signed-in')).toBeVisible();
  const signedIn = (await (await page.request.get('/api/student/me')).json()).user;
  expect(signedIn.id).toBe(registered.id);
  await page.locator('#open-my-classroom').click();
  await expect(page.locator('#join-form')).toBeVisible();
  await expect(page.locator('#identity')).toContainText('账号测试学生');
  await page.locator('#class-code').fill(room.code);
  await page.locator('#join-form button').click();
  await expect(page.locator('.room-title h2')).toHaveText('登录后入课');
  const snapshot = await (await page.request.get('/api/student/classrooms/' + room.id)).json();
  expect(snapshot.classroom.members[0].student_id).toBe(registered.id);
});

test('registering a classroom guest preserves the student identity, image profile and membership', async ({ page }) => {
  const username = account();
  const teacher = await page.request.post('/api/teacher/register', { headers: headers(), data: { username: 'teacher_' + crypto.randomUUID().slice(0, 8), password, name: '账号测试教师', role: 'teacher' } });
  expect(teacher.ok()).toBe(true);
  const created = await page.request.post('/api/teacher/classrooms', { headers: headers(), data: { name: '账号身份课堂', capacity: 15, background: '教室' } });
  const room = (await created.json()).classroom;
  await page.goto('/');
  await page.locator('#classroom-tab').click();
  await page.locator('#open-my-classroom').click();
  await page.locator('#auth-username').fill('课堂身份学生');
  await page.locator('#auth-password').fill(room.code);
  await page.locator('#auth-submit').click();
  await expect(page.locator('#identity')).toContainText('课堂身份学生');
  const guest = (await (await page.request.get('/api/student/me')).json()).user;
  const profile = await page.request.post('/api/student/image-profile/register', { headers: headers(), data: {} });
  expect(profile.ok()).toBe(true);
  await page.locator('#classroom-back').click();
  await page.locator('#open-student-account').click();
  await expect(page.locator('#student-account-password-submit')).toBeEnabled();
  await page.locator('#student-account-register-mode').click();
  await expect(page.locator('#student-account-name')).toHaveValue('课堂身份学生');
  await page.locator('#student-account-username').fill(username);
  await page.locator('#student-account-password').fill(password);
  await page.locator('#student-account-password-submit').click();
  await expect(page.locator('#student-account-signed-in')).toBeVisible();
  const promoted = (await (await page.request.get('/api/student/me')).json()).user;
  expect(promoted.id).toBe(guest.id);
  const rooms = (await (await page.request.get('/api/student/classrooms')).json()).classrooms;
  expect(rooms.find(value => value.id === room.id).members[0].student_id).toBe(guest.id);
  const status = await (await page.request.get('/api/student/image-status')).json();
  expect(status.userId).toBe(guest.id);
  expect(status.registered).toBe(true);
  await expect(page.locator('#register-student-profile')).toBeHidden();
});

test('web shows its three login methods and unconfigured services explain why they are disabled', async ({ page }) => {
  const calls = [];
  page.on('request', request => { if (request.url().includes('/account/options')) calls.push(request.url()); });
  await page.goto('/');
  await page.locator('#classroom-tab').click();
  await expect(page.locator('#student-account')).toBeVisible();
  expect(calls).toHaveLength(0);
  await page.locator('#open-student-account').click();
  await expect(page.locator('#student-account-password-submit')).toBeEnabled();
  for (const method of ['phone-open', 'wechat']) { await expect(page.locator('#student-account-' + method)).toBeVisible(); await expect(page.locator('#student-account-' + method)).toBeDisabled(); }
  for (const method of ['phone', 'wechat']) await expect(page.locator('#student-account-' + method + '-reason')).not.toHaveText('');
  await expect(page.locator('#student-account-apple')).toHaveCount(0);
  await expect(page.locator('#student-account-apple-reason')).toHaveCount(0);
  expect(calls).toHaveLength(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('an unsuccessful platform callback returns to the account panel with a readable message', async ({ page }) => {
  await page.goto('/?student_auth=error');
  await expect(page.locator('#my-view')).toBeVisible();
  await expect(page.locator('#student-account-content')).toBeVisible();
  await expect(page.locator('#toast')).toContainText('平台授权未完成');
  await expect(page).not.toHaveURL(/student_auth=/);
});

test('configured Apple provider has no page elements on the student website', async ({ page }) => {
  await page.route('**/api/student/account/options', route => route.fulfill({ json: {
    password: { enabled: true }, phone: { enabled: false, reason: '短信尚未配置' },
    wechat: { enabled: true }, apple: { enabled: true }, account: null,
  } }));
  await page.goto('/');
  await openAccount(page);
  await expect(page.locator('#student-account-wechat')).toBeVisible();
  await expect(page.locator('#student-account-wechat')).toBeEnabled();
  await expect(page.locator('#student-account-apple')).toHaveCount(0);
  await expect(page.locator('#student-account-apple-reason')).toHaveCount(0);
});
