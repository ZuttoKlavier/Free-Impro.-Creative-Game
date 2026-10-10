import { defineConfig } from 'vite';
import { offlineBuild } from './scripts/offline-build.js';
const endpoint = { target: `http://127.0.0.1:${process.env.API_PORT || 3001}`, changeOrigin: false, proxyTimeout: 300000 };
const proxy = { '/api': endpoint, '/mcp/images': endpoint };
export default defineConfig({ plugins: [offlineBuild()], build: { rollupOptions: { input: { student: 'index.html', teacher: 'teacher.html' } } }, server: { proxy }, preview: { proxy } });
