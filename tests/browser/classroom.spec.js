import { test, expect } from '@playwright/test';

async function register(page, role, name) {
  await page.goto('/'); await page.locator('#classroom-tab').click();
  await page.locator('#mode-register').click(); await page.locator('#auth-name').fill(name);
  await page.locator('#auth-role').selectOption(role);
  await page.locator('#auth-username').fill(role + '_' + Date.now() + '_' + Math.floor(Math.random() * 1000));
  await page.locator('#auth-password').fill('password_for_test'); await page.locator('#auth-submit').click();
  await expect(page.locator('#signed-in')).toBeVisible();
}
async function saveDemo(page, name) {
  await page.locator('#studio-tab').click(); await page.locator('#demo').click();
  await page.locator('#sound-name').fill(name); await page.locator('#save').click();
  await expect(page.locator('#toast')).toContainText('已保存在');
  await page.locator('#classroom-tab').click();
}
async function submit(page) { await page.locator('#send-sound').click(); await page.locator('#submit-dialog button[value="submit"]').click(); }

test('separate teacher and student accounts submit and approve replacement; reload keeps login', async ({ browser }) => {
  const teacherContext = await browser.newContext(), studentContext = await browser.newContext();
  const teacher = await teacherContext.newPage(), student = await studentContext.newPage();
  const errors = []; [teacher, student].forEach(p => p.on('pageerror', e => errors.push(e.message)));
  await register(teacher, 'teacher', '林老师');
  await teacher.locator('#class-name').fill('我们的节奏课堂'); await teacher.locator('#create-form button').click();
  await expect(teacher.locator('.room-code strong')).toBeVisible(); const code = await teacher.locator('.room-code strong').textContent();
  await expect(teacher.locator('#room-qr')).toHaveAttribute('src', /^data:image\/png/);
  await register(student, 'student', '小林'); await student.locator('#class-code').fill(code); await student.locator('#join-form button').click();
  await expect(student.locator('.room-title h2')).toHaveText('我们的节奏课堂');
  await saveDemo(student, '第一声'); await submit(student);
  await expect(student.locator('.submission-item strong')).toHaveText('第一声');
  await teacher.locator('#refresh-class').click(); await expect(teacher.locator('.member-card')).toContainText('第一声');
  await saveDemo(student, '第二声'); await student.locator('#class-sound').selectOption({ label: '第二声 · 0.15 秒' }); await submit(student);
  await expect(student.locator('.status-pill.pending')).toHaveText('更换待接受');
  await teacher.locator('#refresh-class').click(); await teacher.getByRole('button', { name: '接受更换' }).click(); await expect(teacher.locator('.status-pill.pending')).toHaveCount(0);
  await student.locator('#refresh-class').click(); await expect(student.locator('.submission-item strong')).toHaveText(['第二声']);
  await student.reload(); await student.locator('#classroom-tab').click(); await expect(student.locator('#identity')).toContainText('小林');
  await student.screenshot({ path: 'test-results/classroom-student.png', fullPage: true });
  await teacher.screenshot({ path: 'test-results/classroom-teacher.png', fullPage: true });
  expect(errors).toEqual([]); await teacherContext.close(); await studentContext.close();
});

test('disconnected submission stays in IndexedDB and retry delivers once', async ({ browser }) => {
  const tc = await browser.newContext(), sc = await browser.newContext(); const teacher = await tc.newPage(), student = await sc.newPage();
  await register(teacher, 'teacher', '离线测试教师'); await teacher.locator('#class-name').fill('连接恢复课堂'); await teacher.locator('#create-form button').click();
  await expect(teacher.locator('.room-code strong')).toBeVisible(); const code = await teacher.locator('.room-code strong').textContent();
  await register(student, 'student', '离线学生'); await student.locator('#class-code').fill(code); await student.locator('#join-form button').click(); await expect(student.locator('.room-title')).toBeVisible();
  await saveDemo(student, '断网时的声音');
  await student.route('**/api/**', route => route.abort()); await submit(student);
  await expect(student.locator('.queue-row')).toContainText('断网时的声音');
  await student.reload(); await student.locator('#classroom-tab').click();
  await expect(student.locator('#connection-note')).toBeVisible(); await expect(student.locator('.queue-row')).toContainText('断网时的声音');
  await student.unroute('**/api/**'); await student.locator('#refresh-class').click();
  await expect(student.locator('.queue-row')).toHaveCount(0); await expect(student.locator('.submission-item strong')).toHaveText('断网时的声音');
  await teacher.locator('#refresh-class').click(); await expect(teacher.locator('.submission-item')).toHaveCount(1);
  await tc.close(); await sc.close();
});
