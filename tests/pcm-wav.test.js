import test from 'node:test';
import assert from 'node:assert/strict';
import { decodePcmWav, encodeWav, audioLevel } from '../src/audio.js';

async function fixture() {
  const rate = 48000;
  const samples = Float32Array.from({ length: rate }, (_, i) => 0.25 * Math.sin(2 * Math.PI * 440 * i / rate));
  return new Uint8Array(await encodeWav(samples, rate).arrayBuffer());
}

test('PCM decoding preserves real sample duration, peak and energy without an AudioContext', async () => {
  const decoded = decodePcmWav(await fixture());
  assert.equal(decoded.sampleRate, 48000);
  assert.equal(decoded.samples.length, 48000);
  const { peak, rms } = audioLevel(decoded.samples);
  assert.ok(Math.abs(peak - 0.25) < 0.00004);
  assert.ok(Math.abs(rms - 0.25 / Math.sqrt(2)) < 0.00004);
});

test('decoding and repackaging preserve every signed 16-bit PCM sample exactly', async () => {
  const samples = Float32Array.from({ length: 65536 }, (_, index) => (index - 32768) / 32768);
  const bytes = new Uint8Array(await encodeWav(samples, 48000).arrayBuffer());
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < samples.length; index++) assert.equal(view.getInt16(44 + index * 2, true), index - 32768);
  const decoded = decodePcmWav(bytes);
  assert.deepEqual(decoded.samples, samples);
  const repackaged = new Uint8Array(await encodeWav(decoded.samples, decoded.sampleRate).arrayBuffer());
  assert.deepEqual(repackaged, bytes, 'native playback packaging must not attenuate or requantize an existing PCM16 recording');
});

test('native-style WAV metadata and odd chunk padding do not become audio samples', async () => {
  const base = await fixture();
  const metadata = Uint8Array.from([74, 85, 78, 75, 3, 0, 0, 0, 1, 2, 3, 0]); // JUNK + padding
  const wav = new Uint8Array(base.length + metadata.length);
  wav.set(base.subarray(0, 12)); wav.set(metadata, 12); wav.set(base.subarray(12), 24);
  new DataView(wav.buffer).setUint32(4, wav.length - 8, true);
  const { samples, sampleRate } = decodePcmWav(wav);
  assert.equal(sampleRate, 48000); assert.equal(samples.length, 48000);
  assert.ok(audioLevel(samples).peak > 0.249);
});

test('extended fmt chunks from WAV writers remain readable', async () => {
  const base = await fixture(), wav = new Uint8Array(base.length + 2);
  wav.set(base.subarray(0, 36)); wav.set(base.subarray(36), 38);
  const view = new DataView(wav.buffer);
  view.setUint32(4, wav.length - 8, true); view.setUint32(16, 18, true);
  assert.equal(decodePcmWav(wav).samples.length, 48000);
});

test('truncated chunks and mismatched PCM formats are rejected', async () => {
  const base = await fixture();
  assert.throws(() => decodePcmWav(base.subarray(0, base.length - 1)), /WAV/);
  for (const [offset, value] of [[20, 3], [22, 2], [32, 0], [34, 32]]) {
    const broken = base.slice(); new DataView(broken.buffer).setUint16(offset, value, true);
    assert.throws(() => decodePcmWav(broken), /WAV/);
  }
  const broken = base.slice(); new DataView(broken.buffer).setUint32(40, 0xffffffff, true);
  assert.throws(() => decodePcmWav(broken), /WAV/);
});

test('silent PCM remains silent and oversized recording durations are rejected', async () => {
  const bytes = new Uint8Array(await encodeWav(new Float32Array(8000), 8000).arrayBuffer());
  assert.deepEqual(audioLevel(decodePcmWav(bytes).samples), { peak: 0, rms: 0 });
  const overlong = await encodeWav(new Float32Array(8000 * 16), 8000).arrayBuffer();
  assert.throws(() => decodePcmWav(overlong), /WAV/);
});
