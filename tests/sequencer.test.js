import test from 'node:test';
import assert from 'node:assert/strict';
import { Sequencer } from '../src/sequencer.js';

class FakeContext {
  constructor() { this.currentTime = 0; this.state = 'running'; this.destination = {}; this.sources = []; }
  createGain() {
    return { gain: { value: 1, cancelScheduledValues() {}, setTargetAtTime(value) { this.value = value; } }, connect() {}, disconnect() {} };
  }
  createBufferSource() {
    const context = this;
    const source = { connect() {}, disconnect() {}, start(time) { this.time = time; }, stop() { this.stoppedAt = context.currentTime; } };
    this.sources.push(source);
    return source;
  }
}

function setup(callbacks = {}) {
  const context = new FakeContext();
  const engine = new Sequencer({ context, autoSchedule: false, ...callbacks });
  const add = (id, extra = {}) => engine.upsertTrack({ id, submissionId: `${id}-v1`, buffer: { name: `${id}-v1` }, ...extra });
  const advance = (target) => {
    while (context.currentTime < target - 1e-9) {
      context.currentTime = Math.min(target, context.currentTime + 0.01);
      engine._pump();
    }
  };
  const notes = () => context.sources.filter((source) => source.stoppedAt === undefined || source.stoppedAt > source.time + 1e-9);
  return { engine, context, add, advance, notes };
}

for (const bars of [1, 2, 8, 16]) {
  test(`${bars} bars form a complete continuous loop and each new voice joins at the next full boundary`, async () => {
    const boundaries = [];
    const triggers = [];
    const { engine, context, add, advance } = setup({ onBoundary: (state) => boundaries.push({ time: context.currentTime, ...state }), onTrigger: (value) => triggers.push(value) });
    engine.setBpm(240);
    engine.setBars(bars);
    add('a'); add('b');
    engine.setActive('a', true);
    await engine.play();
    const start = 0.025;
    const duration = bars;
    advance(start + duration / 3);
    engine.setActive('b', true);
    assert.equal(engine.getState().tracks[1].waiting, true);
    advance(start + duration - 0.001);
    assert.equal(engine.getState().tracks[1].active, false);
    assert.equal(triggers.some((event) => event.id === 'b'), false);
    advance(start + duration);
    assert.equal(engine.getState().tracks[1].active, true);
    assert.equal(engine.getState().tracks[1].waiting, false);
    assert.equal(engine.getState().loop, 1);
    assert.equal(triggers.find((event) => event.id === 'b').time.toFixed(6), (start + duration).toFixed(6));
    advance(start + duration * 3 + 0.05);
    assert.equal(boundaries.length, 3);
    assert.equal(engine.getState().playing, true);
    assert.equal(engine.getState().bars, bars);
    assert.equal(engine.getState().loop, 3);
    engine.dispose();
  });
}

test('an operation inside the audio look-ahead window reschedules the boundary without early state or sound', async () => {
  const { engine, add, advance, notes } = setup();
  engine.setBpm(240);
  add('a');
  await engine.play();
  advance(1.005); // The next loop at 1.025 is already in the Web Audio look-ahead queue.
  engine.setActive('a', true);
  assert.equal(engine.getState().tracks[0].active, false);
  assert.equal(engine.getState().tracks[0].waiting, true);
  assert.ok(notes().some((source) => Math.abs(source.time - 1.025) < 1e-9));
  advance(1.025);
  assert.equal(engine.getState().tracks[0].active, true);
  engine.dispose();
});

test('exit silences sounding and scheduled voices immediately, cancel join works, rejoin waits another boundary', async () => {
  const { engine, context, add, advance, notes } = setup();
  engine.setBpm(240); add('a'); add('b');
  engine.setActive('a', true);
  await engine.play();
  advance(0.04);
  engine.setActive('a', false);
  assert.equal(engine.getState().tracks[0].active, false);
  assert.ok(context.sources.filter((source) => source.buffer.name === 'a-v1').every((source) => source.stoppedAt === 0.04));
  engine.setActive('b', true);
  engine.setActive('b', false);
  engine.setActive('a', true);
  advance(1.024);
  assert.equal(engine.getState().tracks[0].active, false);
  advance(1.025);
  assert.equal(engine.getState().tracks[0].active, true);
  assert.equal(engine.getState().tracks[1].active, false);
  assert.equal(notes().some((source) => source.buffer.name === 'b-v1'), false);
  engine.dispose();
});

test('pattern and accepted material replacements apply together at the next loop while retaining participation and position', async () => {
  const { engine, add, advance, notes } = setup();
  engine.setBpm(240); add('a'); engine.setActive('a', true);
  engine.setPosition('a', { x: 0.4, y: 0.7 });
  await engine.play();
  advance(0.2);
  const pattern = Array(16).fill(false); pattern[2] = true;
  engine.setPattern('a', pattern);
  engine.replaceTrack('a', { submissionId: 'a-v2', buffer: { name: 'a-v2' } });
  assert.equal(engine.getState().tracks[0].submissionId, 'a-v1');
  assert.equal(engine.getState().tracks[0].pendingSubmissionId, 'a-v2');
  advance(1.024);
  assert.equal(engine.getState().tracks[0].pattern[0], true);
  assert.equal(notes().some((source) => source.buffer.name === 'a-v2' && source.time < 1.025), false);
  advance(1.025);
  const track = engine.getState().tracks[0];
  assert.equal(track.submissionId, 'a-v2');
  assert.deepEqual(track.pattern, pattern);
  assert.equal(track.pendingPattern, null);
  assert.equal(track.pendingSubmissionId, null);
  assert.equal(track.active, true);
  assert.deepEqual(track.position, { x: 0.4, y: 0.7 });
  advance(1.2);
  const replacement = notes().find((source) => source.buffer.name === 'a-v2');
  assert.ok(Math.abs(replacement.time - 1.15) < 1e-9);
  engine.dispose();
});

test('bar length waits for the two-loop boundary and removed bars never reappear when enlarged', async () => {
  const { engine, add, advance } = setup();
  engine.setBpm(240); engine.setBars(8); add('a');
  await engine.play();
  advance(3); engine.setBars(5);
  advance(8.025);
  assert.equal(engine.getState().bars, 8);
  assert.equal(engine.getState().pendingBars, 5);
  advance(16.024);
  assert.equal(engine.getState().bars, 8);
  advance(16.025);
  assert.equal(engine.getState().bars, 5);
  assert.equal(engine.getState().tracks[0].pattern.length, 80);
  engine.setBars(7);
  advance(21.025);
  assert.equal(engine.getState().bars, 5);
  advance(26.025);
  assert.equal(engine.getState().bars, 7);
  assert.equal(engine.getState().tracks[0].pattern.length, 112);
  assert.equal(engine.getState().tracks[0].pattern.slice(80).some(Boolean), false);
  engine.dispose();
});

test('stop commits waiting changes, retains selected voices and restarts from zero with no pause state', async () => {
  const { engine, add, advance } = setup();
  add('a'); await engine.play(); advance(0.2);
  engine.setActive('a', true);
  engine.setBars(3);
  const pattern = Array(16).fill(false); pattern[5] = true;
  engine.setPattern('a', pattern);
  engine.replaceTrack('a', { submissionId: 'a-v2', buffer: { name: 'a-v2' } });
  engine.stop();
  let state = engine.getState();
  assert.equal(state.playing, false);
  assert.equal(state.progress, 0);
  assert.equal(state.step, 0);
  assert.equal(state.loop, 0);
  assert.equal(state.bars, 3);
  assert.equal(state.tracks[0].active, true);
  assert.equal(state.tracks[0].waiting, false);
  assert.equal(state.tracks[0].submissionId, 'a-v2');
  assert.equal(state.tracks[0].pattern.length, 48);
  assert.equal(state.tracks[0].pattern[5], true);
  await engine.play();
  state = engine.getState();
  assert.equal(state.playing, true);
  assert.equal(state.step, 0);
  assert.equal(state.loop, 0);
  engine.dispose();
});

test('tempo and swing change the remaining step continuously; paired swing durations preserve the beat', async () => {
  const { engine, context, add, advance, notes } = setup();
  engine.setBpm(120); add('a', { pattern: Array(16).fill(true) }); engine.setActive('a', true);
  await engine.play();
  advance(0.0875); // Halfway through the first 0.125-second step.
  const before = engine.getState().progress;
  engine.setBpm(240);
  assert.ok(Math.abs(engine.getState().progress - before) < 1e-9);
  assert.equal(engine.getState().step, 0);
  const next = notes().filter((source) => source.time > context.currentTime)[0];
  assert.ok(Math.abs(next.time - 0.11875) < 1e-9);
  engine.stop();
  engine.setSwing(0.5);
  await engine.play();
  const start = context.currentTime + 0.025;
  advance(start + 0.2);
  const swung = notes().filter((source) => source.time >= start - 1e-9);
  assert.ok(Math.abs(swung[1].time - swung[0].time - 0.09375) < 1e-9);
  assert.ok(Math.abs(swung[2].time - swung[1].time - 0.03125) < 1e-9);
  assert.ok(Math.abs(swung[2].time - swung[0].time - 0.125) < 1e-9);
  const progress = engine.getState().progress;
  engine.setSwing(0.2);
  assert.ok(Math.abs(engine.getState().progress - progress) < 1e-9);
  engine.dispose();
});

test('50 simultaneous voices share exact start times and live gains, and repeated upserts retain the arrangement', async () => {
  const { engine, add, advance, notes } = setup();
  for (let i = 0; i < 50; i += 1) { add(i); engine.setActive(i, true); }
  assert.throws(() => add(50), /50/);
  const pattern = Array(16).fill(true);
  engine.setPattern(0, pattern);
  add(0);
  assert.deepEqual(engine.getState().tracks[0].pattern, pattern);
  await engine.play(); advance(0.03);
  const first = notes().filter((source) => source.time === 0.025);
  assert.equal(first.length, 50);
  engine.setTrackVolume(0, 0.3); engine.setVolume(0.2);
  assert.equal(engine._gains.get(0).gain.value, 0.3);
  assert.equal(engine._master.gain.value, 0.2);
  assert.equal(engine.getState().tracks[0].active, true);
  assert.equal(engine.getState().step, 0);
  engine.dispose();
});

test('edits in newly added bars survive the two-loop boundary and shrinking keeps the current tail until that boundary', async () => {
  const { engine, add, advance } = setup();
  engine.setBpm(240); add('a', { pattern: Array(16).fill(false) }); engine.setActive('a', true);
  await engine.play(); advance(.2);
  engine.setBars(3);
  const expanded = Array(48).fill(false); expanded[0] = true; expanded[40] = true;
  engine.setPattern('a', expanded);
  advance(1.025);
  assert.equal(engine.getState().bars, 1);
  assert.equal(engine.getState().tracks[0].pattern[0], true);
  assert.equal(engine.getState().tracks[0].pendingPattern[40], true);
  advance(2.025);
  assert.equal(engine.getState().bars, 3);
  assert.equal(engine.getState().tracks[0].pattern[40], true);
  engine.setBars(1); engine.setPattern('a', [true, ...Array(15).fill(false)]);
  advance(5.025);
  assert.equal(engine.getState().bars, 3);
  assert.equal(engine.getState().tracks[0].pattern[40], true);
  advance(8.025);
  assert.equal(engine.getState().bars, 1);
  assert.equal(engine.getState().tracks[0].pattern.length, 16);
  engine.dispose();
});

test('an action after a stalled scheduler uses the current loop, without bursting missed notes', async () => {
  const { engine, context, add, advance, notes } = setup();
  engine.setBpm(240); add('a'); add('b'); engine.setActive('a', true);
  await engine.play(); advance(.1);
  context.currentTime = 2.4;
  engine.setActive('b', true);
  assert.equal(engine.getState().loop, 2);
  assert.equal(engine.getState().tracks[1].waiting, true);
  assert.equal(notes().some(s => s.buffer.name === 'b-v1' && s.time < 3.025), false);
  advance(3.025);
  assert.equal(engine.getState().tracks[1].active, true);
  engine.dispose();
});
