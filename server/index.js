import { createApp } from './app.js';
const port = Number(process.env.API_PORT || 3001);
const { server, db } = createApp({ dbPath: process.env.FREE_IMPRO_DB || 'data/classroom.sqlite', secureCookies: process.env.COOKIE_SECURE === 'true' });
server.listen(port, '127.0.0.1', () => console.log(`Classroom API ready at http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
