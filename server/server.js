require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { URL } = require('url');
const Database = require('better-sqlite3');
const { WebSocketServer } = require('ws');
const { createAiHandler } = require('./ai');

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

const LOCAL_IP = getLocalIP();

const PORT = process.env.PORT || 8765;
const PROJECT_ROOT = path.join(__dirname, '..');
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'monopoly.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

// ─── 数据库初始化 ────────────────────────────────────────────────────────────

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

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

// ─── 预编译语句 ──────────────────────────────────────────────────────────────

const stmts = {
  insertRoom: db.prepare(
    'INSERT INTO rooms (id, created_at, updated_at, banker_token, config) VALUES (?, ?, ?, ?, ?)'
  ),
  updateRoomTs: db.prepare(
    'UPDATE rooms SET updated_at = ? WHERE id = ?'
  ),
  getRoom: db.prepare('SELECT * FROM rooms WHERE id = ?'),
  insertPlayer: db.prepare(
    'INSERT INTO players (id, room_id, name, balance, token) VALUES (?, ?, ?, ?, ?)'
  ),
  getPlayers: db.prepare('SELECT * FROM players WHERE room_id = ? ORDER BY rowid'),
  updatePlayer: db.prepare(
    'UPDATE players SET name = ?, balance = ? WHERE id = ?'
  ),
  insertLog: db.prepare(
    'INSERT INTO logs (id, room_id, ts, type, text, note) VALUES (?, ?, ?, ?, ?, ?)'
  ),
  getLogsPage: db.prepare(
    'SELECT * FROM logs WHERE room_id = ? ORDER BY ts DESC LIMIT ? OFFSET ?'
  ),
  getLogsCount: db.prepare(
    'SELECT COUNT(*) as total FROM logs WHERE room_id = ?'
  ),
  listRooms: db.prepare(
    'SELECT id, created_at, updated_at, config FROM rooms ORDER BY updated_at DESC'
  ),
  deleteRoom: db.prepare('DELETE FROM rooms WHERE id = ?'),
  deletePlayers: db.prepare('DELETE FROM players WHERE room_id = ?'),
  deleteLogs: db.prepare('DELETE FROM logs WHERE room_id = ?')
};

// ─── 工具函数 ────────────────────────────────────────────────────────────────

function randomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function randomToken() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

function send(res, code, payload, contentType = 'application/json; charset=utf-8') {
  res.writeHead(code, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store'
  });
  if (Buffer.isBuffer(payload) || typeof payload === 'string') return res.end(payload);
  res.end(JSON.stringify(payload));
}

function body(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => raw += chunk);
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// ─── 数据库操作 ──────────────────────────────────────────────────────────────

function createRoom(playerCount, startingMoney, goSalary = 200) {
  const roomId = randomId();
  const bankerToken = randomToken();
  const now = Date.now();

  const players = Array.from({ length: playerCount }, (_, i) => ({
    id: `${now}_${i}_${Math.random().toString(36).slice(2, 6)}`,
    name: `玩家${i + 1}`,
    balance: Number(startingMoney),
    token: randomToken()
  }));

  const config = JSON.stringify({ playerCount, startingMoney: Number(startingMoney), goSalary: Number(goSalary), bankBalance: 0 });

  const insertAll = db.transaction(() => {
    stmts.insertRoom.run(roomId, now, now, bankerToken, config);
    for (const p of players) {
      stmts.insertPlayer.run(p.id, roomId, p.name, p.balance, p.token);
    }
    stmts.insertLog.run(
      `${now}_seed`, roomId, now, 'system',
      `创建房间 ${roomId}，共 ${playerCount} 名玩家，每人起始金额 ¥${Number(startingMoney)}`,
      '系统'
    );
  });

  insertAll();
  return getRoom(roomId);
}

function getRoom(roomId, logLimit = 50, logOffset = 0) {
  const row = stmts.getRoom.get(roomId);
  if (!row) return null;
  const logsTotal = stmts.getLogsCount.get(roomId).total;
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    bankerToken: row.banker_token,
    config: JSON.parse(row.config),
    players: stmts.getPlayers.all(roomId),
    logs: stmts.getLogsPage.all(roomId, logLimit, logOffset),
    logsTotal
  };
}

function addLog(roomId, entry) {
  const id = `${Date.now()}_${Math.random()}`;
  const ts = Date.now();
  stmts.insertLog.run(id, roomId, ts, entry.type, entry.text, entry.note || '');
  stmts.updateRoomTs.run(ts, roomId);
}

function updateRoom(room) {
  const now = Date.now();
  const updateAll = db.transaction(() => {
    stmts.updateRoomTs.run(now, room.id);
    for (const p of room.players) {
      stmts.updatePlayer.run(p.name, p.balance, p.id);
    }
  });
  updateAll();
}

function resolveIdentity(room, token) {
  if (!token) return null;
  if (token === room.bankerToken) return { role: 'banker' };
  const player = room.players.find(p => p.token === token);
  if (player) return { role: 'player', player };
  return null;
}

function publicRoom(room) {
  return {
    id: room.id,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    config: room.config,
    players: room.players.map(({ token: _t, room_id: _r, ...rest }) => rest),
    logs: room.logs.map(({ room_id: _r, ...rest }) => rest),
    logsTotal: room.logsTotal
  };
}

// ─── WebSocket 房间连接池 ────────────────────────────────────────────────────
// roomClients: Map<roomId, Set<ws>>

const roomClients = new Map();

function wsJoinRoom(ws, roomId) {
  if (!roomClients.has(roomId)) roomClients.set(roomId, new Set());
  roomClients.get(roomId).add(ws);
}

function wsLeaveRoom(ws, roomId) {
  const set = roomClients.get(roomId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) roomClients.delete(roomId);
}

function broadcastRoom(roomId, message) {
  const set = roomClients.get(roomId);
  if (!set) return;
  const data = JSON.stringify(message);
  for (const client of set) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(data);
    }
  }
}

// ─── 静态文件服务 ────────────────────────────────────────────────────────────

function parseApiPath(pathname) {
  return pathname.split('/').filter(Boolean);
}

function serveFile(res, filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = ext === '.html' ? 'text/html; charset=utf-8'
      : ext === '.js' ? 'application/javascript; charset=utf-8'
      : ext === '.css' ? 'text/css; charset=utf-8'
      : ext === '.svg' ? 'image/svg+xml'
      : ext === '.ico' ? 'image/x-icon'
      : 'text/plain; charset=utf-8';
    send(res, 200, fs.readFileSync(filePath), contentType);
  } catch {
    send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  }
}

// ─── HTTP 服务 ───────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = reqUrl;

  if (req.method === 'GET' && pathname === '/api/health') {
    const count = db.prepare('SELECT COUNT(*) as n FROM rooms').get().n;
    return send(res, 200, { ok: true, rooms: count });
  }

  if (req.method === 'GET' && pathname === '/api/localip') {
    return send(res, 200, { ok: true, ip: LOCAL_IP, port: PORT });
  }

  // ── AI Gateway ──────────────────────────────────────────────────────────────
  // POST /api/ai/chat  { messages, model?, temperature?, max_tokens?, stream? }
  if (req.method === 'POST' && pathname === '/api/ai/chat') {
    let reqBody;
    try { reqBody = await body(req); } catch { return send(res, 400, { ok: false, error: 'invalid_json' }); }
    const aiHandler = createAiHandler();
    return aiHandler(req, res, reqBody);
  }

  if (pathname.startsWith('/api/rooms')) {
    const parts = parseApiPath(pathname);

    if (req.method === 'POST' && pathname === '/api/rooms') {
      try {
        const data = await body(req);
        const playerCount = Math.max(2, Math.min(8, Number(data.playerCount || 4)));
        const startingMoney = Math.max(0, Number(data.startingMoney || 1500));
        const goSalary = Math.max(0, Number(data.goSalary ?? 200));
        const room = createRoom(playerCount, startingMoney, goSalary);
        return send(res, 200, {
          ok: true,
          roomId: room.id,
          bankerToken: room.bankerToken,
          playerTokens: room.players.map(p => ({ id: p.id, name: p.name, token: p.token })),
          room: publicRoom(room)
        });
      } catch (e) {
        return send(res, 400, { ok: false, error: 'invalid_json' });
      }
    }

    // 列出所有历史房间（仅返回摘要）
    if (req.method === 'GET' && pathname === '/api/rooms') {
      const rows = stmts.listRooms.all();
      const list = rows.map(r => ({
        id: r.id,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        config: JSON.parse(r.config)
      }));
      return send(res, 200, { ok: true, rooms: list });
    }

    const roomId = parts[2];

    // 删除房间（无需鉴权，仅在 init 页使用）
    if (req.method === 'DELETE' && parts.length === 3) {
      const deleteAll = db.transaction(() => {
        stmts.deleteLogs.run(roomId);
        stmts.deletePlayers.run(roomId);
        stmts.deleteRoom.run(roomId);
      });
      deleteAll();
      return send(res, 200, { ok: true });
    }

    const room = getRoom(roomId);
    if (!room) return send(res, 404, { ok: false, error: 'room_not_found' });

    if (req.method === 'GET' && parts.length === 3) {
      const token = reqUrl.searchParams.get('token');
      const identity = resolveIdentity(room, token);
      if (!identity) return send(res, 403, { ok: false, error: 'invalid_token' });
      const extra = identity.role === 'banker'
        ? { playerTokens: room.players.map(p => ({ id: p.id, name: p.name, token: p.token })) }
        : {};
      return send(res, 200, { ok: true, identity: identity.role, playerId: identity.player?.id || null, ...extra, room: publicRoom(room) });
    }

    // 分页获取流水记录
    if (req.method === 'GET' && parts.length === 4 && parts[3] === 'logs') {
      const token = reqUrl.searchParams.get('token');
      const identity = resolveIdentity(room, token);
      if (!identity) return send(res, 403, { ok: false, error: 'invalid_token' });
      const limit = Math.min(200, Math.max(1, Number(reqUrl.searchParams.get('limit') || 50)));
      const offset = Math.max(0, Number(reqUrl.searchParams.get('offset') || 0));
      const total = stmts.getLogsCount.get(roomId).total;
      const logs = stmts.getLogsPage.all(roomId, limit, offset)
        .map(({ room_id: _r, ...rest }) => rest);
      return send(res, 200, { ok: true, logs, total, limit, offset });
    }

    let reqBody;
    try { reqBody = await body(req); } catch { return send(res, 400, { ok: false, error: 'invalid_json' }); }

    const token = reqBody.token;
    const identity = resolveIdentity(room, token);
    if (!identity) return send(res, 403, { ok: false, error: 'invalid_token' });

    if (req.method === 'POST' && parts[3] === 'rename') {
      const player = room.players.find(p => p.id === reqBody.playerId);
      if (!player) return send(res, 404, { ok: false, error: 'player_not_found' });
      if (identity.role === 'player' && identity.player.id !== player.id)
        return send(res, 403, { ok: false, error: 'forbidden' });
      const oldName = player.name;
      player.name = String(reqBody.name || '').trim().slice(0, 20) || player.name;
      stmts.updatePlayer.run(player.name, player.balance, player.id);
      addLog(room.id, { type: 'system', text: `${oldName} 重命名为 ${player.name}`, note: '玩家编辑' });
      const updated = publicRoom(getRoom(roomId));
      broadcastRoom(roomId, { type: 'room_update', room: updated });
      return send(res, 200, { ok: true, room: updated });
    }

    if (req.method === 'POST' && parts[3] === 'action') {
      const amount = Number(reqBody.amount || 0);
      const note = String(reqBody.note || '').slice(0, 60);
      if (!(amount > 0)) return send(res, 400, { ok: false, error: 'invalid_amount' });

      if (reqBody.type === 'bank-add' || reqBody.type === 'bank-sub') {
        if (identity.role !== 'banker') return send(res, 403, { ok: false, error: 'forbidden' });
        const player = room.players.find(p => p.id === reqBody.playerId);
        if (!player) return send(res, 404, { ok: false, error: 'player_not_found' });
        player.balance += reqBody.type === 'bank-add' ? amount : -amount;
        stmts.updatePlayer.run(player.name, player.balance, player.id);
        // 更新银行资金：bank-add 银行发钱，bankBalance 减少；bank-sub 银行扣钱（收钱），bankBalance 增加
        const bankDelta = reqBody.type === 'bank-add' ? -amount : amount;
        const newBankBalance = (room.config.bankBalance ?? 0) + bankDelta;
        const newConfig = { ...room.config, bankBalance: newBankBalance };
        db.prepare('UPDATE rooms SET config = ?, updated_at = ? WHERE id = ?')
          .run(JSON.stringify(newConfig), Date.now(), roomId);
        addLog(room.id, {
          type: reqBody.type,
          text: `银行${reqBody.type === 'bank-add' ? '发给' : '扣除'} ${player.name} ¥${amount}`,
          note
        });
      } else if (reqBody.type === 'pay-fine') {
        if (identity.role !== 'player') return send(res, 403, { ok: false, error: 'forbidden' });
        const player = room.players.find(p => p.id === identity.player.id);
        if (!player) return send(res, 404, { ok: false, error: 'player_not_found' });
        player.balance -= amount;
        stmts.updatePlayer.run(player.name, player.balance, player.id);
        // 玩家向银行缴款，bankBalance 增加
        const newBankBalance = (room.config.bankBalance ?? 0) + amount;
        const newConfig = { ...room.config, bankBalance: newBankBalance };
        db.prepare('UPDATE rooms SET config = ?, updated_at = ? WHERE id = ?')
          .run(JSON.stringify(newConfig), Date.now(), roomId);
        addLog(room.id, {
          type: 'bank-sub',
          text: `${player.name} 向银行缴款 ¥${amount}`,
          note
        });
      } else if (reqBody.type === 'transfer') {
        const from = room.players.find(p => p.id === reqBody.fromPlayerId);
        const to = room.players.find(p => p.id === reqBody.toPlayerId);
        if (!from || !to) return send(res, 404, { ok: false, error: 'player_not_found' });
        if (from.id === to.id) return send(res, 400, { ok: false, error: 'same_player' });
        if (identity.role === 'player' && identity.player.id !== from.id)
          return send(res, 403, { ok: false, error: 'forbidden' });
        from.balance -= amount;
        to.balance += amount;
        const updateTwo = db.transaction(() => {
          stmts.updatePlayer.run(from.name, from.balance, from.id);
          stmts.updatePlayer.run(to.name, to.balance, to.id);
        });
        updateTwo();
        addLog(room.id, { type: 'transfer', text: `${from.name} 向 ${to.name} 转账 ¥${amount}`, note });
      } else {
        return send(res, 400, { ok: false, error: 'invalid_type' });
      }

      const updated = publicRoom(getRoom(roomId));
      broadcastRoom(roomId, { type: 'room_update', room: updated });
      return send(res, 200, { ok: true, room: updated });
    }

    if (req.method === 'POST' && parts[3] === 'update-config') {
      if (identity.role !== 'banker') return send(res, 403, { ok: false, error: 'forbidden' });
      const newGoSalary = Number(reqBody.goSalary);
      if (!(newGoSalary >= 0)) return send(res, 400, { ok: false, error: 'invalid_amount' });
      const newConfig = { ...room.config, goSalary: newGoSalary };
      db.prepare('UPDATE rooms SET config = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(newConfig), Date.now(), roomId);
      addLog(room.id, { type: 'system', text: `过起点奖励金额更新为 ¥${newGoSalary}`, note: '庄家设置' });
      const updated = publicRoom(getRoom(roomId));
      broadcastRoom(roomId, { type: 'room_update', room: updated });
      return send(res, 200, { ok: true, room: updated });
    }

    if (req.method === 'POST' && parts[3] === 'reset') {
      if (identity.role !== 'banker') return send(res, 403, { ok: false, error: 'forbidden' });
      const resetAll = db.transaction(() => {
        for (let i = 0; i < room.players.length; i++) {
          const p = room.players[i];
          stmts.updatePlayer.run(`玩家${i + 1}`, room.config.startingMoney, p.id);
        }
        // 重置银行资金为 0
        const newConfig = { ...room.config, bankBalance: 0 };
        db.prepare('UPDATE rooms SET config = ? WHERE id = ?').run(JSON.stringify(newConfig), roomId);
      });
      resetAll();
      addLog(room.id, { type: 'system', text: `房间 ${room.id} 已重置为开局状态`, note: '系统重置' });
      const updated = publicRoom(getRoom(roomId));
      broadcastRoom(roomId, { type: 'room_update', room: updated });
      return send(res, 200, { ok: true, room: updated });
    }

    if (req.method === 'POST' && parts[3] === 'pause') {
      if (identity.role !== 'banker') return send(res, 403, { ok: false, error: 'forbidden' });
      // 确保当前数据已落库（updateRoomTs 刷新时间戳即可，数据在每次操作时已实时写入）
      stmts.updateRoomTs.run(Date.now(), roomId);
      addLog(room.id, { type: 'system', text: `游戏已暂停`, note: '庄家暂停' });
      // 广播暂停消息，客户端收到后断开并返回主页
      broadcastRoom(roomId, { type: 'room_paused' });
      // 强制关闭所有该房间的 WS 连接
      const clients = roomClients.get(roomId);
      if (clients) {
        for (const client of [...clients]) {
          client.close(4100, 'room_paused');
        }
        roomClients.delete(roomId);
      }
      return send(res, 200, { ok: true });
    }

    return send(res, 404, { ok: false, error: 'not_found' });
  }

  if ((req.method === 'GET' || req.method === 'HEAD') && (pathname === '/' || pathname === '/index.html')) {
    if (req.method === 'HEAD') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end();
    }
    return serveFile(res, path.join(DIST_DIR, 'index.html'));
  }

  const staticPath = path.join(DIST_DIR, pathname);
  if (fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
    return serveFile(res, staticPath);
  }

  return serveFile(res, path.join(DIST_DIR, 'index.html'));
});

// ─── WebSocket 服务 ──────────────────────────────────────────────────────────
// 握手 URL: ws://<host>/ws?room=<roomId>&token=<token>

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);
  const roomId = reqUrl.searchParams.get('room');
  const token = reqUrl.searchParams.get('token');

  if (!roomId || !token) {
    ws.close(4001, 'missing_params');
    return;
  }

  const room = getRoom(roomId);
  if (!room) {
    ws.close(4004, 'room_not_found');
    return;
  }

  const identity = resolveIdentity(room, token);
  if (!identity) {
    ws.close(4003, 'invalid_token');
    return;
  }

  wsJoinRoom(ws, roomId);

  // 立即推送当前房间状态
  ws.send(JSON.stringify({ type: 'room_update', room: publicRoom(room) }));

  // 心跳：每 25s 发一次 ping，客户端回 pong
  const heartbeat = setInterval(() => {
    if (ws.readyState === 1) ws.ping();
  }, 25000);

  ws.on('pong', () => {});

  ws.on('close', () => {
    clearInterval(heartbeat);
    wsLeaveRoom(ws, roomId);
  });

  ws.on('error', () => {
    clearInterval(heartbeat);
    wsLeaveRoom(ws, roomId);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Monopoly bank listening on http://0.0.0.0:${PORT}`);
  console.log(`WebSocket  endpoint  ws://0.0.0.0:${PORT}/ws`);
  console.log(`Database: ${DB_FILE}`);
});
