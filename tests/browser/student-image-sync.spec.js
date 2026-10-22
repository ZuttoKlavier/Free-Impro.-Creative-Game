import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

const user = { id: '11111111-1111-4111-8111-111111111111', name: '合成同步测试', role: 'student' };
const classId = '22222222-2222-4222-8222-222222222222';
const workId = '33333333-3333-4333-8333-333333333333';
const fixture = new PNG({ width: 8, height: 8 });
fixture.data.fill(128);
const photoBase64 = PNG.sync.write(fixture).toString('base64');
const eligibility = extra => ({
  mode: 'chatgpt-web', configured: true, registered: true, userId: user.id,
  name: user.name, classId, hasAvatar: false, remaining: 1, ...extra,
});
const acceptedJob = body => ({ id: body.requestId, kind: body.kind, workId: body.workId, status: 'pending' });

// Exercise the real image-account module in a minimal page. The main classroom
// startup is intentionally absent, so its /me refresh cannot replace this fixture
// identity. Every student API is intercepted; no real account/photo is submitted.
async function setup(page, { cache = null, status, post, avatar } = {}) {
  const calls = { status: 0, posts: [], avatars: 0, unexpected: [] };
  await page.route(url => url.pathname === '/', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><head><meta charset="utf-8"></head><body><section id="my-view"><div class="my-heading">合成图片同步测试</div></section></body></html>',
  }));
  await page.route('**/api/student/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === '/api/student/image-status') {
      calls.status++;
      if (status) return status(route, calls);
      const last = calls.posts.at(-1);
      return route.fulfill({ json: eligibility(last ? { remaining: 0, pendingJobId: last.requestId, pendingStatus: 'pending' } : {}) });
    }
    if (path === '/api/student/image-profile/avatar') {
      calls.avatars++;
      if (avatar) return avatar(route, calls);
      return route.fulfill({ contentType: 'image/png', body: Buffer.from(photoBase64, 'base64') });
    }
    if (path === '/api/student/image-jobs' && method === 'POST') {
      const body = route.request().postDataJSON();
      calls.posts.push(body);
      if (post) return post(route, body, calls);
      return route.fulfill({ status: 201, json: { job: acceptedJob(body) } });
    }
    if (path === '/api/student/image-jobs' && method === 'GET') return route.fulfill({ json: { jobs: [] } });
    calls.unexpected.push(`${method} ${path}`);
    return route.fulfill({ status: 404, json: { error: '未预期的合成测试请求' } });
  });
  await page.goto('/');
  await page.evaluate(async ({ user, cache, photoBase64, workId }) => {
    if (cache) localStorage.setItem('fi-image-profile-' + user.id, JSON.stringify(cache));
    const { initStudentImages } = await import('/src/student-image-account.js');
    const { saveSounds } = await import('/src/storage.js');
    window.__imageFixture = {
      photo: new Blob([Uint8Array.from(atob(photoBase64), character => character.charCodeAt(0))], { type: 'image/png' }),
      workId,
    };
    await saveSounds([{ id: workId, name: '合成图片作品', blob: new Blob([], { type: 'audio/wav' }), createdAt: 1 }]);
    window.__imageStatuses = [];
    window.__imageNotifications = [];
    window.__imageSaved = 0;
    window.addEventListener('freeimpro-image-status', event => window.__imageStatuses.push(event.detail));
    window.__imageAccount = initStudentImages({
      notify: message => window.__imageNotifications.push(message),
      onSaved: async () => { window.__imageSaved++; },
      editIdentity: () => {},
    });
    window.dispatchEvent(new CustomEvent('freeimpro-student-session', { detail: { user } }));
  }, { user, cache, photoBase64, workId });
  return calls;
}

async function request(page, kind = 'identity') {
  return page.evaluate(async kind => {
    const fixture = window.__imageFixture;
    try {
      const job = await window.__imageAccount.request({
        kind, photo: fixture.photo,
        ...(kind === 'work' ? { workId: fixture.workId, workName: '合成图片作品' } : {}),
      });
      return { ok: true, job };
    } catch (error) { return { ok: false, error: error.message, status: error.status || null }; }
  }, kind);
}

test('a request waits for an in-flight refresh before replacing yesterday\'s pending quota', async ({ page }) => {
  let release;
  const statusReady = new Promise(resolve => { release = resolve; });
  const calls = await setup(page, {
    cache: eligibility({ remaining: 0, pendingJobId: '44444444-4444-4444-8444-444444444444', pendingStatus: 'pending' }),
    status: async (route, calls) => {
      if (calls.status === 1) await statusReady;
      const last = calls.posts.at(-1);
      return route.fulfill({ json: eligibility(last ? { remaining: 0, pendingJobId: last.requestId, pendingStatus: 'pending' } : {}) });
    },
  });
  await expect.poll(() => calls.status).toBe(1);
  await page.evaluate(() => {
    window.__requestOutcome = null;
    window.__pendingRequest = window.__imageAccount.request({ kind: 'identity', photo: window.__imageFixture.photo }).then(
      job => { window.__requestOutcome = { ok: true, job }; },
      error => { window.__requestOutcome = { ok: false, error: error.message }; },
    );
  });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  expect(calls.posts).toHaveLength(0);
  expect(await page.evaluate(() => window.__requestOutcome)).toBeNull();
  release();
  await expect.poll(() => page.evaluate(() => window.__requestOutcome?.ok)).toBe(true);
  expect(calls.posts).toHaveLength(1);
  expect(calls.posts[0].classId).toBe(classId);
  expect(calls.unexpected).toEqual([]);
});

test('a 503 downloading an existing avatar still publishes fresh eligibility and permits a work request', async ({ page }) => {
  const calls = await setup(page, {
    cache: eligibility({ registered: false, remaining: 0 }),
    status: (route, calls) => {
      const last = calls.posts.at(-1);
      return route.fulfill({ json: eligibility({ hasAvatar: true, ...(last ? { remaining: 0, pendingJobId: last.requestId, pendingStatus: 'pending' } : {}) }) });
    },
    avatar: route => route.fulfill({ status: 503, json: { error: '合成头像下载失败' } }),
  });
  await expect.poll(() => page.evaluate(() => window.__imageStatuses.some(status => status.registered && status.hasAvatar && status.remaining === 1))).toBe(true);
  const outcome = await request(page, 'work');
  expect(outcome.ok).toBe(true);
  expect(calls.avatars).toBeGreaterThan(0);
  expect(calls.posts).toHaveLength(1);
  expect(calls.posts[0]).toMatchObject({ kind: 'work', workId, workName: '合成图片作品' });
  expect(calls.unexpected).toEqual([]);
});

for (const status of [401, 503]) {
  test(`a ${status} status response blocks submission despite an eligible local cache`, async ({ page }) => {
    const message = status === 401 ? '课堂登录已失效，请重新连接课堂。' : '合成状态服务暂不可用';
    const calls = await setup(page, {
      cache: eligibility(),
      status: route => route.fulfill({ status, json: { error: message } }),
    });
    const outcome = await request(page);
    expect(outcome).toMatchObject({ ok: false, error: message, status });
    expect(calls.posts).toHaveLength(0);
    if (status === 401) await expect(page.locator('#student-profile-status')).toContainText('登录已失效');
    expect(calls.unexpected).toEqual([]);
  });
}

test('a successful 201 submission remains successful when the following status sync fails', async ({ page }) => {
  const calls = await setup(page, {
    status: (route, calls) => calls.posts.length
      ? route.fulfill({ status: 503, json: { error: '合成提交后状态同步失败' } })
      : route.fulfill({ json: eligibility() }),
  });
  const outcome = await request(page);
  expect(outcome.ok).toBe(true);
  expect(outcome.job).toMatchObject({ id: calls.posts[0].requestId, status: 'pending' });
  expect(calls.posts).toHaveLength(1);
  expect(calls.status).toBeGreaterThan(1);
  expect(await page.evaluate(() => window.__imageNotifications)).toEqual([]);
  expect(calls.unexpected).toEqual([]);
});

test('retrying an unknown network result reuses the same request ID even when the server reports a pending daily request', async ({ page }) => {
  const calls = await setup(page, {
    post: (route, body, calls) => calls.posts.length === 1
      ? route.abort('failed')
      : route.fulfill({ status: 201, json: { job: acceptedJob(body) } }),
  });
  const first = await request(page);
  expect(first.ok).toBe(false);
  expect(first.status).toBeNull();
  expect(calls.posts).toHaveLength(1);
  const retained = await page.evaluate(userId => JSON.parse(localStorage.getItem('fi-image-request-' + userId)), user.id);
  expect(retained.requestId).toBe(calls.posts[0].requestId);
  const second = await request(page);
  expect(second.ok).toBe(true);
  expect(calls.posts).toHaveLength(2);
  expect(calls.posts[1]).toEqual(calls.posts[0]);
  expect(second.job.id).toBe(calls.posts[0].requestId);
  expect(calls.unexpected).toEqual([]);
});
