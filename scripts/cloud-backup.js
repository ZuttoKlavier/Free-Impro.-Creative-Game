import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, chmodSync, renameSync, rmSync, lstatSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

export async function backupClassroom({ dbPath, directory }) {
  const source = resolve(dbPath), target = resolve(directory);
  if (!lstatSync(source).isFile() || lstatSync(source).isSymbolicLink()) throw new Error('课堂数据库必须是实际文件。');
  mkdirSync(target, { recursive: true, mode: 0o700 });
  if (!lstatSync(target).isDirectory() || lstatSync(target).isSymbolicLink()) throw new Error('备份目录必须是实际目录。');
  const name = `classroom-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.sqlite`;
  const path = join(target, name), temporary = path + '.partial';
  const db = new DatabaseSync(source, { readOnly: true });
  try {
    // SQLite's backup API includes committed WAL contents while the service is
    // running. Copying just the main database file can silently lose records.
    await backup(db, temporary);
    if (process.platform !== 'win32') chmodSync(temporary, 0o600);
    const verification = new DatabaseSync(temporary);
    try {
      // Make the exported snapshot a standalone file; its source remains in
      // WAL mode and keeps serving requests throughout the backup.
      verification.exec('PRAGMA journal_mode=DELETE');
      if (verification.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('备份完整性校验失败。');
    }
    finally { verification.close(); }
    renameSync(temporary, path);
    return path;
  } catch (error) { rmSync(temporary, { force: true }); throw error; }
  finally { db.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const path = await backupClassroom({ dbPath: process.env.FREE_IMPRO_DB || 'data/classroom.sqlite', directory: process.env.BACKUP_DIRECTORY || 'data/cloud-backups' });
    console.log(`课堂数据库备份已校验：${path}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
