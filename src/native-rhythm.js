import { decodePcmWav, encodeWav } from './audio.js';
import { renderRhythmLoop } from './render-rhythm.js';

// Student-only adapter: the iPhone plays the rendered loop with AVAudioPlayer.
// The teacher's multi-track sequencer continues to use its shared WebAudio clock.
export class NativeRhythmPreview {
  constructor({ onTick, onError } = {}) {
    this.onTick = onTick; this.onError = onError;
    this._generation = 0; this._revision = 0; this._recipes = new Map();
    this._bars = 1; this._bpm = 100; this._track = null;
    this._playing = false; this._disposed = false; this._id = null;
    this._remote = null; this._receivedAt = 0; this._polling = false;
    const owner = this;
    this.context = {
      state: 'running',
      get currentTime() { return owner._remote ? owner._remote.deviceTime + (owner._playing ? (performance.now() - owner._receivedAt) / 1000 : 0) : 0; },
      async decodeAudioData(bytes) {
        const { samples, sampleRate } = decodePcmWav(bytes);
        return { length: samples.length, sampleRate, duration: samples.length / sampleRate, numberOfChannels: 1, getChannelData: () => samples };
      },
    };
    this._ended = event => {
      if (event.detail?.id !== this._id) return;
      this.stop(); this.onError?.(new Error('节奏试听被系统中断，请再次点击播放试听。'));
    };
    window.addEventListener('freeimpro-audio-ended', this._ended);
  }

  async ready() { if (this._disposed) throw new Error('试听已关闭，请重新打开节奏。'); return this.context; }
  setBars(bars) { this._bars = bars; this._queue(); }
  setBpm(bpm) { this._bpm = bpm; this._queue(); }
  upsertTrack(track) { this._track = { ...track, pattern: [...track.pattern], active: false }; }
  setPattern(id, pattern) { if (this._track?.id === id) { this._track.pattern = [...pattern]; this._queue(); } }
  setActive(id, active) { if (this._track?.id === id) this._track.active = active; }

  _snapshot() {
    if (!this._track?.buffer) throw new Error('声音尚未载入。');
    return { bars: this._bars, bpm: this._bpm, pattern: [...this._track.pattern], buffer: this._track.buffer, revision: ++this._revision };
  }
  async _encoded(recipe) {
    const { samples, sampleRate } = renderRhythmLoop(recipe.buffer, recipe.pattern, recipe.bars, recipe.bpm);
    const bytes = new Uint8Array(await encodeWav(samples, sampleRate).arrayBuffer());
    const parts = [];
    for (let i = 0; i < bytes.length; i += 8192) parts.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
    return btoa(parts.join(''));
  }

  async play() {
    if (this._disposed) throw new Error('试听已关闭，请重新打开节奏。');
    const generation = ++this._generation, id = this._id = crypto.randomUUID();
    const recipe = this._snapshot(); this._recipes.set(recipe.revision, recipe);
    const encoded = await this._encoded(recipe);
    if (generation !== this._generation || this._disposed) return;
    if (!await window.FreeImproAudio.playRhythm(id, encoded, recipe.bars, recipe.bpm, recipe.revision)) throw new Error('节奏未能开始播放，请重试。');
    if (generation !== this._generation || this._disposed) { await window.FreeImproAudio.stopPlayback(id); return; }
    this._playing = true;
    await this._refresh(generation);
    if (generation !== this._generation) return;
    this._poll = setInterval(() => this._refresh(generation), 80);
    const draw = () => { if (!this._playing) return; this.onTick?.(this.getState()); this._raf = requestAnimationFrame(draw); };
    this._raf = requestAnimationFrame(draw);
  }

  _queue() {
    if (!this._playing || this._disposed) return;
    clearTimeout(this._queueTimer);
    // Combine the draft's BPM/pattern edits before encoding a new loop.
    this._queueTimer = setTimeout(async () => {
      const generation = this._generation, id = this._id;
      try {
        const recipe = this._snapshot(); this._recipes.set(recipe.revision, recipe);
        const encoded = await this._encoded(recipe);
        if (generation !== this._generation || recipe.revision !== this._revision) return;
        await window.FreeImproAudio.queueRhythm(id, encoded, recipe.bars, recipe.bpm, recipe.revision);
      } catch (error) { if (generation === this._generation) this.onError?.(error); }
    }, 20);
  }

  async _refresh(generation) {
    if (this._polling || generation !== this._generation) return;
    this._polling = true;
    try {
      const state = await window.FreeImproAudio.rhythmState(this._id);
      if (generation !== this._generation) return;
      if (!state?.active) { this.stop(); this.onError?.(new Error('节奏试听已中断，请再次点击播放试听。')); return; }
      this._remote = state; this._receivedAt = performance.now();
      for (const revision of this._recipes.keys()) if (revision < state.revision - 1) this._recipes.delete(revision);
      this.onTick?.(this.getState());
    } catch (error) { if (generation === this._generation) { this.stop(); this.onError?.(error); } }
    finally { this._polling = false; }
  }

  getState() {
    const remote = this._remote, recipe = remote && this._recipes.get(remote.revision);
    const duration = remote?.duration || this._bars * 4 * 60 / this._bpm;
    const elapsed = this._playing && remote ? Math.max(0, this.context.currentTime - Math.max(remote.deviceTime, remote.startDeviceTime || remote.deviceTime)) : 0;
    const position = remote ? (remote.position + elapsed) % duration : 0;
    const loop = remote ? remote.loop + Math.floor((remote.position + elapsed) / duration) : 0;
    const bpm = recipe?.bpm || this._bpm, bars = recipe?.bars || this._bars, stepDuration = 60 / bpm / 4;
    const step = Math.min(bars * 16 - 1, Math.floor(position / stepDuration));
    const now = this.context.currentTime, loopStart = now - position, sounding = [];
    if (this._playing && recipe && now >= (remote.startDeviceTime || 0)) {
      recipe.pattern.forEach((value, index) => {
        if (!value) return;
        const length = typeof value === 'number' ? value : 1;
        const noteDuration = Math.min(recipe.buffer.duration, length * stepDuration);
        const time = loopStart + index * stepDuration;
        if (time <= now && now < time + noteDuration) sounding.push({ step: index, length, time, duration: noteDuration, loop });
      });
    }
    return { playing: this._playing, bpm, bars, pendingBars: null, step, loop, progress: this._playing ? position / duration : 0, remaining: this._playing ? duration - position : 0, tracks: this._track ? [{ ...this._track, sounding, active: this._playing, waiting: false }] : [] };
  }

  stop() {
    ++this._generation; this._playing = false;
    clearInterval(this._poll); clearTimeout(this._queueTimer); cancelAnimationFrame(this._raf);
    const id = this._id; this._id = null; this._remote = null; this._recipes.clear();
    if (id) window.FreeImproAudio.stopPlayback(id).catch(error => this.onError?.(error));
    this.onTick?.(this.getState());
  }
  dispose() { this.stop(); this._disposed = true; window.removeEventListener('freeimpro-audio-ended', this._ended); }
}
