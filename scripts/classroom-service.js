import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { get } from 'node:https';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const label = 'org.freeimpro.classroom';
const target = `gui/${process.getuid?.()}/${label}`;
const action = process.argv[2] || 'status';
process.chdir(root);
if (action !== 'run' && existsSync('.env')) process.loadEnvFile('.env');
if (action === 'run') {
  await import('../server/classroom.js');
} else {
  if (process.platform !== 'darwin') throw new Error('后台服务命令用于 macOS；其他系统使用 npm run classroom。');
  const launch = (...args) => spawnSync('/bin/launchctl', args, { encoding: 'utf8' });
  const probe = () => new Promise(done => {
    const request = get(`https://localhost:${process.env.HTTPS_PORT || 8443}/api/student/image-status`, { ca: readFileSync(resolve(process.env.HTTPS_CERT_DIR || 'data/https', 'classroom-ca.crt')), timeout: 2000 }, response => { response.resume(); done(response.statusCode === 200); });
    request.on('error', () => done(false)); request.on('timeout', () => request.destroy());
  });
  if (action === 'stop') {
    const result = launch('bootout', target);
    if (result.status && launch('print', target).status === 0) throw new Error(result.stderr.trim());
    console.log('课堂后台服务已停止。');
  } else if (action === 'start') {
    if (launch('print', target).status !== 0) {
      if (await probe()) throw new Error('课堂已由另一个进程运行；请先关闭原课堂服务再启用后台服务。');
      mkdirSync('data', { recursive: true });
      const xml = text => String(text).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
      const plist = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array><string>${xml(process.execPath)}</string><string>${xml(fileURLToPath(import.meta.url))}</string><string>run</string></array><key>WorkingDirectory</key><string>${xml(root)}</string><key>RunAtLoad</key><true/><key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict><key>ThrottleInterval</key><integer>10</integer><key>StandardOutPath</key><string>${xml(resolve('data/classroom-service.log'))}</string><key>StandardErrorPath</key><string>${xml(resolve('data/classroom-service.log'))}</string></dict></plist>`;
      writeFileSync('data/classroom-service.plist', plist);
      const result = launch('bootstrap', `gui/${process.getuid()}`, resolve('data/classroom-service.plist'));
      if (result.status !== 0) throw new Error(`后台课堂启动失败：${result.stderr.trim()}`);
    }
    let ready = false;
    for (let attempt = 0; attempt < 20 && !ready; attempt++) { ready = await probe(); if (!ready) await new Promise(r => setTimeout(r, 250)); }
    if (!ready) throw new Error('课堂未能就绪，请检查 data/classroom-service.log。');
    console.log('课堂后台服务已就绪，关闭终端后仍可连接；电脑注销或重启后需再次启动。');
  } else if (action === 'status') {
    console.log(await probe() ? '课堂 HTTPS 服务可连接，证书校验通过。' : '课堂服务未连接；请先启动课堂后台服务。');
  } else throw new Error('支持 start、status、stop。');
}
