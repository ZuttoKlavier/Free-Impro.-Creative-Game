import { spawn } from 'node:child_process';
const children = [spawn(process.execPath, ['server/index.js'], { stdio: 'inherit' }), spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '0.0.0.0'], { stdio: 'inherit' })];
let closing = false;
function stop(code = 0) { if (closing) return; closing = true; children.forEach(p => p.kill('SIGTERM')); process.exitCode = code; }
children.forEach(p => { p.on('error', () => stop(1)); p.on('exit', code => stop(code || 0)); });
process.on('SIGINT', () => stop()); process.on('SIGTERM', () => stop());
