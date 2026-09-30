import './style.css';
import { initClassroom } from './classroom.js';
import { initOffline } from './offline.js';

document.querySelector('#app').innerHTML = `
<header><div class="brand"><span class="brand-icon">♫</span><span>Free Impro<small>教师工作台</small></span></div><div class="header-right"><span class="local-dot"></span>教师端<button id="account-shortcut" class="student-tag">教师登录</button></div></header>
<main><section class="intro"><div><div class="eyebrow">TEACHER STUDIO / 教师工作台</div><h1>让每个声音，<br>成为课堂的一部分。</h1><p>创建课堂 · 接收作品 · 编排节奏 · 指挥合奏</p></div></section>
<nav class="tabs" aria-label="教师功能"><button id="classroom-tab" class="tab active" aria-selected="true">课堂管理与演奏</button></nav>
<section id="classroom-view"></section><footer><span>Free Impro · 独立教师端</span><span>作品由学生端提交至课堂</span></footer></main>
<div id="toast" role="status" aria-live="polite" hidden></div>`;
let timeout;
function notify(message, error = false) {
  const toast = document.querySelector('#toast'); toast.textContent = message; toast.hidden = false; toast.classList.toggle('error', error);
  clearTimeout(timeout); timeout = setTimeout(() => { toast.hidden = true; }, error ? 9000 : 4000);
}
const classroom = initClassroom({ notify, show() {}, stopPlayback() { document.querySelectorAll('audio').forEach(audio => audio.pause()); } });
document.querySelector('#classroom-tab').onclick = () => classroom.refresh();
document.querySelector('#account-shortcut').onclick = () => document.querySelector('#classroom-view').scrollIntoView({ behavior: 'smooth' });
initOffline();
