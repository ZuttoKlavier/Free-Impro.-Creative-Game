import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';

const source = readFileSync(new URL('../ios/Bridge.js', import.meta.url), 'utf8');

function bridge(handler = () => ({ status: 200, type: 'application/json', encoded: Buffer.from('{}').toString('base64') })) {
  const calls = [], events = [];
  const eventTarget = new EventTarget();
  const window = {
    addEventListener: (...args) => eventTarget.addEventListener(...args),
    dispatchEvent: event => { events.push(event.type); return eventTarget.dispatchEvent(event); },
    webkit: { messageHandlers: { localFiles: { async postMessage(body) { calls.push(body); return handler(body); } } } },
  };
  vm.runInNewContext(source, {
    window, document: { addEventListener() {} }, crypto: { randomUUID },
    atob: value => Buffer.from(value, 'base64').toString('binary'), Uint8Array, DOMException, Response, Event,
  });
  return { classroom: window.FreeImproClassroom, auth: window.FreeImproAuth, window, calls, events };
}

test('initializing the bundled classroom bridge makes no requests or connections', async () => {
  const app = bridge();
  assert.equal(app.classroom.connected, false);
  assert.deepEqual(app.calls, []);
  assert.deepEqual(app.events, []);
  await assert.rejects(app.classroom.request('/api/student/me'), /登录账号/);
  assert.deepEqual(app.calls, []);
});

for (const [path, options] of [
  ['/api/student/account/options', {}],
  ['/api/student/account/phone/send', { method: 'POST', body: '{"phone":"13800000000"}' }],
]) test(`explicit ${path} is allowed before login without connecting`, async () => {
  const app = bridge();
  const response = await app.classroom.request(path, options);
  assert.equal(response.status, 200);
  assert.equal(app.calls[0].path, path);
  assert.equal(app.calls[0].method, options.method || 'GET');
  assert.equal(app.classroom.connected, false);
  assert.deepEqual(app.events, []);
  await assert.rejects(app.classroom.request('/api/student/image-jobs'), /登录账号/);
  assert.equal(app.calls.length, 1);
});

for (const path of ['/api/student/account/register', '/api/student/account/login', '/api/student/account/phone/verify', '/api/student/enter-classroom']) {
  test(`only successful ${path} opens the classroom connection`, async () => {
    let status = 401;
    const app = bridge(() => ({ status, type: 'application/json', encoded: Buffer.from('{"user":{"id":"student"}}').toString('base64') }));
    assert.equal((await app.classroom.request(path, { method: 'POST', body: '{}' })).status, 401);
    assert.equal(app.classroom.connected, false);
    assert.deepEqual(app.events, []);
    status = path.endsWith('/register') ? 201 : 200;
    assert.equal((await app.classroom.request(path, { method: 'POST', body: '{}' })).status, status);
    assert.equal(app.classroom.connected, true);
    assert.deepEqual(app.events, ['freeimpro-classroom-connected']);
    await app.classroom.request('/api/student/me');
    assert.equal(app.calls.at(-1).path, '/api/student/me');
  });
}

test('account endpoints do not widen unauthenticated access to wrong methods, teachers or OAuth', async () => {
  const app = bridge();
  for (const [path, method] of [
    ['/api/student/account/options', 'POST'],
    ['/api/student/account/login', 'GET'],
    ['/api/student/account/phone/send', 'GET'],
    ['/api/teacher/account/login', 'POST'],
    ['/api/student/account/oauth/wechat/start', 'POST'],
    ['https://example.com/api/student/account/login', 'POST'],
  ]) await assert.rejects(app.classroom.request(path, { method }), /登录账号/);
  assert.deepEqual(app.calls, []);
});

test('disconnect invalidates an in-flight account login and leaves offline mode closed', async () => {
  let finish;
  const app = bridge(body => body.action === 'classroom-request' ? new Promise(resolve => { finish = resolve; }) : true);
  const request = app.classroom.request('/api/student/account/login', { method: 'POST', body: '{}' });
  await app.classroom.disconnect();
  finish({ status: 200, type: 'application/json', encoded: Buffer.from('{}').toString('base64') });
  await assert.rejects(request, error => error.name === 'AbortError');
  assert.equal(app.classroom.connected, false);
  assert.deepEqual(app.events, ['freeimpro-classroom-disconnected']);
});

test('cancelled account login does not reach native transport', async () => {
  const app = bridge(), controller = new AbortController();
  controller.abort();
  await assert.rejects(app.classroom.request('/api/student/account/login', { method: 'POST', signal: controller.signal }), error => error.name === 'AbortError');
  assert.equal(app.classroom.connected, false);
  assert.deepEqual(app.calls, []);
});

test('native social login uses one controlled action and only returns the student', async () => {
  const app = bridge(body => body.action === 'student-social-login' ? { user: { id: 'student', name: '测试学生' } } : true);
  assert.deepEqual(app.calls, []);
  const result = await app.auth.signInSocial('apple');
  assert.equal(result.user.id, 'student');
  assert.deepEqual(JSON.parse(JSON.stringify(app.calls)), [{ action: 'student-social-login', provider: 'apple', mode: 'login' }]);
  assert.equal(app.classroom.connected, true);
  assert.deepEqual(app.events, ['freeimpro-classroom-connected']);
});

test('native social authorization errors and malformed replies preserve offline work', async () => {
  for (const response of [null, {}, { user: {} }, { user: { id: '' } }]) {
    const app = bridge(() => response);
    await assert.rejects(app.auth.signInSocial('wechat', 'login'), /登录未完成/);
    assert.equal(app.classroom.connected, false);
    assert.deepEqual(app.events, []);
  }
  const app = bridge(() => { throw new Error('已取消登录。'); });
  await assert.rejects(app.auth.signInSocial('apple'), /已取消/);
  assert.equal(app.classroom.connected, false);
  assert.deepEqual(app.events, []);
});

test('unsupported social provider, mode and repeated clicks cannot launch another authorization', async () => {
  let finish;
  const app = bridge(() => new Promise(resolve => { finish = resolve; }));
  for (const [provider, mode] of [['github', 'login'], ['wechat', 'anything']]) await assert.rejects(app.auth.signInSocial(provider, mode), /不支持/);
  assert.deepEqual(app.calls, []);
  const pending = app.auth.signInSocial('wechat', 'link');
  await assert.rejects(app.auth.signInSocial('apple'), /正在进行/);
  assert.equal(app.calls.length, 1);
  assert.equal(app.calls[0].mode, 'link');
  finish({ user: { id: 'student' } });
  await pending;
});

for (const event of ['freeimpro-background', 'freeimpro-classroom-disconnected']) test(`${event} invalidates a pending social result`, async () => {
  let finish;
  const app = bridge(body => body.action === 'student-social-login' ? new Promise(resolve => { finish = resolve; }) : true);
  const pending = app.auth.signInSocial('apple');
  if (event === 'freeimpro-classroom-disconnected') await app.classroom.disconnect();
  else app.window.dispatchEvent(new Event(event));
  finish({ user: { id: 'stale-student' } });
  await assert.rejects(pending, error => error.name === 'AbortError');
  assert.equal(app.classroom.connected, false);
  assert.equal(app.events.includes('freeimpro-classroom-connected'), false);
});
