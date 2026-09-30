import QRCode from 'qrcode';
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function connectionPage({ classroomUrl, setupUrl, fingerprint, secure }) {
  const qr = await QRCode.toDataURL(secure ? classroomUrl : setupUrl, { width: 220, margin: 2 });
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>连接声音课堂</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f5f5ed;color:#294230;font:16px/1.7 system-ui,sans-serif}main{max-width:760px;margin:32px auto;padding:28px;background:white;border-radius:20px}h1{font-size:28px;margin:0 0 8px}h2{font-size:19px}p{margin:10px 0}a{color:#1b6643;overflow-wrap:anywhere}li{margin:12px 0}.intro{color:#68745e}.qr{float:right;width:180px;max-width:42%;margin:0 0 16px 20px}.button,button{display:inline-block;background:#2c6242;color:white;border:0;border-radius:10px;padding:12px 20px;font:inherit;cursor:pointer;text-decoration:none}.card{background:#f3f6ef;border-radius:12px;padding:16px;margin:20px 0;clear:both}code{overflow-wrap:anywhere;font-size:12px}#checks{padding-left:22px}footer{font-size:13px;color:#68745e}@media(max-width:600px){main{margin:0;padding:22px;border-radius:0}.qr{float:none;display:block;max-width:100%;margin:16px auto}}</style></head><body><main>
  <h1>连接声音课堂</h1><p class="intro">教师电脑和平板连接同一个 Wi-Fi。没有互联网时，已配置好的课堂仍可使用。</p>
  <img class="qr" src="${qr}" alt="${secure ? '课堂 HTTPS 地址' : '首次连接指引'}二维码"><h2>${secure ? '课堂地址' : '首次连接'}</h2>
  <p><a href="${escape(classroomUrl)}">${escape(classroomUrl)}</a></p>
  <ol><li>第一次使用：<a href="/connection/ca.crt" download="classroom-ca.crt">下载课堂 CA 证书</a>，在设备设置中安装并信任。</li><li>安卓通常在「设置 → 安全与隐私 → 更多安全设置 → 加密与凭据 → 安装证书 → CA 证书」。菜单随品牌和版本不同，学校管理的平板可能需要管理员安装。</li><li>用 Chrome 重新打开上面的 HTTPS 课堂地址。地址栏应无证书错误；允许麦克风和相机权限后即可创作。</li></ol>
  <a class="button" href="${escape(classroomUrl)}teacher.html">进入教师工作台</a> <a class="button" href="${escape(classroomUrl)}">进入学生端</a> <a href="${escape(classroomUrl)}connection">检查设备连接</a>
  <div class="card"><h2>核对课堂证书</h2><p>安装 CA 会让设备信任这台教师电脑签发的证书。请与教师电脑终端显示的 SHA-256 指纹核对；只安装 <b>classroom-ca.crt</b>，不要传输任何 .key 私钥文件。</p><code>${escape(fingerprint)}</code></div>
  ${secure ? '<div class="card"><h2>设备检查</h2><ul id="checks"><li>正在检查…</li></ul><button id="test-mic">测试麦克风权限</button><p id="mic-result" role="status"></p></div>' : '<p>当前是证书下载指引页。账号登录、录音和课堂数据传输均在上面的 HTTPS 页面进行。</p>'}
  <footer>教师从独立教师工作台创建课堂，学生使用学生端或学生 APK 输入课堂码。若仍无法打开，请检查电脑防火墙、访客 Wi-Fi 的设备隔离，以及电脑 IP 是否变化。<p>macOS：在「钥匙串访问」导入 CA，并将其 SSL 信任设为始终信任。Windows：在当前用户「受信任的根证书颁发机构」中导入 CA。</p></footer>
  ${secure ? `<script>
  (async()=>{const lines=[window.isSecureContext?'安全连接：正常':'安全连接：不可用',navigator.mediaDevices?.getUserMedia?'录音接口：可用':'录音接口：不可用','serviceWorker' in navigator?'离线缓存接口：可用（进入课堂后完成准备）':'离线缓存接口：不可用'];try{const r=await fetch('/api/health',{cache:'no-store'});const v=await r.json();lines.push(r.ok&&v.ok?'课堂服务：已连接':'课堂服务：异常')}catch{lines.push('课堂服务：无法连接')}const list=document.getElementById('checks');list.replaceChildren(...lines.map(text=>{const li=document.createElement('li');li.textContent=text;return li}));})();
  document.getElementById('test-mic').onclick=async()=>{const result=document.getElementById('mic-result');try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});stream.getTracks().forEach(track=>track.stop());result.textContent='麦克风权限已允许。接下来进入课堂试录一段声音。'}catch{result.textContent='未能访问麦克风，请检查 Chrome 权限与设备设置。'}};
  </script>` : ''}</main></body></html>`;
}
