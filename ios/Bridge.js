(() => {
  const call = (action, args = {}) => window.webkit.messageHandlers.localFiles.postMessage({ action, ...args });
  window.FreeImproClassroom = {
    offline: true, connected: false, generation: 0,
    async request(path, options = {}) {
      const method = options.method || 'GET';
      const entry = path === '/api/student/enter-classroom' && method === 'POST';
      if (!entry && !this.connected) throw new Error('请先在“我的”填写姓名和课堂码。');
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
        if (entry && response.ok) { this.connected = true; window.dispatchEvent(new Event('freeimpro-classroom-connected')); }
        return response;
      } finally { signal?.removeEventListener('abort', abort); }
    },
    async disconnect() { this.connected = false; this.generation++; window.dispatchEvent(new Event('freeimpro-classroom-disconnected')); await call('disconnect'); },
  };
  window.FreeImproFiles = {
    begin: (name, mime) => call('begin', { name, mime }),
    append: (id, encoded) => call('append', { id, encoded }),
    finish: id => call('finish', { id }),
    cancel: id => call('cancel', { id }),
  };
  document.addEventListener('click', async event => {
    const input = event.target.closest('input[type="file"]'); if (!input) return;
    event.preventDefault(); event.stopImmediatePropagation();
    try {
      if (!['backup-file', 'audio-file'].includes(input.id)) { alert('请使用应用内拍照。'); return; }
      const name = await call('choose', { backup: input.id === 'backup-file' }); if (!name) return;
      const chunks = []; let offset = 0;
      while (true) {
        const encoded = await call('read', { name, offset }); if (!encoded) break;
        const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0)); chunks.push(bytes); offset += bytes.length;
        if (offset > 250 * 1024 * 1024) throw new Error('文件过大。');
      }
      const data = new DataTransfer(); data.items.add(new File(chunks, name, { type: input.id === 'backup-file' ? 'application/json' : 'audio/wav' }));
      input.files = data.files; input.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (error) { alert(error.message || '本地文件操作失败。'); }
  }, true);
})();
