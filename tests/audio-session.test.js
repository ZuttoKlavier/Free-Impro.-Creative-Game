import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareAudioSession, resumeAudioContext } from '../src/audio-session.js';
import { Sequencer } from '../src/sequencer.js';

async function withGlobals(values, run) {
  const originals = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    for (const [key, value] of Object.entries(values)) {
      Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    }
    return await run();
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

for (const type of ['playback', 'play-and-record']) {
  test(`prepares ${type} in WebKit before awaiting the native route`, async () => {
    const calls = [];
    let selected;
    let finish;
    const audioSession = {
      get type() { return selected; },
      set type(value) { selected = value; calls.push(['web', value]); },
    };
    await withGlobals({
      navigator: { audioSession },
      window: { FreeImproAudio: { prepare(value) {
        calls.push(['native', value, audioSession.type]);
        return new Promise(resolve => { finish = resolve; });
      } } },
    }, async () => {
      let completed = false;
      const prepared = prepareAudioSession(type).then(() => { completed = true; });
      assert.deepEqual(calls, [['web', type], ['native', type, type]]);
      await Promise.resolve();
      assert.equal(completed, false, 'playback must wait for the native route to be ready');
      finish();
      await prepared;
      assert.equal(completed, true);
    });
  });
}

test('native audio preparation errors reach the caller', async () => {
  const failure = new Error('Audio route unavailable');
  await withGlobals({
    navigator: { audioSession: {} },
    window: { FreeImproAudio: { async prepare() { throw failure; } } },
  }, async () => {
    await assert.rejects(prepareAudioSession('playback'), error => error === failure);
  });
});

test('unsupported browser and native session APIs remain safe no-ops', async () => {
  for (const values of [{ navigator: undefined, window: undefined }, { navigator: {}, window: {} }]) {
    await withGlobals(values, async () => {
      await prepareAudioSession('play-and-record');
      await prepareAudioSession('playback');
    });
  }
});

test('an invalid audio mode is rejected before changing either session', async () => {
  const calls = [];
  await withGlobals({
    navigator: { audioSession: { set type(value) { calls.push(['web', value]); } } },
    window: { FreeImproAudio: { prepare(value) { calls.push(['native', value]); } } },
  }, async () => {
    await assert.rejects(prepareAudioSession('record'), /音频模式无效/);
    assert.deepEqual(calls, []);
  });
});

test('an interrupted iOS AudioContext is resumed before returning it', async () => {
  let resumes = 0;
  const context = { state: 'interrupted', async resume() { resumes++; this.state = 'running'; } };
  assert.equal(await resumeAudioContext(context), context);
  assert.equal(context.state, 'running');
  assert.equal(resumes, 1);
});

test('a running context does not require another resume', async () => {
  const context = { state: 'running', resume() { assert.fail('running audio should not be interrupted again'); } };
  assert.equal(await resumeAudioContext(context), context);
});

test('a rejected resume reaches the caller instead of reporting successful playback', async () => {
  const failure = new Error('System interruption');
  const context = { state: 'interrupted', async resume() { throw failure; } };
  await assert.rejects(resumeAudioContext(context), error => error === failure);
});

test('a resolved resume that remains interrupted is still rejected', async () => {
  const context = { state: 'interrupted', async resume() {} };
  await assert.rejects(resumeAudioContext(context), /声音被系统中断/);
});

test('a closed context is rejected without attempting resume', async () => {
  const context = { state: 'closed', resume() { assert.fail('a closed context cannot resume'); } };
  await assert.rejects(resumeAudioContext(context), /声音播放已关闭/);
});

class InterruptedContext {
  constructor() {
    this.state = 'interrupted';
    this.currentTime = 0;
    this.destination = {};
    this.sources = [];
    this.resumes = 0;
  }
  async resume() { this.resumes++; this.state = 'running'; }
  createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
  createBufferSource() {
    const context = this;
    const source = {
      connect() {}, disconnect() {}, stop() {},
      start(time) {
        assert.equal(context.state, 'running', 'notes must not be scheduled on an interrupted context');
        this.time = time;
      },
    };
    this.sources.push(source);
    return source;
  }
}

test('Sequencer recovers interrupted audio and schedules an active sample after native preparation', async () => {
  let finish;
  await withGlobals({ navigator: {}, window: { FreeImproAudio: { prepare() {
    return new Promise(resolve => { finish = resolve; });
  } } } }, async () => {
    const context = new InterruptedContext();
    const engine = new Sequencer({ context, autoSchedule: false });
    try {
      engine.upsertTrack({ id: 'self', submissionId: 'sample', buffer: { duration: 0.1 }, pattern: [true, ...Array(15).fill(false)] });
      engine.setActive('self', true);
      const playing = engine.play();
      await Promise.resolve();
      assert.equal(engine.getState().playing, false);
      assert.equal(context.sources.length, 0);
      finish();
      await playing;
      assert.equal(context.resumes, 1);
      assert.equal(engine.getState().playing, true);
      assert.equal(context.sources.length, 1);
      assert.equal(context.sources[0].time, 0.025);
    } finally { engine.dispose(); }
  });
});

test('Sequencer retains stopped state when interrupted audio cannot resume', async () => {
  await withGlobals({ navigator: {}, window: {} }, async () => {
    const context = new InterruptedContext();
    context.resume = async () => {};
    const engine = new Sequencer({ context, autoSchedule: false });
    try {
      engine.upsertTrack({ id: 'self', submissionId: 'sample', buffer: { duration: 0.1 } });
      engine.setActive('self', true);
      await assert.rejects(engine.play(), /声音被系统中断/);
      assert.equal(engine.getState().playing, false);
      assert.equal(context.sources.length, 0);
    } finally { engine.dispose(); }
  });
});
