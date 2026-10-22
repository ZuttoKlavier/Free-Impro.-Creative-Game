import test from 'node:test';
import assert from 'node:assert/strict';
import { createObjectProp, validateObjectProp, encodeAvatarBackup, decodeAvatarBackup,
  OBJECT_PROP_SCHEMA_VERSION, OBJECT_PROP_STYLE_VERSION, MAX_PROP_PHOTO_DATA_URL_LENGTH, MAX_PROP_PHOTO_BYTES } from '../src/student-avatar-data.js';

const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9])], { type: 'image/jpeg' });
const toDataURL = async blob => `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`;
const decodePhoto = async () => ({ width: 640, height: 480 });
const definition = () => ({ id: 'cup', category: 'cup', asset: 'https://not-to-be-persisted.invalid/cup.png' });
const metadata = () => ({ score: .91, confirmedBy: 'detector', source: 'camera', captureRevision: 3,
  width: 640, height: 480, photo: jpeg, isCurrent() { return true; }, signal: new AbortController().signal,
  detection: { boundingBox: { originX: 100, originY: 80, width: 200, height: 180 } } });
const prop = () => createObjectProp(definition(), metadata(), { ownerId: 'student-1', capturedAt: 1700000000000 });

test('object metadata copies necessary fields without callbacks, signal, Blob or asset URLs', () => {
  const value = prop();
  assert.equal(value.schemaVersion, OBJECT_PROP_SCHEMA_VERSION);
  assert.equal(value.styleVersion, OBJECT_PROP_STYLE_VERSION);
  assert.equal(value.id, 'cup'); assert.equal(value.ownerId, 'student-1');
  assert.deepEqual(value.boundingBox, { originX: 100, originY: 80, width: 200, height: 180 });
  for (const key of ['asset', 'photo', 'signal', 'isCurrent', 'detection']) assert.equal(Object.hasOwn(value, key), false);
  assert.deepEqual(JSON.parse(JSON.stringify(value)), value);
});

test('all 12 known IDs match exact categories; inherited and URL-like IDs are rejected', () => {
  const entries = [['cup', 'cup'], ['apple', 'apple'], ['banana', 'banana'], ['orange', 'orange'], ['carrot', 'carrot'], ['book', 'book'], ['cell phone', 'cell-phone'], ['bowl', 'bowl'], ['scissors', 'scissors'], ['spoon', 'spoon'], ['toothbrush', 'toothbrush'], ['sports ball', 'sports-ball']];
  for (const [category, id] of entries) assert.equal(createObjectProp({ category, id }, metadata()).id, id);
  for (const category of ['constructor', '__proto__', 'bottle', 'https://bad.invalid/cup']) assert.throws(() => validateObjectProp({ ...prop(), category }), /类别/);
  assert.throws(() => validateObjectProp({ ...prop(), id: 'cell-phone' }), /类别/);
  assert.throws(() => createObjectProp(Object.create({ id: 'cup', category: 'cup' }), metadata()), /数据无效/);
});

test('unknown fields are stripped without invoking accessors or accepting inherited required fields', () => {
  let invoked = false;
  const dirty = { ...prop(), asset: 'javascript:alert(1)', url: 'https://bad.invalid/', propPhoto: jpeg };
  Object.defineProperty(dirty, 'extra', { get() { invoked = true; throw new Error('getter must not run'); } });
  assert.deepEqual(validateObjectProp(dirty), prop()); assert.equal(invoked, false);
  const inherited = Object.create(prop());
  assert.throws(() => validateObjectProp(inherited), /普通对象/);
  const accessor = { ...prop() };
  Object.defineProperty(accessor, 'category', { get() { invoked = true; return 'cup'; } });
  assert.throws(() => validateObjectProp(accessor), /类别/); assert.equal(invoked, false);
  const nullPrototype = Object.assign(Object.create(null), prop());
  assert.deepEqual(validateObjectProp(nullPrototype), prop());
});

test('numeric limits, origins and schema values are checked', () => {
  for (const score of [-.01, 1.01, NaN, Infinity, '0.8', undefined]) assert.throws(() => validateObjectProp({ ...prop(), score }), /置信度/);
  for (const score of [0, 1, null]) assert.equal(validateObjectProp({ ...prop(), score }).score, score);
  for (const patch of [{ width: 1281 }, { height: 0 }, { width: 4.5 }, { captureRevision: 0 }, { captureRevision: Infinity }, { capturedAt: -1 }, { ownerId: '' }, { schemaVersion: 2 }, { styleVersion: 'https://bad.invalid/' }, { source: 'upload' }, { confirmedBy: 'automatic' }]) assert.throws(() => validateObjectProp({ ...prop(), ...patch }), /数据无效/);
  assert.equal(validateObjectProp({ ...prop(), boundingBox: null }).boundingBox, null);
  assert.deepEqual(validateObjectProp({ ...prop(), boundingBox: { originX: -2, originY: 470, width: 20, height: 20 } }).boundingBox, { originX: 0, originY: 470, width: 18, height: 10 });
  for (const box of [{ originX: 700, originY: 0, width: 1, height: 1 }, { originX: 1, originY: 2, width: -1, height: 1 }, { originX: 0, originY: 0, width: Infinity, height: 1 }]) assert.throws(() => validateObjectProp({ ...prop(), boundingBox: box }), /识别框/);
});

test('backup roundtrip explicitly serializes the JPEG Blob and leaves legacy photo/avatar unchanged', async () => {
  const photo = new Blob(['legacy-photo']), avatar = new Blob(['legacy-avatar']);
  const sound = { objectProp: prop(), propPhoto: jpeg, photo, avatar };
  const encoded = await encodeAvatarBackup(sound, toDataURL);
  const transported = JSON.parse(JSON.stringify(encoded));
  assert.equal(typeof transported.propPhoto, 'string'); assert.match(transported.propPhoto, /^data:image\/jpeg;base64,/);
  assert.equal(Object.hasOwn(transported, 'photo'), false); assert.equal(Object.hasOwn(transported, 'avatar'), false);
  const decoded = await decodeAvatarBackup(transported, { decodePhoto });
  assert.ok(decoded.propPhoto instanceof Blob); assert.equal(decoded.propPhoto.type, 'image/jpeg');
  assert.deepEqual(new Uint8Array(await decoded.propPhoto.arrayBuffer()), new Uint8Array(await jpeg.arrayBuffer()));
  assert.deepEqual(decoded.objectProp, prop());
  assert.equal(sound.propPhoto, jpeg); assert.equal(sound.photo, photo); assert.equal(sound.avatar, avatar);
});

test('old backups produce empty patches; partial or inherited pairs are not accepted', async () => {
  assert.deepEqual(await decodeAvatarBackup({ id: 'old', photo: 'legacy' }), {});
  assert.deepEqual(await encodeAvatarBackup({ id: 'old' }, toDataURL), {});
  assert.deepEqual(await decodeAvatarBackup({ objectProp: null, propPhoto: null }), {});
  await assert.rejects(decodeAvatarBackup({ objectProp: prop() }), /同时存在/);
  await assert.rejects(decodeAvatarBackup({ propPhoto: await toDataURL(jpeg) }), /同时存在/);
  await assert.rejects(encodeAvatarBackup({ objectProp: prop(), propPhoto: {} }, toDataURL), /JPEG Blob/);
  await assert.rejects(decodeAvatarBackup(Object.create({ objectProp: prop(), propPhoto: await toDataURL(jpeg) })), /作品格式/);
});

test('import rejects external URLs, non-JPEG data, malformed base64 and oversize before image decoding', async () => {
  let calls = 0; const decoder = async () => { calls++; return { width: 640, height: 480 }; };
  for (const propPhoto of ['https://bad.invalid/photo.jpg', 'data:image/svg+xml;base64,AAAA', 'data:image/png;base64,AAAA', 'data:image/jpeg;base64,%%%=', 'data:image/jpeg;base64,/9j', 'data:image/jpeg;base64,AAAA', 'data:image/jpeg;base64,' + 'A'.repeat(MAX_PROP_PHOTO_DATA_URL_LENGTH)]) await assert.rejects(decodeAvatarBackup({ objectProp: prop(), propPhoto }, { decodePhoto: decoder }), /物品照片/);
  assert.equal(calls, 0);
  const huge = new Blob([new Uint8Array(MAX_PROP_PHOTO_BYTES + 1)], { type: 'image/jpeg' });
  await assert.rejects(encodeAvatarBackup({ objectProp: prop(), propPhoto: huge }, toDataURL), /过大/);
});

test('decoded dimensions must be bounded and match metadata; decoder resources close on failure', async () => {
  const item = { objectProp: prop(), propPhoto: await toDataURL(jpeg) };
  await assert.rejects(decodeAvatarBackup(item, { decodePhoto: async () => ({ width: 1281, height: 480 }) }), /实际尺寸/);
  let closed = 0;
  await assert.rejects(decodeAvatarBackup(item, { decodePhoto: async () => ({ width: 1280, height: 480, close() { closed++; } }) }), /记录尺寸/);
  assert.equal(closed, 1);
  await assert.rejects(decodeAvatarBackup(item, { decodePhoto: async () => { throw new Error('decode error'); } }), /无法解码/);
});

test('default decoder uses local createImageBitmap and closes the image', async () => {
  const original = globalThis.createImageBitmap; let closed = 0, seen;
  globalThis.createImageBitmap = async blob => { seen = blob; return { width: 640, height: 480, close() { closed++; } }; };
  try {
    const result = await decodeAvatarBackup({ objectProp: prop(), propPhoto: await toDataURL(jpeg) });
    assert.ok(seen instanceof Blob); assert.equal(result.propPhoto, seen); assert.equal(closed, 1);
  } finally { if (original) globalThis.createImageBitmap = original; else delete globalThis.createImageBitmap; }
});

test('encoding rejects accidental substitutions instead of writing {} or a different photo', async () => {
  await assert.rejects(encodeAvatarBackup({ objectProp: prop(), propPhoto: jpeg }, async () => ({})), /dataURL/);
  const other = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 2, 3, 0xff, 0xd9])], { type: 'image/jpeg' });
  await assert.rejects(encodeAvatarBackup({ objectProp: prop(), propPhoto: jpeg }, () => toDataURL(other)), /原照片不一致/);
});
