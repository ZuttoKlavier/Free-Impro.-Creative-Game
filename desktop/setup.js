const address = document.querySelector('#address'), status = document.querySelector('#status');
window.teacherConnection.read().then(config => { address.value = config.address; document.querySelector('#fingerprint').textContent = '此安装包的课堂 CA 指纹：' + config.fingerprint; status.textContent = config.error || ''; });
document.querySelector('#connection').onsubmit = async event => {
  event.preventDefault(); const button = event.target.querySelector('button'); button.disabled = true; status.textContent = '正在连接…';
  try { const result = await window.teacherConnection.connect(address.value.trim()); if (result.error) status.textContent = result.error; }
  catch { status.textContent = '连接没有完成，请检查课堂服务地址。'; }
  finally { button.disabled = false; }
};
