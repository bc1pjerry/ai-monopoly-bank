function createDatabase(filePath) {
  let DatabaseSync;

  try {
    ({ DatabaseSync } = require('node:sqlite'));
  } catch (error) {
    const message = [
      'This server now uses Node.js built-in SQLite to avoid native npm builds on Windows.',
      'Please install Node.js 22.13 or newer, preferably the latest LTS release.',
      `Original error: ${error.message}`
    ].join('\n');
    throw new Error(message);
  }

  const db = new DatabaseSync(filePath);
  let savepointId = 0;

  db.pragma = (statement) => {
    db.exec(`PRAGMA ${statement}`);
  };

  db.transaction = (fn) => {
    return (...args) => {
      if (db.isTransaction) {
        const savepoint = `sp_${Date.now()}_${savepointId++}`;
        db.exec(`SAVEPOINT ${savepoint}`);
        try {
          const result = fn(...args);
          db.exec(`RELEASE SAVEPOINT ${savepoint}`);
          return result;
        } catch (error) {
          db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          db.exec(`RELEASE SAVEPOINT ${savepoint}`);
          throw error;
        }
      }

      db.exec('BEGIN');
      try {
        const result = fn(...args);
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    };
  };

  return db;
}

module.exports = createDatabase;
