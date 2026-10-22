(() => {
  const call = (action, args = {}) => window.webkit.messageHandlers.localFiles.postMessage({ action, ...args });
  window.FreeImproAudio = {
    prepare: type => call('audio-session', { type }),
    startRecording: id => call('audio-record-start', { id }),
    recordingLevel: id => call('audio-record-level', { id }),
    stopRecording: id => call('audio-record-stop', { id }),
    cancelRecording: id => call('audio-record-cancel', { id }),
    play: (id, encoded, mime) => call('audio-play', { id, encoded, mime }),
    stopPlayback: id => call('audio-play-stop', { id }),
    playRhythm: (id, encoded, bars, bpm, revision) => call('audio-rhythm-play', { id, encoded, bars, bpm, revision }),
    queueRhythm: (id, encoded, bars, bpm, revision) => call('audio-rhythm-queue', { id, encoded, bars, bpm, revision }),
    rhythmState: id => call('audio-rhythm-state', { id }),
    diagnostics: () => call('audio-diagnostics'),
  };
  window.FreeImproClassroom = {
    offline: true, connected: false, generation: 0,
    async request(path, options = {}) {
      const method = options.method || 'GET';
      const entry = path === '/api/student/enter-classroom' && method === 'POST';
      const accountEntry = method === 'POST' && ['/api/student/account/register', '/api/student/account/login', '/api/student/account/phone/verify'].includes(path);
      const accountSetup = (method === 'GET' && path === '/api/student/account/options') || (method === 'POST' && path === '/api/student/account/phone/send');
      if (!entry && !accountEntry && !accountSetup && !this.connected) throw new Error('请先在“我的”登录账号或填写姓名和课堂码。');
      const signal = options.signal; signal?.throwIfAborted();
      const id = crypto.randomUUID(), ticket = this.generation;
      let abort;
      const cancelled = new Promise((_, reject) => {
        abort = () => { call('cancel-request', { id }).catch(() => {}); reject(signal.reason || new DOMException('已取消', 'AbortError')); };
        signal?.addEventListener('abort', abort, { once: true });
      });
      try {
        const result = await Promise.race([call('classroom-request', { id, path, method, body: options.body }), cancelled]);
        if (ticket !== this.generation) throw new DOMException('课堂连接已关闭', 'AbortError');
        const bytes = Uint8Array.from(atob(result.encoded), c => c.charCodeAt(0));
        const response = new Response(bytes, { status: result.status, headers: { 'Content-Type': result.type } });
        if ((entry || accountEntry) && response.ok) { this.connected = true; window.dispatchEvent(new Event('freeimpro-classroom-connected')); }
        return response;
      } finally { signal?.removeEventListener('abort', abort); }
    },
    async disconnect() { this.connected = false; this.generation++; window.dispatchEvent(new Event('freeimpro-classroom-disconnected')); await call('disconnect'); },
  };
  let socialPending = false, socialGeneration = 0;
  window.addEventListener('freeimpro-background', () => { socialGeneration++; });
  window.addEventListener('freeimpro-classroom-disconnected', () => { socialGeneration++; });
  window.FreeImproAuth = {
    async signInSocial(provider, mode = 'login') {
      if (!['wechat', 'apple'].includes(provider) || !['login', 'link'].includes(mode)) throw new Error('不支持的登录方式。');
      if (socialPending) throw new Error('登录正在进行，请稍候。');
      socialPending = true;
      const ticket = socialGeneration, connection = window.FreeImproClassroom.generation;
      try {
        const result = await call('student-social-login', { provider, mode });
        if (ticket !== socialGeneration || connection !== window.FreeImproClassroom.generation) throw new DOMException('登录已取消', 'AbortError');
        if (!result?.user || typeof result.user.id !== 'string' || !result.user.id) throw new Error('登录未完成，请重新登录。');
        window.FreeImproClassroom.connected = true;
        window.dispatchEvent(new Event('freeimpro-classroom-connected'));
        return { user: result.user };
      } finally { socialPending = false; }
    },
  };
  window.FreeImproFiles = {
    begin: (name, mime) => call('begin', { name, mime }),
    append: (id, encoded) => call('append', { id, encoded }),
    finish: id => call('finish', { id }),
    cancel: id => call('cancel', { id }),
  };
  let importing = false;
  document.addEventListener('click', async event => {
    const input = event.target.closest('input[type="file"]'); if (!input) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (importing) return;
    importing = true;
    let selected;
    try {
      const kind = ({ 'backup-file': 'backup', 'audio-file': 'audio', 'photo-file': 'photo' })[input.id];
      if (!kind) { alert('请使用应用内拍照或作品导入入口。'); return; }
      const photoTarget = kind === 'photo' ? document.getElementById('character-sound')?.value : null;
      const targetMatches = () => kind !== 'photo' || document.getElementById('character-sound')?.value === photoTarget;
      selected = await call('choose', { kind }); if (!selected) return;
      if (!targetMatches()) return;
      const limits = { backup: 250 * 1024 * 1024, audio: 25 * 1024 * 1024, photo: 10 * 1024 * 1024 };
      if (!selected.id || !selected.name || !selected.mime || !Number.isInteger(selected.size) || selected.size <= 0 || selected.size > limits[kind]) throw new Error('文件类型或大小无效。');
      const chunks = []; let offset = 0;
      while (true) {
        if (!targetMatches()) return;
        const encoded = await call('read', { id: selected.id, offset }); if (!encoded) break;
        if (!targetMatches()) return;
        const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0)); chunks.push(bytes); offset += bytes.length;
        if (offset > selected.size || offset > limits[kind]) throw new Error('文件过大或已发生变化。');
      }
      if (offset !== selected.size) throw new Error('文件未完整读取，请重新选择。');
      if (!targetMatches()) return;
      const data = new DataTransfer(); data.items.add(new File(chunks, selected.name, { type: selected.mime }));
      input.files = data.files; input.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (error) { alert(error.message || '本地文件操作失败。'); }
    finally {
      if (selected?.id) await call('release', { id: selected.id }).catch(() => {});
      importing = false;
    }
  }, true);
})();
