import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

const fixture = new PNG({ width: 32, height: 32 }); fixture.data.fill(150);
const photo = PNG.sync.write(fixture);
const projectUrl = 'https://chatgpt.com/g/g-p-6ac9c5efbfe4819180625b8121797b4f/project';

test('registered student requests fixed identity; teacher binds the project conversation and returns the image', async ({ page, browser }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const headers = { Origin: process.env.TEST_APP_ORIGIN };
  await page.request.post('/api/teacher/register', { headers, data: { username: 'images_' + crypto.randomUUID().slice(0, 8), name: '老师', password: 'password123', role: 'teacher' } });
  const room = (await (await page.request.post('/api/teacher/classrooms', { headers, data: { name: '生图流程测试', capacity: 15, background: '教室' } })).json()).classroom;
  const context = await browser.newContext(), student = await context.newPage();
  student.on('pageerror', e => errors.push(e.message));
  try {
    await student.goto('/'); await student.locator('#classroom-tab').click();
    await student.locator('#auth-username').fill('同学'); await student.locator('#auth-password').fill(room.code); await student.locator('#auth-submit').click();
    await expect(student.locator('#register-student-profile')).toBeVisible();
    expect((await (await student.request.get('/api/student/image-status')).json()).registered).toBe(false);
    await student.locator('#register-student-profile').click(); await expect(student.locator('#create-student-avatar')).toBeEnabled();
    await student.locator('#create-student-avatar').click();
    await student.locator('#photo-file').setInputFiles({ name: 'synthetic-face.png', mimeType: 'image/png', buffer: photo });
    await student.locator('#generate-character').click(); await expect(student.locator('#character-status')).toHaveText('图像生成中');
    await student.locator('#classroom-tab').click(); await expect(student.locator('#student-profile-status')).toHaveText('图像生成中');
    await page.goto('/teacher.html'); await page.locator('#image-settings').click();
    await expect(page.getByRole('link', { name: '打开 EV生图储存库', exact: true })).toHaveAttribute('href', projectUrl);
    await page.getByRole('button', { name: '查看生成材料', exact: true }).click();
    await expect(page.locator('[data-materials]')).toContainText('同学#0000 · 生图');
    const conversationUrl = 'https://chatgpt.com/c/' + crypto.randomUUID();
    // This tests the local workflow; no fixture is sent to the ChatGPT website.
    await page.getByLabel('学生专属对话地址').fill(conversationUrl);
    await page.locator('[data-project-confirm]').check(); await page.getByRole('button', { name: '保存对话绑定', exact: true }).click();
    await expect(page.getByRole('link', { name: '打开学生专属对话', exact: true })).toHaveAttribute('href', conversationUrl);
    await page.locator('[data-result]').setInputFiles({ name: 'synthetic-result.png', mimeType: 'image/png', buffer: photo });
    await expect(student.locator('#student-fixed-avatar')).toBeVisible({ timeout: 15000 });
    await expect(student.locator('#student-profile-status')).toContainText('今日剩余 0 张');
    await expect(student.locator('#create-student-avatar')).toBeHidden();
    await expect(student.locator('#image-settings')).toHaveCount(0);
    await student.reload(); await student.locator('#classroom-tab').click(); await expect(student.locator('#student-fixed-avatar')).toBeVisible();
    const jobs = (await (await student.request.get('/api/student/image-jobs')).json()).jobs;
    expect(jobs[0].status).toBe('completed'); expect(jobs[0].conversationUrl).toBeUndefined();
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
