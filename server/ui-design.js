import { emptyDesign, validateDesign } from './ui-design-schema.js';

const fail = (status, message) => Object.assign(new Error(message), { status });

// A single published document is shared by all clients. Drafts stay in the
// administrator's editor until this revision-checked publication succeeds.
export function createUIDesignStore(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS ui_design(
    id INTEGER PRIMARY KEY CHECK(id=1),
    revision INTEGER NOT NULL CHECK(revision>=0),
    design TEXT NOT NULL,
    updated_at INTEGER
  );`);
  db.prepare('INSERT OR IGNORE INTO ui_design(id,revision,design,updated_at) VALUES(1,0,?,NULL)').run(JSON.stringify(emptyDesign()));

  function read() {
    const row = db.prepare('SELECT revision,design,updated_at FROM ui_design WHERE id=1').get();
    return { revision: row.revision, design: validateDesign(JSON.parse(row.design)), updatedAt: row.updated_at };
  }

  function publish(data, onPublish) {
    if (!data || typeof data !== 'object' || Array.isArray(data) ||
        Object.keys(data).length !== 2 || !Object.hasOwn(data, 'revision') || !Object.hasOwn(data, 'design') ||
        !Number.isSafeInteger(data.revision) || data.revision < 0 || data.revision >= Number.MAX_SAFE_INTEGER) {
      throw fail(400, '页面版本无效，请刷新编辑器后重试。');
    }
    const design = validateDesign(data.design);
    db.exec('BEGIN IMMEDIATE');
    try {
      const current = db.prepare('SELECT revision FROM ui_design WHERE id=1').get();
      if (current.revision !== data.revision) throw fail(409, '页面已由其他管理员更新，请重新载入最新设置后再发布。');
      const revision = current.revision + 1, updatedAt = Date.now();
      db.prepare('UPDATE ui_design SET revision=?,design=?,updated_at=? WHERE id=1').run(revision, JSON.stringify(design), updatedAt);
      // The audit entry and the published document must commit together.
      onPublish?.(revision);
      db.exec('COMMIT');
      return { revision, design, updatedAt };
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  return { read, publish };
}
