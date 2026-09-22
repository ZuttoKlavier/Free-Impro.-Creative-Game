import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSlices, demoAudio, trimSamples, encodeWav } from '../src/audio.js';
import 'fake-indexeddb/auto';
import { saveSounds, listSounds, deleteSound } from '../src/storage.js';

test('three separate attacks produce independent, bounded slices', () => {
  const { samples, sampleRate } = demoAudio();
  const slices = detectSlices(samples, sampleRate);
  assert.equal(slices.length, 3);
  for (let i = 0; i < slices.length; i++) {
    assert.ok(Math.abs(slices[i].start - [0.35, 1.15, 2.1][i]) < 0.025);
    assert.ok(slices[i].end - slices[i].start <= 1);
    if (i) assert.ok(slices[i].start >= slices[i - 1].end);
  }
});
test('silence and quiet ambient noise do not invent attacks', () => {
  assert.deepEqual(detectSlices(new Float32Array(48000), 48000), []);
  assert.deepEqual(detectSlices(Float32Array.from({ length: 48000 }, (_, i) => Math.sin(i) * 0.001), 48000), []);
});
test('separate attacks in a decaying signal and very late hits stay bounded', () => {
  const rate = 24000, data = new Float32Array(rate * 2);
  for (const start of [0.1, 0.45, 1.99]) for (let i = 0; i < rate * 0.7 && Math.floor(start * rate) + i < data.length; i++) data[Math.floor(start * rate) + i] += Math.sin(i * 0.3) * Math.exp(-i / rate * 10) * 0.7;
  const slices = detectSlices(data, rate);
  assert.equal(slices.length, 3);
  assert.ok(slices.at(-1).end <= 2);
});
test('trim rejects overlong, empty or invalid range; WAV has actual PCM duration', async () => {
  const { samples, sampleRate } = demoAudio();
  assert.throws(() => trimSamples(samples, sampleRate, 0, 1.01));
  assert.throws(() => trimSamples(samples, sampleRate, 1, 1));
  assert.throws(() => trimSamples(samples, sampleRate, NaN, 1));
  const result = trimSamples(samples, sampleRate, 0.3, 1.3);
  const view = new DataView(await encodeWav(result, sampleRate).arrayBuffer());
  assert.equal(view.getUint32(24, true), sampleRate);
  assert.equal(view.getUint32(40, true), sampleRate * 2);
  assert.equal(Math.abs(result[0]), 0); assert.equal(Math.abs(result.at(-1)), 0);
});
test('library limit is atomic, replacement does not consume a slot, failed import leaves data intact', async () => {
  const items = Array.from({ length: 200 }, (_, i) => ({ id: String(i), name: 'test', createdAt: i }));
  await saveSounds(items);
  await assert.rejects(saveSounds([{ id: 'overflow' }, { id: '0', name: 'should not update' }]), /200/);
  assert.equal((await listSounds()).length, 200);
  assert.equal((await listSounds()).find(i => i.id === '0').name, 'test');
  await saveSounds([{ ...items[0], name: 'renamed' }]);
  assert.equal((await listSounds()).find(i => i.id === '0').name, 'renamed');
  await deleteSound('1'); await saveSounds([{ id: 'new', createdAt: 300 }]);
  assert.equal((await listSounds()).length, 200);
});
