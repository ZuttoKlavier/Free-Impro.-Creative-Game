// WebKit switches the hardware session when microphone capture starts. Explicit
// types and the native bridge keep recorded sound on the media playback route.
export async function prepareAudioSession(type) {
  if (!['playback', 'play-and-record'].includes(type)) throw new Error('音频模式无效。');
  const session = globalThis.navigator?.audioSession;
  if (session) session.type = type;
  await globalThis.window?.FreeImproAudio?.prepare(type);
}

export async function resumeAudioContext(context) {
  if (context.state === 'closed') throw new Error('声音播放已关闭，请重新打开声音。');
  // iOS also reports "interrupted" after changing routes or leaving foreground.
  if (context.state !== 'running') {
    let timer;
    try {
      await Promise.race([
        context.resume(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('声音被系统中断，请回到应用后再次点击试听。')), 2500); }),
      ]);
    } finally { clearTimeout(timer); }
  }
  if (context.state !== 'running') throw new Error('声音被系统中断，请回到应用后再次点击试听。');
  return context;
}
