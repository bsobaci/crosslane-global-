const fs = require('fs');
const path = require('path');
const config = require('../config');

const DB_PATH = path.resolve(config.dbPath);

// sql.js is pure WASM — no native compilation needed
let SQL;

async function initSqlJs() {
  if (!SQL) {
    const sqlModule = await require('sql.js')();
    SQL = sqlModule;
  }
  return SQL;
}

let _db = null;

// Wrapper around sql.js that provides a better-sqlite3–compatible API
function wrapDb(sqlDb, saveFn) {
  return {
    // Execute raw SQL statements (for schema setup)
    exec(sql) {
      sqlDb.run(sql);
      if (saveFn) saveFn();
    },

    // Prepared statement factory — returns { get, all, run }
    prepare(sql) {
      return {
        get(...params) {
          try {
            const stmt = sqlDb.prepare(sql);
            if (params.length > 0) stmt.bind(params);
            if (stmt.step()) {
              const cols = stmt.getColumnNames();
              const vals = stmt.get();
              stmt.free();
              const obj = {};
              cols.forEach((c, i) => { obj[c] = vals[i]; });
              return obj;
            }
            stmt.free();
            return undefined;
          } catch (e) {
            // If no rows, return undefined
            return undefined;
          }
        },

        all(...params) {
          const rows = [];
          try {
            const stmt = sqlDb.prepare(sql);
            if (params.length > 0) stmt.bind(params);
            while (stmt.step()) {
              const cols = stmt.getColumnNames();
              const vals = stmt.get();
              const obj = {};
              cols.forEach((c, i) => { obj[c] = vals[i]; });
              rows.push(obj);
            }
            stmt.free();
          } catch (e) {
            // Return empty on error
          }
          return rows;
        },

        run(...params) {
          try {
            const stmt = sqlDb.prepare(sql);
            if (params.length > 0) stmt.bind(params);
            stmt.step();
            stmt.free();
            if (saveFn) saveFn();
            return { changes: sqlDb.getRowsModified() };
          } catch (e) {
            throw e;
          }
        },
      };
    },

    // Transaction helper
    transaction(fn) {
      return (...args) => {
        try {
          sqlDb.run('BEGIN TRANSACTION');
          const result = fn(...args);
          sqlDb.run('COMMIT');
          if (saveFn) saveFn();
          return result;
        } catch (e) {
          sqlDb.run('ROLLBACK');
          throw e;
        }
      };
    },

    // Direct access for pragmas
    pragma(pragmaSql) {
      sqlDb.run(`PRAGMA ${pragmaSql}`);
    },

    // Export for persistence
    export() {
      return sqlDb.export();
    },

    close() {
      if (saveFn) saveFn();
      sqlDb.close();
    },
  };
}

let saveToDisk = null;

async function getDb() {
  if (_db) return _db;

  const SQLModule = await initSqlJs();

  // Load existing DB from disk, or create new
  let sqlDb;
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    sqlDb = new SQLModule.Database(buffer);
  } else {
    sqlDb = new SQLModule.Database();
  }

  // Persistence helper — save in-memory db to disk
  saveToDisk = () => {
    try {
      const dir = path.dirname(DB_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const data = sqlDb.export();
      fs.writeFileSync(DB_PATH, Buffer.from(data));
    } catch (e) {
      console.error('[db] Failed to persist database:', e.message);
    }
  };

  _db = wrapDb(sqlDb, saveToDisk);

  // Run schema
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    _db.exec(schema);
  }

  // Save to disk every 30 seconds
  setInterval(() => { if (saveToDisk) saveToDisk(); }, 30_000);

  // Save on process exit
  process.on('exit', () => { if (saveToDisk) saveToDisk(); });
  process.on('SIGINT', () => { if (saveToDisk) { saveToDisk(); process.exit(); } });
  process.on('SIGTERM', () => { if (saveToDisk) { saveToDisk(); process.exit(); } });

  return _db;
}

// Synchronous proxy — returns a promise-based wrapper used at module load
let dbPromise = null;
function getDbSync() {
  if (!dbPromise) dbPromise = getDb();
  return dbPromise;
}

module.exports = { getDb: getDbSync };
