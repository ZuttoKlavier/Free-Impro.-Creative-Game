import { existsSync } from 'node:fs';
import { startLanServer } from './lan.js';
import { lanAddresses } from '../scripts/https-certificates.js';
if (existsSync('.env')) process.loadEnvFile('.env');
const port = (value, fallback) => { const n = value === undefined ? fallback : Number(value); if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error('课堂端口需在 1–65535 之间。'); return n; };
try {
  const app = await startLanServer({ certDirectory: process.env.HTTPS_CERT_DIR || 'data/https', dbPath: process.env.FREE_IMPRO_DB || 'data/classroom.sqlite', port: port(process.env.HTTPS_PORT, 8443), setupPort: port(process.env.HTTPS_SETUP_PORT, 8080) });
  console.log(`教师工作台：${app.classroomUrl}teacher.html\n学生端：${app.classroomUrl}\n平板首次连接：${app.setupUrl}\n连接检查：${app.classroomUrl}connection\nCA SHA-256：${app.caFingerprint}`);
  const current = lanAddresses();
  if (!current.some(address => app.hosts.includes(address))) console.log('提示：当前局域网地址不在证书中。请停止课堂，连接 Wi-Fi 后重新运行 npm run setup:https。');
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); process.exit(0); });
} catch (error) { console.error(error.code === 'EADDRINUSE' ? '课堂端口已占用。请关闭此前的课堂服务，或配置 HTTPS_PORT / HTTPS_SETUP_PORT。' : error.message); process.exitCode = 1; }
