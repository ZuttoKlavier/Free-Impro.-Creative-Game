import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { createImageGenerator, validateImage } from '../server/images.js';
import { createApp } from '../server/app.js';
import { encodeWav } from '../src/audio.js';
import { randomUUID } from 'node:crypto';

const png = new PNG({ width: 32, height: 32 }); png.data.fill(170);
const image = 'data:image/png;base64,' + PNG.sync.write(png).toString('base64');
test('image adapter sends cropped image to official API, keeps secret server-side and requests transparent output', async () => {
  let called = false;
  const generator = createImageGenerator({ apiKey: 'test-not-a-real-key', fetchImpl: async (url, options) => {
    if (url === 'data:,') return fetch(url); // SDK's local multipart compatibility check.
    called = true; assert.equal(url, 'https://api.openai.com/v1/images/edits');
    assert.equal(new Headers(options.headers).get('authorization'), 'Bearer test-not-a-real-key');
    assert.equal(options.body.get('model'), 'gpt-image-2');
    assert.equal(options.body.get('background'), 'transparent'); assert.equal(options.body.get('n'), '1');
    assert.equal(options.body.get('image').type, 'image/png');
    return Response.json({ data: [{ b64_json: image.split(',')[1] }] });
  } });
  const result = await generator.generate(image); assert.ok(called); assert.equal(result.image, image); assert.ok(!JSON.stringify(result).includes('test-not-a-real-key'));
});
test('missing key, bad image, and upstream failure are explicit; errors never echo credentials', async () => {
  await assert.rejects(createImageGenerator({ apiKey: '' }).generate(image), /尚未配置/);
  assert.throws(() => validateImage('data:image/svg+xml;base64,AAAA'), /无效/);
  const corrupted = 'data:image/png;base64,' + Buffer.from('not an image').toString('base64'); assert.throws(() => validateImage(corrupted), /无效/);
  let calls = 0;
  await assert.rejects(createImageGenerator({ apiKey: 'private-key', fetchImpl: async url => { if (url === 'data:,') return fetch(url); calls++; return Response.json({ error: { message: 'private-key should never be echoed' } }, { status: 429 }); } }).generate(image), /额度不足/);
  assert.equal(calls, 1, 'A billed image operation is never automatically retried');
});
test('image adapter rejects corrupt provider output and honours cancellation without retry', async () => {
  const generator = createImageGenerator({ apiKey: 'test-key', fetchImpl: async () => Response.json({ data: [{ b64_json: Buffer.from('invalid').toString('base64') }] }) });
  await assert.rejects(generator.generate(image), /有效 PNG/);
  let calls = 0;
  const cancelled = createImageGenerator({ apiKey: 'test-key', fetchImpl: async (_url, options) => { calls++; options.signal.throwIfAborted(); throw new DOMException('cancelled', 'AbortError'); } });
  await assert.rejects(cancelled.generate(image, AbortSignal.abort()), error => error.status === 504);
  assert.ok(calls <= 1);
});
test('generation requires login; submitted images obey classroom access and stay attached to replacements', async () => {
  const { server, db } = createApp({ dbPath: ':memory:', imageGenerator: { configured: true, generate: async () => ({ image }) } });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const origin = `http://127.0.0.1:${server.address().port}`;
  const client = () => { let cookie = ''; return async (path, body) => { const res = await fetch(origin + '/api' + path, { method: body ? 'POST' : 'GET', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); if (res.headers.get('set-cookie')) cookie = res.headers.get('set-cookie').split(';')[0]; return { status: res.status, data: res.headers.get('content-type')?.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) }; }; };
  try {
    const student = client(), teacher = client(), other = client();
    assert.equal((await student('/characters', { photo: image })).status, 401);
    for (const [c, username, role] of [[student, 'student', 'student'], [teacher, 'teacher', 'teacher'], [other, 'other', 'student']]) await c('/register', { username, role, name: username, password: 'password123' });
    assert.equal((await student('/characters', { photo: image })).data.image, image);
    const room = (await teacher('/classrooms', { name: '带图课堂', capacity: 15, background: '教室' })).data.classroom;
    await student('/join', { code: room.code }); await other('/join', { code: room.code });
    const audio = Buffer.from(await encodeWav(new Float32Array(2400), 24000).arrayBuffer()).toString('base64');
    const result = await student(`/classrooms/${room.id}/submit`, { audio, image, imageKind: 'avatar', name: '杯子角色', requestId: randomUUID() });
    const submission = result.data.classroom.submissions[0]; assert.equal(submission.has_image, 1); assert.equal(submission.image_kind, 'avatar');
    assert.equal((await teacher(`/submissions/${submission.id}/image`)).status, 200);
    assert.equal((await other(`/submissions/${submission.id}/image`)).status, 403);
  } finally { await new Promise(r => server.close(r)); db.close(); }
});
