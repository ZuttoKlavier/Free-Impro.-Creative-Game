import test from 'node:test';
import assert from 'node:assert/strict';
import { Sequencer } from '../src/sequencer.js';

class AudioClock {
  constructor() { this.currentTime = 0; this.state = 'running'; this.destination = {}; this.sources = []; }
  createGain() { return { gain: { value: 1, cancelScheduledValues() {}, setTargetAtTime() {} }, connect() {}, disconnect() {} }; }
  createBuffer(channels, length, sampleRate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: channel => data[channel] };
  }
  createBufferSource() {
    const source = { playbackRate: { value: 1 }, connect() {}, disconnect() {}, start(time, offset, duration) { Object.assign(this, { time, offset, duration }); }, stop() { this.stopped = true; } };
    this.sources.push(source);
    return source;
  }
}

async function setup({ pattern, duration = .2, bpm = 100, onTrigger } = {}) {
  const context = new AudioClock();
  const engine = new Sequencer({ context, autoSchedule: false, onTrigger });
  engine.setBpm(bpm);
  engine.upsertTrack({ id: 'self', submissionId: 'work', buffer: context.createBuffer(1, Math.round(duration * 4000), 4000), pattern });
  engine.setActive('self', true);
  await engine.play();
  const sounding = () => engine.getState().tracks[0].sounding;
  const advance = time => { context.currentTime = time; engine._pump(); };
  return { context, engine, sounding, advance };
}

test('sounding begins at the audio clock, not the look-ahead queue, and exposes detached metadata', async () => {
  const pattern = Array(16).fill(false); pattern[0] = 2;
  const { context, engine, sounding } = await setup({ pattern });
  try {
    assert.equal(context.sources.length, 1);
    assert.deepEqual(sounding(), []);
    context.currentTime = .024999;
    assert.deepEqual(sounding(), []);
    context.currentTime = .025;
    const notes = sounding();
    assert.deepEqual(notes, [{ step: 0, length: 2, time: .025, duration: .2, loop: 0 }]);
    assert.equal(notes[0].source, undefined);
    assert.equal(notes[0].buffer, undefined);
    notes[0].duration = 10; notes.push({ step: 10 });
    assert.deepEqual(sounding(), [{ step: 0, length: 2, time: .025, duration: .2, loop: 0 }]);
  } finally { engine.dispose(); }
});

test('a scheduled held sound remains visible after a main-thread stall without replaying missed notes', async () => {
  const triggers = [], pattern = Array(16).fill(false); pattern[0] = 4;
  const { context, engine, sounding, advance } = await setup({ pattern, duration: .4, onTrigger: event => triggers.push(event) });
  try {
    assert.equal(context.sources[0].buffer.duration, .4);
    assert.equal(context.sources[0].duration, .4);
    advance(.25);
    assert.equal(engine.getState().step, 1);
    assert.deepEqual(triggers, []);
    assert.equal(context.sources.length, 1);
    assert.deepEqual(sounding(), [{ step: 0, length: 4, time: .025, duration: .4, loop: 0 }]);
    context.currentTime = .424999;
    assert.equal(sounding().length, 1);
    context.currentTime = .425001;
    assert.deepEqual(sounding(), []);
  } finally { engine.dispose(); }
});

test('an ended short sound is not highlighted after a stall even if its ended callback is delayed', async () => {
  const triggers = [], pattern = Array(16).fill(false); pattern[0] = true;
  const { context, engine, sounding, advance } = await setup({ pattern, duration: .04, onTrigger: event => triggers.push(event) });
  try {
    advance(.25);
    assert.equal(context.sources.length, 1);
    assert.deepEqual(triggers, []);
    assert.deepEqual(sounding(), []);
  } finally { engine.dispose(); }
});

test('a sounding held buffer keeps its original prefix and scheduled cutoff when tempo changes', async () => {
  const pattern = Array(16).fill(false); pattern[0] = 4;
  const { context, engine, sounding, advance } = await setup({ pattern, duration: .8 });
  try {
    advance(.025);
    engine.setBpm(240);
    advance(.3);
    assert.equal(engine.getState().bpm, 240);
    assert.equal(context.sources[0].stopped, undefined);
    assert.equal(context.sources[0].buffer.duration, .8);
    assert.equal(context.sources[0].duration, .6);
    assert.equal(context.sources[0].offset, 0);
    assert.equal(context.sources[0].playbackRate.value, 1);
    assert.equal(sounding()[0].duration, .6);
    context.currentTime = .625;
    assert.deepEqual(sounding(), []);
  } finally { engine.dispose(); }
});

test('cancelled future sources, ended voices and stopped playback leave no sounding metadata', async () => {
  const pattern = Array(16).fill(false); pattern[0] = true; pattern[1] = true;
  const { context, engine, sounding, advance } = await setup({ pattern, bpm: 240 });
  try {
    assert.equal(context.sources.length, 2);
    advance(.03);
    assert.equal(sounding().length, 1);
    const cancelled = context.sources[1];
    engine.setPattern('self', Array(16).fill(false));
    assert.equal(cancelled.stopped, true);
    advance(.09);
    assert.deepEqual(sounding().map(note => note.step), [1]);
    const ended = context.sources.find(source => Math.abs(source.time - .0875) < 1e-9 && !source.stopped);
    ended.onended();
    assert.deepEqual(sounding(), []);
    engine.stop();
    assert.deepEqual(sounding(), []);
    assert.ok(context.sources.every(source => source === ended || source.stopped));
  } finally { engine.dispose(); }
});

test('single samples stop at their step boundary and cannot carry their tails into the next loop', async () => {
  const pattern = Array(16).fill(false); pattern[0] = true;
  const { context, engine, sounding, advance } = await setup({ pattern, duration: 1.25, bpm: 240 });
  try {
    advance(.03);
    assert.deepEqual(sounding().map(note => note.loop), [0]);
    assert.equal(context.sources[0].buffer.duration, 1.25);
    assert.equal(context.sources[0].duration, .0625);
    advance(.99);
    assert.deepEqual(sounding(), []);
    advance(1.03);
    assert.deepEqual(sounding().map(note => note.loop), [1]);
    assert.ok(sounding().every(note => note.length === 1 && note.duration === .0625));
    engine.setActive('self', false);
    assert.deepEqual(sounding(), []);
  } finally { engine.dispose(); }
});
