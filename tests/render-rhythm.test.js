import test from 'node:test';
import assert from 'node:assert/strict';
import { renderRhythmLoop } from '../src/render-rhythm.js';

function buffer({ rate = 24000, seconds = 0.08, amplitude = 0.2, frequency = 440, channels = 1 } = {}) {
  const length = Math.round(rate * seconds);
  const samples = Array.from({ length: channels }, (_, channel) => Float32Array.from({ length }, (_, index) => amplitude / (channel + 1) * Math.sin(2 * Math.PI * frequency * index / rate)));
  return { sampleRate: rate, length, numberOfChannels: channels, duration: length / rate, getChannelData: channel => samples[channel] };
}
const pattern = (bars, notes) => Array.from({ length: bars * 16 }, (_, index) => notes[index] ?? false);
const prefix = (sound, length = sound.length) => sound.getChannelData(0).subarray(0, length);
const silent = samples => assert.ok(samples.every(sample => sample === 0), 'unused time must contain only silence');

test('native loop covers the requested bars and tempo with a bounded PCM sample count', () => {
  for (const bars of [1, 16]) for (const bpm of [40, 137, 240]) for (const rate of [24000, 44100]) {
    const loop = renderRhythmLoop(buffer({ rate }), pattern(bars, { 0: true }), bars, bpm);
    const requested = bars * 4 * 60 / bpm;
    assert.equal(loop.sampleRate, rate);
    assert.equal(loop.samples.length, Math.round(requested * rate));
    assert.equal(loop.duration, loop.samples.length / rate);
    assert.ok(Math.abs(loop.duration - requested) <= 0.5 / rate + 1e-12);
    assert.ok(loop.duration <= 96);
  }
});

test('a long block copies the original recording sample for sample and leaves its remaining time silent', () => {
  for (const rate of [24000, 44100, 48000]) for (const seconds of [0.04, 0.05, 0.2]) {
    const sound = buffer({ rate, seconds });
    const before = sound.getChannelData(0).slice();
    const loop = renderRhythmLoop(sound, pattern(1, { 0: 4 }), 1, 120);
    assert.deepEqual(loop.samples.subarray(0, sound.length), prefix(sound));
    silent(loop.samples.subarray(sound.length));
    assert.deepEqual(sound.getChannelData(0), before, 'rendering must not change the saved recording');
  }
});

test('short boolean and multi-step slots copy only the matching source prefix', () => {
  for (const rate of [8000, 24000, 44100, 48000]) for (const value of [true, 2, 4]) {
    const sound = buffer({ rate, seconds: 0.9 });
    const slotLength = Math.round((typeof value === 'number' ? value : 1) * 0.125 * rate);
    const loop = renderRhythmLoop(sound, pattern(1, { 0: value }), 1, 120);
    assert.deepEqual(loop.samples.subarray(0, slotLength), prefix(sound, slotLength));
    silent(loop.samples.subarray(slotLength));
  }
});

test('boolean notes leave short-recording rests silent and retrigger the original prefix on the next slot', () => {
  for (const seconds of [0.03, 0.3]) {
    const sound = buffer({ rate: 8000, seconds });
    const loop = renderRhythmLoop(sound, pattern(1, { 0: true, 1: true }), 1, 120);
    const slotLength = 1000, copied = Math.min(sound.length, slotLength);
    assert.deepEqual(loop.samples.subarray(0, copied), prefix(sound, copied));
    silent(loop.samples.subarray(copied, slotLength));
    assert.deepEqual(loop.samples.subarray(slotLength, slotLength + copied), prefix(sound, copied));
    silent(loop.samples.subarray(slotLength + copied));
  }
});

test('each slot stops on its absolute sample boundary even when tempo does not produce whole samples', () => {
  const rate = 44100, bpm = 137, secondsPerStep = 60 / bpm / 4;
  const sound = buffer({ rate, seconds: 0.8 });
  const loop = renderRhythmLoop(sound, pattern(1, { 1: true, 4: 3, 11: true }), 1, bpm);
  let previousEnd = 0;
  for (const [step, length] of [[1, 1], [4, 3], [11, 1]]) {
    const start = Math.round(step * secondsPerStep * rate), end = Math.round((step + length) * secondsPerStep * rate);
    silent(loop.samples.subarray(previousEnd, start));
    assert.deepEqual(loop.samples.subarray(start, end), prefix(sound, end - start));
    previousEnd = end;
  }
  silent(loop.samples.subarray(previousEnd));
});

test('last-step and last-block source tails never wrap into the next loop', () => {
  for (const bars of [1, 16]) for (const [step, value] of [[bars * 16 - 1, true], [bars * 16 - 4, 4]]) {
    const sound = buffer({ rate: 8000, seconds: 0.9 });
    const loop = renderRhythmLoop(sound, pattern(bars, { [step]: value }), bars, 120);
    const start = step * 1000, copied = loop.samples.length - start;
    silent(loop.samples.subarray(0, start));
    assert.deepEqual(loop.samples.subarray(start), prefix(sound, copied));
  }
});

test('silent input and an empty pattern stay silent, and mono packaging combines source channels at unity volume', () => {
  silent(renderRhythmLoop(buffer({ amplitude: 0 }), pattern(1, { 0: true, 8: 4 }), 1, 120).samples);
  silent(renderRhythmLoop(buffer(), pattern(1, {}), 1, 120).samples);
  const sound = buffer({ rate: 8000, channels: 2 });
  const loop = renderRhythmLoop(sound, pattern(1, { 0: true }), 1, 120);
  assert.deepEqual(loop.samples.subarray(0, sound.length), Float32Array.from(sound.getChannelData(0), (sample, index) => (sample + sound.getChannelData(1)[index]) / 2));
  silent(loop.samples.subarray(sound.length));
});

test('high-rate native packaging preserves the original sample rate and every source sample', () => {
  for (const rate of [96000, 192000]) {
    const sound = buffer({ rate, seconds: 0.08 });
    const loop = renderRhythmLoop(sound, pattern(1, { 0: 4 }), 1, 120);
    assert.equal(loop.sampleRate, rate); assert.equal(loop.samples.length, rate * 2);
    assert.deepEqual(loop.samples.subarray(0, sound.length), prefix(sound));
    silent(loop.samples.subarray(sound.length));
  }
});

test('invalid timing, overlapping held notes, and incomplete audio cannot produce a native loop', () => {
  const sound = buffer();
  assert.throws(() => renderRhythmLoop(sound, pattern(1, {}), 0, 120));
  assert.throws(() => renderRhythmLoop(sound, pattern(1, {}), 1, 39));
  assert.throws(() => renderRhythmLoop(sound, pattern(1, {}), 1, 241));
  assert.throws(() => renderRhythmLoop(sound, pattern(1, { 0: 4, 1: true }), 1, 120));
  assert.throws(() => renderRhythmLoop({ ...sound, getChannelData: () => new Float32Array(0) }, pattern(1, {}), 1, 120));
});
