import test from 'node:test';
import assert from 'node:assert/strict';
import { stretchBuffer } from '../src/time-stretch.js';
const context = { createBuffer(channels, length, sampleRate) {
  const data = Array.from({ length: channels }, () => new Float32Array(length));
  return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: c => data[c] };
} };
test('stretch and compression preserve tone pitch and channel alignment without resampling', () => {
  const input = context.createBuffer(2, 4800, 24000);
  for (let i = 0; i < input.length; i++) { input.getChannelData(0)[i] = Math.sin(2 * Math.PI * 440 * i / 24000); input.getChannelData(1)[i] = input.getChannelData(0)[i] * .5; }
  for (const duration of [.1, .5, 2]) {
    const output = stretchBuffer(context, input, duration), a = output.getChannelData(0), b = output.getChannelData(1);
    assert.equal(output.length, duration * 24000);
    let crossings = 0;
    for (let i = 241; i < a.length - 240; i++) { if (a[i - 1] <= 0 && a[i] > 0) crossings++; assert.ok(Number.isFinite(a[i])); assert.ok(Math.abs(b[i] - a[i] * .5) < 1e-5); }
    const frequency = crossings / ((a.length - 480) / 24000);
    assert.ok(Math.abs(frequency - 440) < 15, `frequency ${frequency}`);
    assert.equal(stretchBuffer(context, input, duration), output);
  }
});
