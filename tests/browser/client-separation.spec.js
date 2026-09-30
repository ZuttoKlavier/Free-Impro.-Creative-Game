import { test, expect } from '@playwright/test';

test('independent teacher and student pages can stay signed in together in the same browser', async ({ context }) => {
  const teacher = await context.newPage(), student = await context.newPage();
  const suffix = crypto.randomUUID().slice(0, 8);
  for (const [page, role] of [[teacher, 'teacher'], [student, 'student']]) {
    await page.goto(role === 'teacher' ? '/teacher.html' : '/');
    await page.locator('#classroom-tab').click(); await page.locator('#mode-register').click();
    await expect(page.locator('select#auth-role')).toHaveCount(0);
    await page.locator('#auth-name').fill(role); await page.locator('#auth-username').fill(role + suffix); await page.locator('#auth-password').fill('password123'); await page.locator('#auth-submit').click();
    await expect(page.locator('#signed-in')).toBeVisible();
  }
  await expect(teacher).toHaveTitle('教师工作台 · Free Impro');
  await expect(teacher.locator('#record, #library-tab, #join-form')).toHaveCount(0);
  await expect(student.locator('#create-form')).toHaveCount(0);
  await teacher.reload(); await student.reload(); await student.locator('#classroom-tab').click();
  await expect(teacher.locator('#identity')).toContainText('教师'); await expect(student.locator('#identity')).toContainText('学生');
  await teacher.locator('#class-name').fill('独立双端课堂'); await teacher.locator('#create-form button').click();
  await expect(teacher.locator('.room-code strong')).toBeVisible();
  await student.locator('#class-code').fill(await teacher.locator('.room-code strong').textContent()); await student.locator('#join-form button').click();
  await expect(student.locator('.room-title h2')).toHaveText('独立双端课堂');
  await teacher.locator('#logout').click(); await expect(teacher.locator('#auth-panel')).toBeVisible();
  await student.locator('#refresh-class').click(); await expect(student.locator('#signed-in')).toBeVisible();
  await teacher.locator('#auth-username').fill('student' + suffix); await teacher.locator('#auth-password').fill('password123'); await teacher.locator('#auth-submit').click();
  await expect(teacher.locator('#auth-error')).toContainText('教师账号');
});
