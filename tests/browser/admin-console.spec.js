import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// The controller tests use an isolated HTTP fixture; server authorization and
// cascading writes are covered by the administrator API integration tests.
async function fixture(page, { authenticated = false, configured = true } = {}) {
  const state = {
    authenticated, configured, expireRecords: false, calls: [],
    users: [
      { id: 'teacher-1', username: 'teacher_one', name: '测试教师一', role: 'teacher' },
      { id: 'teacher-2', username: 'teacher_two', name: '<img src=x onerror="window.adminInjected=true">', role: 'teacher' },
      { id: 'teacher-3', username: 'teacher_three', name: '测试教师三', role: 'teacher' },
      { id: 'student-1', username: 'student_one', name: '测试学生', role: 'student' },
    ],
    classrooms: [{ id: 'classroom-1', name: '测试课堂', teacher_id: 'teacher-1' }],
    submissions: [{ id: 'submission-1', name: '测试作品', audio: { bytes: 1200, type: 'audio/wav', url: '/api/admin/binary/submissions/submission-1/audio' } }],
    image_jobs: [
      { id: 'job-1', work_name: '待处理图片', status: 'pending', result: null },
      { id: 'job-2', work_name: '已完成图片', status: 'completed', result: { bytes: 3200, type: 'image/png', url: '/api/admin/binary/image_jobs/job-2/result' } },
      { id: 'job-3', work_name: '不可信链接', status: 'completed', result: { bytes: 1000, type: 'image/png', url: 'javascript:window.adminInjected=true' } },
    ],
    admin_audit_log: [{ id: 'audit-1', action: '查看数据', administrator: 'test_admin' }],
    sessions: [{ user_id: 'teacher-1', expires: 1791856793522 }],
  };
  const labels = { users: '用户账号', classrooms: '课堂', submissions: '作品提交', image_jobs: '图片申请', admin_audit_log: '后台操作日志', sessions: '登录会话' };
  const columns = { users: ['id', 'username', 'name', 'role'], classrooms: ['id', 'name', 'teacher_id'], submissions: ['id', 'name', 'audio'], image_jobs: ['id', 'work_name', 'status', 'result'], admin_audit_log: ['id', 'action', 'administrator'], sessions: ['user_id', 'expires'] };
  await page.route('**/api/admin/**', async route => {
    const request = route.request(); const url = new URL(request.url()); const path = url.pathname.slice('/api/admin'.length);
    const data = request.method() === 'POST' ? request.postDataJSON() : undefined;
    state.calls.push({ path, method: request.method(), query: Object.fromEntries(url.searchParams), data });
    const reply = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const admin = { id: 'admin-test', username: 'test_admin', name: '测试管理员' };
    if (path === '/login') {
      if (!state.configured) return reply({ message: '管理员尚未配置，请在服务电脑运行 npm run admin:setup。' }, 503);
      if (data.username !== 'test_admin' || data.password !== 'admin_password_for_test') return reply({ message: '管理员账号或密码不正确。' }, 401);
      state.authenticated = true; return reply({ admin });
    }
    if (!state.authenticated || (path === '/records' && state.expireRecords)) { state.authenticated = false; return reply({ message: '请先登录后台管理员。' }, 401); }
    if (path === '/me') return reply({ admin });
    if (path === '/logout') { state.authenticated = false; return reply({ ok: true }); }
    if (path === '/overview') return reply({ counts: { teachers: state.users.filter(u => u.role === 'teacher').length, students: 1, classrooms: state.classrooms.length, submissions: state.submissions.length, imageJobs: state.image_jobs.length }, tables: Object.entries(labels).map(([name, label]) => ({ name, label, count: state[name].length })) });
    if (path === '/records' || path === '/export') {
      const table = url.searchParams.get('table'); let rows = [...state[table]];
      const role = url.searchParams.get('role'); const q = url.searchParams.get('q'); if (role) rows = rows.filter(row => row.role === role); if (q) rows = rows.filter(row => Object.values(row).some(value => String(value).includes(q)));
      const pageNumber = Number(url.searchParams.get('page') || 1); const total = rows.length;
      if (path === '/export') return reply({ table, exportedAt: Date.now(), columns: columns[table].map(key => ({ key, label: key })), rows });
      return reply({ table, columns: columns[table].map(key => ({ key, label: key })), rows: rows.slice((pageNumber - 1) * 2, pageNumber * 2), page: pageNumber, total, pageSize: 2 });
    }
    if (path === '/users/create') { state.users.push({ id: 'created-user', ...data }); return reply({ ok: true }); }
    const action = /^\/(users|classrooms|submissions|image-jobs)\/([^/]+)\/(update|password|revoke|delete|reject)$/.exec(path);
    if (action) { const table = action[1] === 'image-jobs' ? 'image_jobs' : action[1]; const row = state[table].find(row => row.id === action[2]);
      if (action[3] === 'update') row.name = data.name;
      if (action[3] === 'delete') { if (data.confirmation !== row.id) return reply({ message: '请确认删除。' }, 400); state[table] = state[table].filter(entry => entry.id !== row.id); }
      if (action[3] === 'reject') row.status = 'rejected';
      return reply({ ok: true });
    }
    if (path === '/database/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="zh"><title>只读数据库</title><p>只读数据库测试</p></html>' });
    return reply({ message: 'Fixture endpoint does not exist.' }, 404);
  });
  return state;
}

async function login(page) {
  await page.locator('#login-username').fill('test_admin');
  await page.locator('#login-password').fill('admin_password_for_test');
  await page.getByRole('button', { name: '登录后台', exact: true }).click();
  await expect(page.locator('#admin-shell')).toBeVisible();
  await expect(page.locator('#counts .count-card')).toHaveCount(5);
}

test('独立管理员登录、错误提示与退出；未配置时给出配置入口', async ({ page }) => {
  const state = await fixture(page); const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/admin.html'); await expect(page.getByRole('heading', { name: '管理员登录' })).toBeVisible();
  await page.locator('#login-username').fill('test_admin'); await page.locator('#login-password').fill('wrong_password'); await page.locator('#login-submit').click();
  await expect(page.locator('#login-error')).toHaveText('管理员账号或密码不正确。');
  await login(page); await expect(page.locator('#account-name')).toHaveText('测试管理员');
  await expect(page.locator('#overview-panel')).toContainText('手机中尚未提交的离线作品保存在各自设备上');
  await page.getByRole('button', { name: '退出登录', exact: true }).click(); await expect(page.locator('#login-screen')).toBeVisible(); await expect(page.locator('#login-password')).toHaveValue('');
  state.configured = false; await page.locator('#login-password').fill('admin_password_for_test'); await page.locator('#login-submit').click();
  await expect(page.locator('#login-error')).toContainText('npm run admin:setup'); expect(errors).toEqual([]);
});

test('教师筛选、分页、搜索和全部数据表；不可信文本仅作为文字显示', async ({ page }) => {
  const state = await fixture(page, { authenticated: true }); await page.goto('/admin.html'); await expect(page.locator('#counts .count-card')).toHaveCount(5);
  await page.getByRole('button', { name: '教师管理', exact: true }).click(); await expect(page.locator('#records-body tr')).toHaveCount(2);
  await expect(page.locator('#records-count')).toHaveText('共 3 条'); await expect(page.locator('#role-select')).toHaveValue('teacher');
  await expect(page.locator('#records-body')).toContainText('<img src=x onerror="window.adminInjected=true">'); await expect(page.locator('#records-body img')).toHaveCount(0); expect(await page.evaluate(() => window.adminInjected)).toBeUndefined();
  const downloadPromise=page.waitForEvent('download'); await page.getByRole('button', { name: '导出当前结果', exact: true }).click(); const download=await downloadPromise;
  expect(download.suggestedFilename()).toBe('users.json'); const exported=JSON.parse(await readFile(await download.path(),'utf8')); expect(exported.rows).toHaveLength(3); expect(exported.rows.every(row=>row.role==='teacher')).toBe(true);
  await page.getByRole('button', { name: '下一页', exact: true }).click(); await expect(page.locator('#records-body')).toContainText('测试教师三'); await expect(page.locator('#page-number')).toHaveText('2 / 2');
  await page.locator('#search').fill('teacher_one'); await page.getByRole('button', { name: '搜索', exact: true }).click(); await expect(page.locator('#records-body tr')).toHaveCount(1); await expect(page.locator('#page-number')).toHaveText('1 / 1');
  const request = state.calls.filter(call => call.path === '/records').at(-1); expect(request.query).toMatchObject({ table: 'users', role: 'teacher', q: 'teacher_one', page: '1' });
  await page.getByRole('button', { name: '全部数据表', exact: true }).click(); await page.locator('#table-select').selectOption('sessions'); await expect(page.locator('#records-body')).toContainText('teacher-1'); await expect(page.locator('#create-user')).toBeHidden();
  await page.getByRole('button', { name: '操作日志', exact: true }).click(); await expect(page.locator('#records-body')).toContainText('查看数据');
});

test('修改、新增、重置与撤销会话；删除必须再次确认，取消不会发送请求', async ({ page }) => {
  const state = await fixture(page, { authenticated: true }); await page.goto('/admin.html'); await expect(page.locator('#counts .count-card')).toHaveCount(5);
  await page.getByRole('button', { name: '教师管理', exact: true }).click();
  await page.getByRole('button', { name: '修改姓名：测试教师一', exact: true }).click(); await page.locator('#action-name').fill('修改后的教师'); await page.locator('#dialog-confirm').click(); await expect(page.locator('#records-body')).toContainText('修改后的教师');
  await page.getByRole('button', { name: '重置密码：修改后的教师', exact: true }).click(); await page.locator('#action-password').fill('new_password_for_test'); await page.locator('#dialog-confirm').click(); await expect(page.locator('#action-dialog')).not.toBeVisible();
  expect(state.calls.find(call => call.path === '/users/teacher-1/password').data).toEqual({ password: 'new_password_for_test' });
  await page.getByRole('button', { name: '退出所有登录：修改后的教师', exact: true }).click(); await page.locator('#dialog-confirm').click(); await expect(page.locator('#action-dialog')).not.toBeVisible(); expect(state.calls.some(call => call.path === '/users/teacher-1/revoke')).toBe(true);
  await page.getByRole('button', { name: '删除账号：修改后的教师', exact: true }).click(); await expect(page.locator('#dialog-description')).toContainText('关联的课堂'); await page.getByRole('button', { name: '取消', exact: true }).click(); expect(state.calls.filter(call => call.path.endsWith('/delete'))).toHaveLength(0);
  await page.getByRole('button', { name: '删除账号：修改后的教师', exact: true }).click(); await page.getByRole('button', { name: '确认永久删除', exact: true }).click(); await expect(page.locator('#records-count')).toHaveText('共 2 条'); expect(state.calls.find(call => call.path === '/users/teacher-1/delete').data).toEqual({ confirmation: 'teacher-1' });
  await page.getByRole('button', { name: '新增账号', exact: true }).click(); await page.locator('#action-username').fill('new_teacher'); await page.locator('#action-name').fill('新增教师'); await page.locator('#action-password').fill('initial_password_for_test'); await page.locator('#dialog-confirm').click(); await expect(page.locator('#action-dialog')).not.toBeVisible(); expect(state.calls.find(call => call.path === '/users/create').data).toEqual({ username: 'new_teacher', name: '新增教师', password: 'initial_password_for_test', role: 'teacher' });
});

test('音频与图片链接可查看，取消只针对未完成申请；数据库只读浏览', async ({ page }) => {
  await fixture(page, { authenticated: true }); await page.goto('/admin.html'); await expect(page.locator('#counts .count-card')).toHaveCount(5);
  await page.getByRole('button', { name: '作品提交', exact: true }).click(); await expect(page.locator('#records-body')).toContainText('1.2 KB'); await expect(page.getByRole('link', { name: '查看 / 下载' })).toHaveAttribute('href', /\/api\/admin\/binary\/submissions\/submission-1\/audio$/);
  await page.getByRole('button', { name: '图片申请', exact: true }).click(); await expect(page.locator('#records-body .row-actions button')).toHaveCount(1); await page.getByRole('button', { name: '取消申请：待处理图片', exact: true }).click(); await page.getByRole('button', { name: '确认取消申请', exact: true }).click(); await expect(page.locator('#records-body')).toContainText('rejected'); await expect(page.locator('#records-body .row-actions button')).toHaveCount(0);
  await page.getByRole('button', { name: '下一页', exact: true }).click(); await expect(page.locator('#records-body')).toContainText('不可信链接'); await expect(page.locator('#records-body a')).toHaveCount(0);
  await page.getByRole('button', { name: '数据库浏览', exact: true }).click(); await expect(page.locator('#database-frame')).toHaveAttribute('src', '/api/admin/database/'); await expect(page.frameLocator('#database-frame').getByText('只读数据库测试')).toBeVisible(); await expect(page.getByRole('link', { name: '在新窗口打开数据库浏览' })).toHaveAttribute('rel', 'noopener');
});

test('会话到期清除数据并可重新登录，手机宽度能操作控制台', async ({ page }, testInfo) => {
  const state = await fixture(page, { authenticated: true }); await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/admin.html'); await expect(page.locator('#counts .count-card')).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: '教师管理', exact: true }).click(); await expect(page.locator('#records-body tr')).toHaveCount(2);
  state.expireRecords = true; await page.getByRole('button', { name: '刷新数据', exact: true }).click(); await expect(page.locator('#login-screen')).toBeVisible(); await expect(page.locator('#login-error')).toHaveText('登录已失效，请重新登录。'); await expect(page.locator('#records-body tr')).toHaveCount(0);
  await page.screenshot({path:testInfo.outputPath('admin-mobile-login.png'),fullPage:true});
  state.expireRecords = false; await login(page); await page.getByRole('button', { name: '教师管理', exact: true }).click(); await expect(page.locator('#records-body tr')).toHaveCount(2); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('admin-mobile-records.png'),fullPage:true});
});
