/**
 * 一次性迁移脚本：将 data/rooms.json 数据导入 data/monopoly.db
 * 运行方式：node migrate.js
 */

const fs = require('fs');
const path = require('path');
const createDatabase = require('./db');

const DATA_DIR = path.join(__dirname, '..', 'data');
const JSON_FILE = path.join(DATA_DIR, 'rooms.json');
const DB_FILE = path.join(DATA_DIR, 'monopoly.db');

if (!fs.existsSync(JSON_FILE)) {
  console.log('rooms.json 不存在，无需迁移');
  process.exit(0);
}

const rooms = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
const roomIds = Object.keys(rooms);

if (roomIds.length === 0) {
  console.log('rooms.json 为空，无需迁移');
  process.exit(0);
}

const db = createDatabase(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 建表（与 server.js 保持一致）
db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    id          TEXT PRIMARY KEY,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    banker_token TEXT NOT NULL,
    config      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS players (
    id       TEXT PRIMARY KEY,
    room_id  TEXT NOT NULL REFERENCES rooms(id),
    name     TEXT NOT NULL,
    balance  INTEGER NOT NULL,
    token    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS logs (
    id       TEXT PRIMARY KEY,
    room_id  TEXT NOT NULL REFERENCES rooms(id),
    ts       INTEGER NOT NULL,
    type     TEXT NOT NULL,
    text     TEXT NOT NULL,
    note     TEXT NOT NULL DEFAULT ''
  );

  CREATE INDEX IF NOT EXISTS idx_players_room ON players(room_id);
  CREATE INDEX IF NOT EXISTS idx_logs_room_ts ON logs(room_id, ts DESC);
`);

const insertRoom = db.prepare(
  'INSERT OR IGNORE INTO rooms (id, created_at, updated_at, banker_token, config) VALUES (?, ?, ?, ?, ?)'
);
const insertPlayer = db.prepare(
  'INSERT OR IGNORE INTO players (id, room_id, name, balance, token) VALUES (?, ?, ?, ?, ?)'
);
const insertLog = db.prepare(
  'INSERT OR IGNORE INTO logs (id, room_id, ts, type, text, note) VALUES (?, ?, ?, ?, ?, ?)'
);

const migrateAll = db.transaction(() => {
  let roomCount = 0, playerCount = 0, logCount = 0;

  for (const roomId of roomIds) {
    const room = rooms[roomId];

    // 部分旧记录缺少 bankerToken
    const bankerToken = room.bankerToken || 'legacy_' + Math.random().toString(36).slice(2);
    const config = JSON.stringify(room.config || {});

    const r = insertRoom.run(roomId, room.createdAt, room.updatedAt, bankerToken, config);
    if (r.changes > 0) roomCount++;

    for (const p of (room.players || [])) {
      const token = p.token || 'legacy_' + Math.random().toString(36).slice(2);
      const pr = insertPlayer.run(p.id, roomId, p.name, p.balance, token);
      if (pr.changes > 0) playerCount++;
    }

    for (const log of (room.logs || [])) {
      const lr = insertLog.run(log.id, roomId, log.ts, log.type, log.text, log.note || '');
      if (lr.changes > 0) logCount++;
    }
  }

  return { roomCount, playerCount, logCount };
});

const result = migrateAll();
console.log(`迁移完成：${result.roomCount} 个房间，${result.playerCount} 名玩家，${result.logCount} 条日志`);
console.log(`数据库文件：${DB_FILE}`);
