const STEPS_PER_BAR = 16;
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const resizePattern = (pattern, bars) => Array.from({ length: bars * STEPS_PER_BAR }, (_, i) => Boolean(pattern[i]));
const defaultPattern = (bars) => Array.from({ length: bars * STEPS_PER_BAR }, (_, i) => i % 4 === 0);
const position = (value) => ({ x: clamp(value.x, 0, 1), y: clamp(value.y, 0, 1) });

function cloneTrack(track) {
  return { ...track, pattern: [...track.pattern], pendingPattern: track.pendingPattern && [...track.pendingPattern] };
}

// Used by both the audible look-ahead timeline and the state committed at a boundary.
function commitPending(model, includeBars) {
  if (includeBars && model.pendingBars !== null) {
    model.bars = model.pendingBars;
    model.pendingBars = null;
    for (const track of model.tracks.values()) {
      track.pattern = resizePattern(track.pattern, model.bars);
      if (track.pendingPattern) track.pendingPattern = resizePattern(track.pendingPattern, model.bars);
    }
  }
  for (const track of model.tracks.values()) {
    if (track.pendingPattern) {
      if (model.pendingBars !== null) {
        // Edits within the old length apply next loop. Keep its trailing bars audible
        // until the two-loop length boundary, and retain new bars for that boundary.
        track.pattern = track.pattern.map((value, index) => index < track.pendingPattern.length ? track.pendingPattern[index] : value);
      } else {
        track.pattern = resizePattern(track.pendingPattern, model.bars);
        track.pendingPattern = null;
      }
    }
    if (track.pendingReplacement) {
      track.submissionId = track.pendingReplacement.submissionId;
      track.buffer = track.pendingReplacement.buffer;
      track.pendingReplacement = null;
    }
    if (track.waiting) {
      track.active = true;
      track.waiting = false;
    }
  }
}

/** One AudioContext clock for every voice; no per-student media elements. */
export class Sequencer {
  constructor({ onTick, onChange, onTrigger, onBoundary, context, autoSchedule = true } = {}) {
    this.onTick = onTick;
    this.onChange = onChange;
    this.onTrigger = onTrigger;
    this.onBoundary = onBoundary;
    this.context = context || null;
    this._ownsContext = !context;
    this._autoSchedule = autoSchedule;
    this._model = { bars: 1, pendingBars: null, tracks: new Map() };
    this._bpm = 100;
    this._swing = 0;
    this._volume = 0.8;
    this._playing = false;
    this._loop = 0;
    this._step = 0;
    this._events = [];
    this._current = null;
    this._cursor = null;
    this._gains = new Map();
    this._sources = new Map();
    this._generation = 0;
    this._disposed = false;
    this._lookAhead = 0.12;
  }

  async ready() {
    if (this._disposed) throw new Error('播放引擎已关闭');
    if (!this.context) {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Context) throw new Error('当前浏览器不支持音频播放');
      this.context = new Context();
    }
    if (!this._master) {
      this._master = this.context.createGain();
      this._master.gain.value = this._volume;
      // A shared limiter protects the output when many students strike together.
      if (this.context.createDynamicsCompressor) {
        this._limiter = this.context.createDynamicsCompressor();
        Object.assign(this._limiter.threshold, { value: -3 });
        Object.assign(this._limiter.knee, { value: 0 });
        Object.assign(this._limiter.ratio, { value: 20 });
        Object.assign(this._limiter.attack, { value: 0.003 });
        Object.assign(this._limiter.release, { value: 0.12 });
        this._master.connect(this._limiter);
        this._limiter.connect(this.context.destination);
      } else this._master.connect(this.context.destination);
      for (const track of this._model.tracks.values()) this._gainFor(track);
    }
    return this.context;
  }

  getState() {
    const now = this.context?.currentTime || 0;
    const fraction = this._playing && this._current ? clamp((now - this._current.time) / this._current.duration, 0, 1) : 0;
    return {
      playing: this._playing, bpm: this._bpm, swing: this._swing, volume: this._volume,
      bars: this._model.bars, pendingBars: this._model.pendingBars, loop: this._loop,
      step: this._step, progress: this._playing ? (this._step + fraction) / (this._model.bars * STEPS_PER_BAR) : 0,
      tracks: [...this._model.tracks.values()].map((track) => ({
        id: track.id, submissionId: track.submissionId, pattern: [...track.pattern],
        pendingPattern: track.pendingPattern && [...track.pendingPattern], active: track.active,
        waiting: track.waiting, volume: track.volume, position: { ...track.position },
        pendingSubmissionId: track.pendingReplacement?.submissionId ?? null,
      })),
    };
  }

  upsertTrack({ id, submissionId, buffer, pattern, volume = 1, position: initialPosition }) {
    this._catchUp();
    if (this._model.tracks.has(id)) {
      const track = this._model.tracks.get(id);
      if (track.submissionId !== submissionId && track.pendingReplacement?.submissionId !== submissionId) {
        this.replaceTrack(id, { submissionId, buffer });
      }
      return;
    }
    if (this._model.tracks.size >= 50) throw new Error('一堂课最多支持 50 个声音');
    if (!buffer) throw new Error('声音尚未载入');
    const index = this._model.tracks.size;
    this._model.tracks.set(id, {
      id, submissionId, buffer, pattern: pattern ? resizePattern(pattern, this._model.bars) : defaultPattern(this._model.bars),
      pendingPattern: null, pendingReplacement: null, active: false, waiting: false,
      volume: clamp(volume, 0, 1), position: position(initialPosition || { x: ((index % 10) + 0.5) / 10, y: (Math.floor(index / 10) + 0.5) / 5 }),
    });
    if (this._master) this._gainFor(this._model.tracks.get(id));
    this._changed();
  }

  replaceTrack(id, { submissionId, buffer }) {
    this._catchUp();
    const track = this._track(id);
    if (!buffer) throw new Error('声音尚未载入');
    if (track.submissionId === submissionId || track.pendingReplacement?.submissionId === submissionId) return;
    if (this._playing) track.pendingReplacement = { submissionId, buffer };
    else {
      track.submissionId = submissionId;
      track.buffer = buffer;
      track.pendingReplacement = null;
    }
    this._changed();
  }

  setPattern(id, pattern) {
    this._catchUp();
    const track = this._track(id);
    const next = resizePattern(pattern, this._model.pendingBars ?? this._model.bars);
    if (this._playing) track.pendingPattern = next;
    else track.pattern = next;
    this._changed();
  }

  setActive(id, active) {
    this._catchUp();
    const track = this._track(id);
    if (active) {
      if (this._playing && !track.active) track.waiting = true;
      else track.active = true;
    } else {
      track.active = false;
      track.waiting = false;
      this._silence(id);
    }
    this._changed();
  }

  setPosition(id, value) {
    this._catchUp();
    this._track(id).position = position(value);
    this.onChange?.(this.getState());
  }

  setTrackVolume(id, volume) {
    this._catchUp();
    const track = this._track(id);
    track.volume = clamp(volume, 0, 1);
    this._setGain(this._gains.get(id), track.volume);
    this.onChange?.(this.getState());
  }

  setVolume(volume) {
    this._volume = clamp(volume, 0, 1);
    this._setGain(this._master, this._volume);
    this.onChange?.(this.getState());
  }

  setBpm(bpm) { this._setTiming('_bpm', clamp(bpm, 40, 240)); }
  setSwing(swing) { this._setTiming('_swing', clamp(swing, 0, 0.5)); }

  setBars(bars) {
    this._catchUp();
    const value = Math.round(clamp(bars, 1, 16));
    this._model.pendingBars = value === this._model.bars ? null : value;
    if (!this._playing) commitPending(this._model, true);
    this._changed();
  }

  async play() {
    if (this._playing) return;
    const generation = ++this._generation;
    const context = await this.ready();
    if (context.state === 'suspended') await context.resume();
    if (generation !== this._generation || this._disposed) return;
    commitPending(this._model, true);
    this._playing = true;
    this._loop = 0;
    this._step = 0;
    this._current = null;
    this._startTime = context.currentTime + 0.025;
    this._resetCursor();
    this._pump();
    if (this._autoSchedule) {
      this._timer = setInterval(() => this._pump(), 20);
      if (globalThis.requestAnimationFrame) {
        const draw = () => {
          if (!this._playing) return;
          this._catchUp();
          this.onTick?.(this.getState());
          this._raf = requestAnimationFrame(draw);
        };
        this._raf = requestAnimationFrame(draw);
      }
    }
    this.onChange?.(this.getState());
  }

  stop() {
    this._catchUp();
    ++this._generation;
    this._playing = false;
    clearInterval(this._timer);
    if (this._raf && globalThis.cancelAnimationFrame) cancelAnimationFrame(this._raf);
    for (const id of this._sources.keys()) this._silence(id);
    this._events = [];
    this._cursor = null;
    this._current = null;
    this._loop = 0;
    this._step = 0;
    commitPending(this._model, true);
    this.onChange?.(this.getState());
    this.onTick?.(this.getState());
  }

  dispose() {
    this.stop();
    this._disposed = true;
    for (const gain of this._gains.values()) gain.disconnect();
    this._master?.disconnect();
    this._limiter?.disconnect();
    if (this._ownsContext && this.context?.state !== 'closed') this.context?.close();
  }

  _catchUp() {
    if (this._playing && !this._pumping) this._pump();
    else this._syncNow();
  }

  _track(id) {
    const track = this._model.tracks.get(id);
    if (!track) throw new Error('找不到此学生的声音');
    return track;
  }

  _duration(step) { return (60 / this._bpm / 4) * (step % 2 === 0 ? 1 + this._swing : 1 - this._swing); }

  _gainFor(track) {
    if (!this._gains.has(track.id)) {
      const gain = this.context.createGain();
      gain.gain.value = track.volume;
      gain.connect(this._master);
      this._gains.set(track.id, gain);
    }
    return this._gains.get(track.id);
  }

  _setGain(node, value) {
    if (!node) return;
    const now = this.context.currentTime;
    node.gain.cancelScheduledValues?.(now);
    if (node.gain.setTargetAtTime) node.gain.setTargetAtTime(value, now, 0.01);
    else node.gain.value = value;
  }

  _silence(id) {
    for (const source of this._sources.get(id) || []) {
      try { source.stop(); } catch { /* An ended voice needs no further action. */ }
      source.disconnect();
    }
    this._sources.delete(id);
  }

  _cancelFuture() {
    for (const event of this._events) {
      for (const { id, source } of event.sources) {
        try { source.stop(); } catch { /* Already cancelled by immediate exit. */ }
        source.disconnect();
        this._sources.get(id)?.delete(source);
      }
    }
    this._events = [];
  }

  _resetCursor() {
    this._cursor = {
      model: { bars: this._model.bars, pendingBars: this._model.pendingBars, tracks: new Map([...this._model.tracks].map(([id, track]) => [id, cloneTrack(track)])) },
      step: this._current?.step ?? -1, loop: this._loop,
      time: this._current?.time ?? this._startTime, duration: this._current?.duration ?? 0,
    };
  }

  _changed() {
    if (this._playing) {
      this._cancelFuture();
      this._resetCursor();
      this._pump();
    }
    this.onChange?.(this.getState());
  }

  _setTiming(property, value) {
    this._syncNow();
    const now = this.context?.currentTime || 0;
    const fraction = this._current ? clamp((now - this._current.time) / this._current.duration, 0, 1) : 0;
    this[property] = value;
    if (this._playing && this._current) {
      const duration = this._duration(this._current.step);
      this._current = { ...this._current, duration, time: now - fraction * duration };
    }
    this._changed();
  }

  _scheduleEvent(time, step, loop, model, boundary) {
    const event = { time, step, loop, bars: model.bars, duration: this._duration(step), boundary, sources: [], triggers: [] };
    // After a suspended/throttled tab catches up, skip past notes instead of producing a burst.
    if (time >= this.context.currentTime - 0.005) {
      for (const track of model.tracks.values()) {
        if (!track.active || !track.pattern[step] || !track.buffer) continue;
        const source = this.context.createBufferSource();
        source.buffer = track.buffer;
        source.connect(this._gainFor(track));
        if (!this._sources.has(track.id)) this._sources.set(track.id, new Set());
        this._sources.get(track.id).add(source);
        source.onended = () => { this._sources.get(track.id)?.delete(source); source.disconnect(); };
        source.start(time);
        event.sources.push({ id: track.id, source });
        event.triggers.push(track.id);
      }
    }
    return event;
  }

  _pump() {
    if (!this._playing) return;
    this._pumping = true;
    this._syncNow();
    const horizon = this.context.currentTime + this._lookAhead;
    let cursor = this._cursor;
    while (cursor.time + cursor.duration <= horizon) {
      const time = cursor.time + cursor.duration;
      let step = cursor.step + 1;
      let loop = cursor.loop;
      const boundary = step >= cursor.model.bars * STEPS_PER_BAR;
      if (boundary) {
        step = 0;
        loop += 1;
        commitPending(cursor.model, loop % 2 === 0);
      }
      const event = this._scheduleEvent(time, step, loop, cursor.model, boundary);
      this._events.push(event);
      cursor = { model: cursor.model, step, loop, time, duration: event.duration };
    }
    this._cursor = cursor;
    this._syncNow();
    this._pumping = false;
    if (!globalThis.requestAnimationFrame || !this._autoSchedule) this.onTick?.(this.getState());
  }

  _syncNow() {
    if (!this._playing) return;
    const now = this.context.currentTime;
    while (this._events.length && this._events[0].time <= now + 1e-9) {
      const event = this._events.shift();
      this._current = event;
      this._step = event.step;
      this._loop = event.loop;
      if (event.boundary) {
        commitPending(this._model, event.loop % 2 === 0);
        this.onBoundary?.(this.getState());
        this.onChange?.(this.getState());
      }
      // Ignore visuals for missed notes during a long browser scheduling stall.
      if (now - event.time < 0.12) for (const id of event.triggers) this.onTrigger?.({ id, time: event.time });
    }
  }
}
