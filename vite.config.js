import { defineConfig } from 'vite';
const proxy = { '/api': { target: 'http://127.0.0.1:3001', changeOrigin: false } };
export default defineConfig({ server: { proxy }, preview: { proxy } });
