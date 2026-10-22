import { validateRhythm } from './rhythm-data.js';

function sourceBuffer(input) {
  if (!input || !Number.isInteger(input.sampleRate) || input.sampleRate <= 0 ||
      !Number.isInteger(input.length) || input.length <= 0 ||
      !Number.isInteger(input.numberOfChannels) || input.numberOfChannels <= 0 ||
      typeof input.getChannelData !== 'function') throw new Error('声音数据无效。');
  const channels = Array.from({ length: input.numberOfChannels }, (_, channel) => input.getChannelData(channel));
  if (channels.some(channel => !channel || channel.length < input.length)) throw new Error('声音数据不完整。');
  return input;
}

// Package the original sound at its normal speed for native playback. Each
// selected slot keeps only its source prefix, leaving the unused duration silent.
export function renderRhythmLoop(buffer, pattern, bars, bpm) {
  const rhythm = validateRhythm({ bars, steps: pattern });
  if (!Number.isFinite(bpm) || bpm < 40 || bpm > 240) throw new Error('试听速度需为 40–240。');
  const input = sourceBuffer(buffer), sampleRate = input.sampleRate;
  const stepDuration = 60 / bpm / 4, length = Math.max(1, Math.round(bars * 16 * stepDuration * sampleRate));
  const samples = new Float32Array(length);
  const channels = Array.from({ length: input.numberOfChannels }, (_, channel) => input.getChannelData(channel));
  for (let step = 0; step < rhythm.steps.length; step++) {
    const value = rhythm.steps[step]; if (!value) continue;
    const start = Math.round(step * stepDuration * sampleRate);
    const end = Math.min(length, Math.round((step + (typeof value === 'number' ? value : 1)) * stepDuration * sampleRate));
    const copied = Math.min(input.length, end - start);
    if (channels.length === 1) {
      samples.set(channels[0].subarray(0, copied), start);
      continue;
    }
    for (let index = 0; index < copied; index++) {
      let sample = 0;
      for (const channel of channels) sample += channel[index];
      samples[start + index] = sample / channels.length;
    }
  }
  for (let index = 0; index < samples.length; index++) {
    samples[index] = Number.isFinite(samples[index]) ? Math.max(-1, Math.min(1, samples[index])) : 0;
  }
  return { samples, sampleRate, duration: samples.length / sampleRate };
}
