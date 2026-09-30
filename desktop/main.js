import { app, BrowserWindow, ipcMain, Menu, dialog } from 'electron';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { X509Certificate } from 'node:crypto';
import { classroomAddress, teacherNavigation, teacherResource, classroomCertificate } from './policy.js';

const root = dirname(fileURLToPath(import.meta.url));
const setupURL = pathToFileURL(join(root, 'setup.html')).href;
const config = JSON.parse(readFileSync(join(root, 'classroom.json'), 'utf8'));
const ca = readFileSync(join(root, 'classroom-ca.crt'), 'utf8');
if (process.env.FREE_IMPRO_DESKTOP_PROFILE) app.setPath('userData', process.env.FREE_IMPRO_DESKTOP_PROFILE);
let window, address = classroomAddress(config.address), error = '';
const prefsFile = () => join(app.getPath('userData'), 'connection.json');
try { address = classroomAddress(JSON.parse(readFileSync(prefsFile(), 'utf8')).address); } catch {}
function setupSender(event) { if (event.sender !== window?.webContents || event.senderFrame?.url !== setupURL || event.senderFrame !== window.webContents.mainFrame) throw new Error('设置仅可由连接页面更改。'); }
async function showSetup(message = '') { error = message; await window.loadFile(join(root, 'setup.html')); }
async function connect(value) {
  address = classroomAddress(value);
  mkdirSync(app.getPath('userData'), { recursive: true });
  writeFileSync(prefsFile(), JSON.stringify({ address }), { mode: 0o600 });
  try { await window.loadURL(new URL('teacher.html', address).href); return {}; }
  catch { const message = '无法连接。请检查服务是否运行、Wi-Fi 地址，以及安装包与课堂证书是否匹配。'; await showSetup(message); return { error: message }; }
}
app.whenReady().then(async () => {
window = new BrowserWindow({ width: 1440, height: 1000, minWidth: 800, minHeight: 600, title: 'Free Impro · 教师工作台', webPreferences: { preload: join(root, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } });
window.webContents.setUserAgent(window.webContents.getUserAgent() + ' FreeImproTeacher/1');
window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
window.webContents.on('will-navigate', (event, url) => { if (url !== setupURL && !teacherNavigation(url, address)) event.preventDefault(); });
window.webContents.on('will-redirect', (event, url) => { if (!teacherNavigation(url, address)) event.preventDefault(); });
window.webContents.on('will-attach-webview', event => event.preventDefault());
window.webContents.session.setPermissionRequestHandler((contents, permission, callback) => callback(permission === 'fullscreen' && teacherNavigation(contents.getURL(), address)));
window.webContents.session.setCertificateVerifyProc((request, callback) => callback(classroomCertificate(request.certificate.data, ca, request.hostname, address) ? 0 : -2));
window.webContents.session.webRequest.onBeforeRequest((details, callback) => {
  const localFiles = ['setup.html', 'setup.js', 'setup.css'].map(file => pathToFileURL(join(root, file)).href);
  callback({ cancel: !localFiles.includes(details.url) && !teacherResource(details.url, address) });
});
ipcMain.handle('teacher:connection', event => { setupSender(event); return { address, error, fingerprint: new X509Certificate(ca).fingerprint256 }; });
ipcMain.handle('teacher:connect', async (event, value) => { setupSender(event); try { return await connect(value); } catch (failure) { return { error: failure.message }; } });
Menu.setApplicationMenu(Menu.buildFromTemplate([
  ...(process.platform === 'darwin' ? [{ label: 'Free Impro Teacher', submenu: [{ role: 'about' }, { role: 'quit' }] }] : []),
  { label: '课堂', submenu: [{ label: '连接设置', click: async () => {
    if (teacherNavigation(window.webContents.getURL(), address)) {
      const result = await dialog.showMessageBox(window, { type: 'question', message: '返回连接设置会停止当前演奏。', buttons: ['继续课堂', '返回设置'], defaultId: 0, cancelId: 0 });
      if (result.response !== 1) return;
    }
    await showSetup();
  } }, { role: 'reload', label: '重新连接' }, { role: 'quit', label: '退出教师端' }] },
  { label: '编辑', submenu: [{ role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
  { label: '显示', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
]));
await showSetup();
app.on('window-all-closed', () => app.quit());

}).catch(error => { console.error(error); app.quit(); });
