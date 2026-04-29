require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { URL } = require('url');
const createDatabase = require('./db');
const { WebSocketServer } = require('ws');
const { createAiHandler, chat, DEFAULT_MODEL } = require('./ai');
const { AVATAR_COUNT, avatarFilePath, avatarPath, normalizeAvatarId } = require('./avatar');
const { applyDeposit, applyInterest, applyWithdrawal, normalizeDepositAccount } = require('./depositAccount');

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
const CERT_DIR = path.join(PROJECT_ROOT, 'certs');
const CERT_FILE = path.join(CERT_DIR, 'cert.pem');
const KEY_FILE = path.join(CERT_DIR, 'key.pem');
const USE_HTTPS = fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE);
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'monopoly.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

// ─── 数据库初始化 ────────────────────────────────────────────────────────────

const db = createDatabase(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    id          TEXT PRIMARY KEY,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    banker_token TEXT NOT NULL,
    config      TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'active'
  );

  CREATE TABLE IF NOT EXISTS players (
    id       TEXT PRIMARY KEY,
    room_id  TEXT NOT NULL REFERENCES rooms(id),
    name     TEXT NOT NULL,
    balance  INTEGER NOT NULL,
    token    TEXT NOT NULL,
    avatar_id INTEGER NOT NULL DEFAULT 1,
    joined_at INTEGER
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

  CREATE TABLE IF NOT EXISTS properties (
    id          TEXT PRIMARY KEY,
    player_id   TEXT NOT NULL REFERENCES players(id),
    room_id     TEXT NOT NULL REFERENCES rooms(id),
    name        TEXT NOT NULL,
    price       INTEGER NOT NULL,
    rents       TEXT NOT NULL,
    card_type   TEXT NOT NULL DEFAULT 'deed',
    group_key   TEXT NOT NULL DEFAULT '',
    rule_kind   TEXT NOT NULL DEFAULT 'buildable',
    rule_data   TEXT NOT NULL DEFAULT '{}',
    mortgaged   INTEGER NOT NULL DEFAULT 0,
    build_count INTEGER NOT NULL DEFAULT 0,
    build_unit_cost INTEGER NOT NULL DEFAULT 0,
    build_cost  INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_properties_room ON properties(room_id);
  CREATE INDEX IF NOT EXISTS idx_properties_player ON properties(player_id);

  CREATE TABLE IF NOT EXISTS deposits (
    id          TEXT PRIMARY KEY,
    player_id   TEXT NOT NULL REFERENCES players(id),
    room_id     TEXT NOT NULL REFERENCES rooms(id),
    amount      INTEGER NOT NULL,
    principal_amount INTEGER NOT NULL DEFAULT 0,
    interest_earned INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    status      TEXT NOT NULL DEFAULT 'active'
  );
  CREATE INDEX IF NOT EXISTS idx_deposits_room ON deposits(room_id);
  CREATE INDEX IF NOT EXISTS idx_deposits_player ON deposits(player_id);

  CREATE TABLE IF NOT EXISTS loans (
    id          TEXT PRIMARY KEY,
    player_id   TEXT NOT NULL REFERENCES players(id),
    room_id     TEXT NOT NULL REFERENCES rooms(id),
    principal   INTEGER NOT NULL,
    remaining   INTEGER NOT NULL,
    rate        REAL NOT NULL,
    created_at  INTEGER NOT NULL,
    status      TEXT NOT NULL DEFAULT 'active',
    ai_reason   TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_loans_room ON loans(room_id);
  CREATE INDEX IF NOT EXISTS idx_loans_player ON loans(player_id);
`);

// ─── 运行时迁移（兼容旧数据库） ─────────────────────────────────────────────
try { db.exec(`ALTER TABLE rooms ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`); } catch {}
try { db.exec(`ALTER TABLE properties ADD COLUMN mortgaged INTEGER NOT NULL DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE properties ADD COLUMN build_count INTEGER NOT NULL DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE properties ADD COLUMN build_unit_cost INTEGER NOT NULL DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE properties ADD COLUMN build_cost INTEGER NOT NULL DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE properties ADD COLUMN card_type TEXT NOT NULL DEFAULT 'deed'`); } catch {}
try { db.exec(`ALTER TABLE properties ADD COLUMN group_key TEXT NOT NULL DEFAULT ''`); } catch {}
try { db.exec(`ALTER TABLE properties ADD COLUMN rule_kind TEXT NOT NULL DEFAULT 'buildable'`); } catch {}
try { db.exec(`ALTER TABLE properties ADD COLUMN rule_data TEXT NOT NULL DEFAULT '{}'`); } catch {}
try { db.exec(`CREATE TABLE IF NOT EXISTS deposits (id TEXT PRIMARY KEY, player_id TEXT NOT NULL, room_id TEXT NOT NULL, amount INTEGER NOT NULL, created_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active')`); } catch {}
try { db.exec(`ALTER TABLE deposits ADD COLUMN principal_amount INTEGER NOT NULL DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE deposits ADD COLUMN interest_earned INTEGER NOT NULL DEFAULT 0`); } catch {}
try { db.exec(`UPDATE deposits SET principal_amount = amount WHERE principal_amount = 0 AND amount > 0`); } catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_deposits_room ON deposits(room_id)`); } catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_deposits_player ON deposits(player_id)`); } catch {}
try { db.exec(`CREATE TABLE IF NOT EXISTS loans (id TEXT PRIMARY KEY, player_id TEXT NOT NULL, room_id TEXT NOT NULL, principal INTEGER NOT NULL, remaining INTEGER NOT NULL, rate REAL NOT NULL, created_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active', ai_reason TEXT NOT NULL DEFAULT '')`); } catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_loans_room ON loans(room_id)`); } catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_loans_player ON loans(player_id)`); } catch {}
try { db.exec(`ALTER TABLE players ADD COLUMN avatar_id INTEGER NOT NULL DEFAULT 1`); } catch {}
try { db.exec(`ALTER TABLE players ADD COLUMN joined_at INTEGER`); } catch {}

// ─── 修复旧数据：status 列新增前暂停的房间仍为 active，根据日志修正 ──────────
try {
  const activeRooms = db.prepare("SELECT id FROM rooms WHERE status = 'active'").all();
  for (const { id } of activeRooms) {
    const lastLog = db.prepare("SELECT text FROM logs WHERE room_id = ? ORDER BY ts DESC LIMIT 1").get(id);
    if (lastLog && lastLog.text === '游戏已暂停') {
      db.prepare("UPDATE rooms SET status = 'paused' WHERE id = ?").run(id);
    }
  }
} catch {}

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
    'INSERT INTO players (id, room_id, name, balance, token, avatar_id) VALUES (?, ?, ?, ?, ?, ?)'
  ),
  getPlayers: db.prepare('SELECT * FROM players WHERE room_id = ? ORDER BY rowid'),
  updatePlayer: db.prepare(
    'UPDATE players SET name = ?, balance = ?, avatar_id = ? WHERE id = ?'
  ),
  markPlayerJoined: db.prepare(
    'UPDATE players SET joined_at = COALESCE(joined_at, ?) WHERE id = ? AND room_id = ?'
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
    'SELECT id, created_at, updated_at, config, status FROM rooms ORDER BY updated_at DESC'
  ),
  deleteRoom: db.prepare('DELETE FROM rooms WHERE id = ?'),
  deletePlayers: db.prepare('DELETE FROM players WHERE room_id = ?'),
  deleteLogs: db.prepare('DELETE FROM logs WHERE room_id = ?'),
  insertProperty: db.prepare(
    'INSERT INTO properties (id, player_id, room_id, name, price, rents, card_type, group_key, rule_kind, rule_data, mortgaged, build_count, build_unit_cost, build_cost, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 0, ?)'
  ),
  getProperties: db.prepare('SELECT * FROM properties WHERE room_id = ? ORDER BY created_at DESC'),
  getPlayerProperties: db.prepare('SELECT * FROM properties WHERE player_id = ? ORDER BY created_at DESC'),
  deleteProperties: db.prepare('DELETE FROM properties WHERE room_id = ?'),
  updatePropertyMortgaged: db.prepare('UPDATE properties SET mortgaged = ? WHERE id = ?'),
  updatePropertyBuild: db.prepare('UPDATE properties SET build_count = ?, build_cost = ? WHERE id = ?'),
  updatePropertyDetails: db.prepare('UPDATE properties SET name = ?, price = ?, build_unit_cost = ?, build_cost = ?, rents = ?, card_type = ?, group_key = ?, rule_kind = ?, rule_data = ? WHERE id = ?'),
  updatePropertyOwner: db.prepare('UPDATE properties SET player_id = ? WHERE id = ?'),

  // deposits
  insertDeposit: db.prepare(
    'INSERT INTO deposits (id, player_id, room_id, amount, principal_amount, interest_earned, created_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ),
  getDeposits: db.prepare('SELECT * FROM deposits WHERE room_id = ? AND status = ? ORDER BY created_at DESC'),
  getPlayerDeposits: db.prepare('SELECT * FROM deposits WHERE player_id = ? AND status = ? ORDER BY created_at DESC'),
  updateDepositAccount: db.prepare('UPDATE deposits SET amount = ?, principal_amount = ?, interest_earned = ? WHERE id = ?'),
  updateDepositStatus: db.prepare('UPDATE deposits SET status = ? WHERE id = ?'),

  // loans
  insertLoan: db.prepare(
    'INSERT INTO loans (id, player_id, room_id, principal, remaining, rate, created_at, status, ai_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ),
  getLoans: db.prepare('SELECT * FROM loans WHERE room_id = ? AND status = ? ORDER BY created_at DESC'),
  getPlayerLoans: db.prepare('SELECT * FROM loans WHERE player_id = ? AND status = ? ORDER BY created_at DESC'),
  updateLoanRemaining: db.prepare('UPDATE loans SET remaining = ? WHERE id = ?'),
  updateLoanStatus: db.prepare('UPDATE loans SET status = ? WHERE id = ?')
};

// ─── 工具函数 ────────────────────────────────────────────────────────────────

function randomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function randomToken() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

function propertyAssetValue(property) {
  return Number(property.price || 0) + Number(property.build_cost || 0);
}

function safeJsonParse(value, fallback) {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function compactKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .slice(0, 40);
}

function normalizeCardType(value) {
  return value === 'special' ? 'special' : 'deed';
}

function normalizeRuleKind(value, cardType) {
  const kind = String(value || '').trim();
  if (['count_tier', 'pair_bonus', 'dice_multiplier'].includes(kind)) return kind;
  return cardType === 'special' ? 'count_tier' : 'buildable';
}

function normalizeNonNegativeInt(value, fallback = 0) {
  const normalized = Math.floor(Number(value));
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : fallback;
}

function normalizeAmountArray(values, fallback = []) {
  return (Array.isArray(values) ? values : fallback)
    .map(v => Math.floor(Number(v)))
    .filter(v => Number.isFinite(v) && v >= 0)
    .slice(0, 8);
}

function normalizeRuleData(ruleKind, rawData = {}) {
  const data = rawData && typeof rawData === 'object' ? rawData : {};
  if (ruleKind === 'pair_bonus') {
    return {
      singleRent: normalizeNonNegativeInt(data.singleRent ?? data.single ?? data.rent ?? data.rents?.[0]),
      pairRent: normalizeNonNegativeInt(data.pairRent ?? data.bothRent ?? data.fullSetRent ?? data.rents?.[1]),
      pairSize: Math.max(2, normalizeNonNegativeInt(data.pairSize ?? data.setSize, 2))
    };
  }
  if (ruleKind === 'dice_multiplier') {
    return {
      multipliersByOwned: normalizeAmountArray(
        data.multipliersByOwned ?? data.multipliers ?? data.tiers,
        [4, 10]
      )
    };
  }
  if (ruleKind === 'count_tier') {
    return {
      rentsByOwned: normalizeAmountArray(
        data.rentsByOwned ?? data.rents ?? data.tiers ?? data.amounts
      )
    };
  }
  return {};
}

function normalizePropertyCardFields(property = {}, amount = 0) {
  const cardType = normalizeCardType(property.cardType ?? property.card_type);
  const ruleKind = normalizeRuleKind(property.ruleKind ?? property.rule_kind, cardType);
  const ruleData = normalizeRuleData(ruleKind, property.ruleData ?? property.rule_data);
  const fallbackGroup = ruleKind === 'buildable' ? '' : (property.groupName || property.name || '');
  return {
    cardType,
    groupKey: ruleKind === 'buildable' ? '' : compactKey(property.groupKey ?? property.group_key ?? fallbackGroup),
    ruleKind,
    ruleData,
    price: Number.isFinite(Number(property.price)) ? Math.floor(Number(property.price)) : amount
  };
}

function playerAvatarId(player, fallback = 1) {
  return normalizeAvatarId(player?.avatar_id, fallback);
}

function attachAvatar(player, fallback = 1) {
  const avatarId = playerAvatarId(player, fallback);
  return {
    ...player,
    avatar_id: avatarId,
    avatar_url: avatarPath(avatarId)
  };
}

function persistPlayer(player) {
  const avatarId = playerAvatarId(player);
  player.avatar_id = avatarId;
  stmts.updatePlayer.run(player.name, player.balance, avatarId, player.id);
}

function wouldMakeBalanceNegative(player, delta) {
  return Number(player.balance || 0) + Number(delta || 0) < 0;
}

function pendingPropertySales(config) {
  return Array.isArray(config?.pendingPropertySales) ? config.pendingPropertySales : [];
}

function defaultLotteryConfig(now = Date.now(), overrides = {}) {
  return {
    enabled: true,
    ticketPrice: 200,
    numberCount: 30,
    drawIntervalMin: 30,
    buyCooldownMs: 2 * 60 * 1000,
    jackpotPool: 0,
    lastDrawAt: now,
    tickets: [],
    lastPurchaseAtByPlayer: {},
    lastResult: null,
    ...overrides
  };
}

function getLotteryConfig(config, now = Date.now()) {
  return {
    ...defaultLotteryConfig(now),
    ...(config?.lottery || {}),
    tickets: Array.isArray(config?.lottery?.tickets) ? config.lottery.tickets : [],
    lastPurchaseAtByPlayer: config?.lottery?.lastPurchaseAtByPlayer && typeof config.lottery.lastPurchaseAtByPlayer === 'object'
      ? config.lottery.lastPurchaseAtByPlayer
      : {}
  };
}

function calculateLotteryResult(room, winningNumber) {
  const lottery = getLotteryConfig(room.config);
  const tickets = lottery.tickets;
  const winners = tickets.filter(ticket => ticket.number === winningNumber);
  const bankContribution = Math.max(0, Math.floor(Math.max(0, Number(room.config.bankBalance || 0)) * 0.1));
  const prize = winners.length > 0 ? lottery.jackpotPool + bankContribution : 0;
  const prizePerWinner = winners.length > 0 ? Math.floor(prize / winners.length) : 0;
  const prizeRemainder = winners.length > 0 ? prize - prizePerWinner * winners.length : 0;

  return {
    lottery,
    tickets,
    winners,
    bankContribution,
    prize,
    prizePerWinner,
    prizeRemainder
  };
}

function settleLotteryDraw(roomId, room, now = Date.now()) {
  const lottery = getLotteryConfig(room.config, now);
  const winningNumber = Math.floor(Math.random() * lottery.numberCount) + 1;
  const { winners, bankContribution, prize, prizePerWinner, prizeRemainder } = calculateLotteryResult(room, winningNumber);

  const nextLottery = {
    ...lottery,
    jackpotPool: winners.length > 0 ? prizeRemainder : lottery.jackpotPool,
    lastDrawAt: now,
    tickets: [],
    lastResult: {
      winningNumber,
      drawnAt: now,
      winnerIds: winners.map(w => w.playerId),
      ticketCount: lottery.tickets.length,
      prize,
      prizePerWinner,
      bankContribution,
      carryOverPool: winners.length > 0 ? prizeRemainder : lottery.jackpotPool
    }
  };

  let nextBankBalance = Number(room.config.bankBalance || 0);
  const playerMap = new Map(room.players.map(player => [player.id, player]));

  if (winners.length > 0) {
    for (const winner of winners) {
      const player = playerMap.get(winner.playerId);
      if (!player) continue;
      player.balance += prizePerWinner;
      persistPlayer(player);
    }
    nextBankBalance -= bankContribution;
  }

  saveRoomConfig(roomId, {
    ...room.config,
    bankBalance: nextBankBalance,
    lottery: nextLottery
  });

  if (winners.length > 0) {
    const winnerNames = winners
      .map(winner => playerMap.get(winner.playerId)?.name)
      .filter(Boolean);
    addLog(roomId, {
      type: 'system',
      text: `彩票开奖：${winningNumber} 号，${winnerNames.join('、')} 中奖，各得 ¥${prizePerWinner}`,
      note: `奖池 ¥${lottery.jackpotPool} + 银行出资 ¥${bankContribution}`
    });
    if (prizeRemainder > 0) {
      addLog(roomId, {
        type: 'system',
        text: `彩票余奖 ¥${prizeRemainder} 已顺延至下一期奖池`,
        note: '彩票开奖'
      });
    }
  } else {
    addLog(roomId, {
      type: 'system',
      text: `彩票开奖：${winningNumber} 号，本期无人中奖，奖池累计至 ¥${lottery.jackpotPool}`,
      note: `共售出 ${lottery.tickets.length} 张`
    });
  }
}

function saveRoomConfig(roomId, config) {
  db.prepare('UPDATE rooms SET config = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(config), Date.now(), roomId);
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
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// ─── 数据库操作 ──────────────────────────────────────────────────────────────

function createRoom(playerCount, startingMoney, goSalary = 200, lotteryTicketPrice = 200, lotteryEnabled = true, lotteryDrawIntervalMin = 30) {
  const roomId = randomId();
  const bankerToken = randomToken();
  const now = Date.now();

  const players = Array.from({ length: playerCount }, (_, i) => ({
    id: `${now}_${i}_${Math.random().toString(36).slice(2, 6)}`,
    name: `玩家${i + 1}`,
    balance: Number(startingMoney),
    token: randomToken(),
    avatar_id: (i % AVATAR_COUNT) + 1
  }));

  const config = JSON.stringify({
    playerCount,
    startingMoney: Number(startingMoney),
    goSalary: Number(goSalary),
    bankBalance: 0,
    interestRate: 1.5,
    interestIntervalMin: 10,
    lastInterestAt: Date.now(),
    lottery: defaultLotteryConfig(now, {
      enabled: lotteryEnabled !== false,
      ticketPrice: Number(lotteryTicketPrice),
      drawIntervalMin: Number(lotteryDrawIntervalMin)
    })
  });

  const insertAll = db.transaction(() => {
    stmts.insertRoom.run(roomId, now, now, bankerToken, config);
    for (const p of players) {
      stmts.insertPlayer.run(p.id, roomId, p.name, p.balance, p.token, p.avatar_id);
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
  const players = stmts.getPlayers.all(roomId).map((player, index) => attachAvatar(player, (index % AVATAR_COUNT) + 1));
  const properties = stmts.getProperties.all(roomId).map(p => ({
    ...p,
    rents: safeJsonParse(p.rents, Array(6).fill(0)),
    card_type: p.card_type || 'deed',
    group_key: p.group_key || '',
    rule_kind: p.rule_kind || 'buildable',
    rule_data: safeJsonParse(p.rule_data, {})
  }));
  const deposits = stmts.getDeposits.all(roomId, 'active');
  const loans = stmts.getLoans.all(roomId, 'active');
  const parsedConfig = JSON.parse(row.config);
  const config = {
    ...parsedConfig,
    lottery: parsedConfig.lottery
      ? getLotteryConfig(parsedConfig, row.updated_at || row.created_at)
      : defaultLotteryConfig(row.updated_at || row.created_at)
  };

  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    bankerToken: row.banker_token,
    status: row.status || 'active',
    config,
    players,
    properties,
    deposits,
    loans,
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

function updateDepositAccountRow(depositId, account) {
  const normalized = normalizeDepositAccount(account);
  stmts.updateDepositAccount.run(
    normalized.amount,
    normalized.principal_amount,
    normalized.interest_earned,
    depositId
  );
}

function ensureMergedDepositAccount(roomId, playerId) {
  const activeDeposits = stmts.getDeposits
    .all(roomId, 'active')
    .filter(dep => dep.player_id === playerId)
    .sort((a, b) => Number(a.created_at || 0) - Number(b.created_at || 0));

  if (activeDeposits.length === 0) return null;

  const primary = activeDeposits[0];
  const merged = activeDeposits.reduce((sum, dep) => {
    const account = normalizeDepositAccount(dep);
    return {
      amount: sum.amount + account.amount,
      principal_amount: sum.principal_amount + account.principal_amount,
      interest_earned: sum.interest_earned + account.interest_earned
    };
  }, { amount: 0, principal_amount: 0, interest_earned: 0 });

  updateDepositAccountRow(primary.id, merged);
  for (const dep of activeDeposits.slice(1)) {
    stmts.updateDepositStatus.run('merged', dep.id);
  }

  return {
    ...primary,
    ...merged
  };
}

function mergeExistingDepositAccounts() {
  const pairs = db
    .prepare("SELECT DISTINCT room_id, player_id FROM deposits WHERE status = 'active'")
    .all();
  for (const pair of pairs) {
    ensureMergedDepositAccount(pair.room_id, pair.player_id);
  }
}

mergeExistingDepositAccounts();

function updateRoom(room) {
  const now = Date.now();
  const updateAll = db.transaction(() => {
    stmts.updateRoomTs.run(now, room.id);
    for (const p of room.players) {
      persistPlayer(p);
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

function markPlayerJoined(roomId, playerId) {
  const existing = db.prepare('SELECT joined_at FROM players WHERE id = ? AND room_id = ?').get(playerId, roomId);
  if (!existing || existing.joined_at) return false;
  stmts.markPlayerJoined.run(Date.now(), playerId, roomId);
  return true;
}

// ─── AI 调整存款利率 ──────────────────────────────────────────────────────────
// 规则：初始利率 1.5%，最高不超过 100%
// 每次存款、取款、还款、计息后触发，由 AI 根据经济形势给出新利率

async function autoAdjustInterestRate(roomId, currentBankBalance) {
  try {
    const room = getRoom(roomId);
    if (!room) return;
    const { startingMoney, playerCount, interestRate: currentRate = 1.5, interestIntervalMin = 10 } = room.config;
    const base = (startingMoney ?? 1500) * (playerCount ?? 4);

    // 计算存贷款汇总，供 AI 参考
    const activeDeposits = stmts.getDeposits.all(roomId, 'active');
    const totalDeposits = activeDeposits.reduce((s, d) => s + Number(d.amount || 0), 0);
    const activeLoans = stmts.getLoans.all(roomId, 'active');
    const totalLoans = activeLoans.reduce((s, l) => s + Number(l.remaining || 0), 0);

    const prompt = `你是一个大富翁桌游的 AI 央行行长，负责根据当前经济形势调整存款利率。

当前经济数据：
- 玩家人数：${playerCount} 人
- 开局基准资金池：¥${Math.round(base)}（每人起始 ¥${startingMoney}）
- 银行当前资金：¥${currentBankBalance}（正数=盈余，负数=亏空）
- 当前存款利率：${currentRate}%（每 ${interestIntervalMin} 分钟结算一次复利）
- 活跃存款总额：¥${totalDeposits}（共 ${activeDeposits.length} 笔）
- 活跃贷款总额：¥${totalLoans}（共 ${activeLoans.length} 笔）

调整原则：
1. 重点根据游戏内进行情况判断资金流动，而不是追求现实世界的小幅稳定调整
2. 硬性规则：如果银行当前资金为负数（赤字/亏空），不要继续提高存款利率；输出的 rate 不得高于当前存款利率，只能维持或降低
3. 银行已经赤字时，优先避免复利成本继续滚大，不要为了吸引存款而加息
4. 如果银行现金仍为非负，但玩家普遍不存钱（活跃存款少或存款总额偏低），且银行现金明显降低，可以提高利率吸引玩家把现金存回银行
5. 如果银行现金很多，且玩家已经大量存钱，应降低利率，让玩家更愿意取钱消费、买地、还款或进行交易
6. 银行资金非负但严重不足（< 基准资金池 20%）：可以提高利率，快速吸引存款；但若已经为负数，不适用本条
7. 银行资金充裕（> 基准资金池 150%）：可以明显降低利率，减少继续吸储
8. 贷款总额远超存款且银行资金非负：可提高利率以平衡银行风险和吸引存款；若银行资金为负数，不要因此加息
9. 存款总额远超贷款且银行现金充裕：应降低利率，鼓励资金流出银行
10. 大富翁局内经济波动可以很大，单次利率变动不设 2% 限制，只要不超过利率上下限即可
11. 利率范围：最低 0.1%，最高 100%
12. 若当前形势平稳，或银行赤字但没有明确降息必要，可维持现有利率不变

只输出一个 JSON，不要任何解释：{"rate": 数字保留1位小数, "reason": "调整原因（15字以内）", "changed": true或false}`;

    try {
      const raw = await chat([{ role: 'user', content: prompt }], {
        model: DEFAULT_MODEL,
        temperature: 0.2,
        max_tokens: 1024
      });

      // 提取 JSON
      let jsonStr = null;
      const mdMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (mdMatch) jsonStr = mdMatch[1].trim();
      else {
        const si = raw.indexOf('{');
        if (si !== -1) {
          let depth = 0, ei = -1;
          for (let i = si; i < raw.length; i++) {
            if (raw[i] === '{') depth++;
            if (raw[i] === '}') { depth--; if (depth === 0) { ei = i; break; } }
          }
          if (ei !== -1) jsonStr = raw.slice(si, ei + 1);
        }
      }

      const parsed = jsonStr ? JSON.parse(jsonStr) : null;
      if (!parsed || parsed.changed === false) return; // AI 认为无需调整

      // 约束范围：最低 0.1%，最高 100%
      let newRate = Math.min(100, Math.max(0.1, Math.round(Number(parsed.rate) * 10) / 10));
      if (currentBankBalance < 0 && newRate > currentRate) {
        newRate = currentRate;
      }
      const aiReason = parsed.reason || 'AI 综合评估';

      if (newRate !== currentRate) {
        const newConfig = { ...room.config, interestRate: newRate };
        db.prepare('UPDATE rooms SET config = ?, updated_at = ? WHERE id = ?')
          .run(JSON.stringify(newConfig), Date.now(), roomId);
        addLog(roomId, {
          type: 'system',
          text: `AI 调整存款利率 ${currentRate}% → ${newRate}%（${aiReason}）`,
          note: '利率调整'
        });
        console.log(`[rate] room ${roomId}: ${currentRate}% → ${newRate}% — ${aiReason}`);
      }
    } catch (aiErr) {
      // AI 失败时降级为简单阈值规则（不影响游戏继续）
      console.warn('[autoAdjustInterestRate] AI 失败，使用规则降级:', aiErr.message);
      const lowThreshold = base * 0.2;
      const highThreshold = base * 1.5;
      let newRate = currentRate;
      let reason = null;
      if (currentBankBalance < 0) {
        return;
      } else if (currentBankBalance < lowThreshold) {
        newRate = Math.min(100, Math.round((currentRate + 1) * 10) / 10);
        reason = `银行资金不足，提升利率至 ${newRate}% 吸引存款`;
      } else if (currentBankBalance > highThreshold) {
        newRate = Math.max(0.1, Math.round((currentRate - 0.5) * 10) / 10);
        reason = `银行资金充裕，降低利率至 ${newRate}% 鼓励消费`;
      }
      if (reason && newRate !== currentRate) {
        const newConfig = { ...room.config, interestRate: newRate };
        db.prepare('UPDATE rooms SET config = ?, updated_at = ? WHERE id = ?')
          .run(JSON.stringify(newConfig), Date.now(), roomId);
        addLog(roomId, { type: 'system', text: reason, note: '利率调整' });
        console.log(`[rate] room ${roomId}: ${currentRate}% → ${newRate}%`);
      }
    }
  } catch (e) {
    console.error('[autoAdjustInterestRate] error:', e);
  }
}

// ─── 固定贷款利率 ──────────────────────────────────────────────────────────────
// 规则：
//   - 贷款利率固定为当前银行存款利率的 3 倍
//   - 贷款利息按每个计息周期直接从玩家现金扣除，不计入剩余本金
function calcLoanRate(room) {
  const depositRate = Number(room?.config?.interestRate ?? 1.5);
  return Math.round(depositRate * 3 * 10) / 10;
}

function publicRoom(room) {
  return {
    id: room.id,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    status: room.status || 'active',
    config: room.config,
    players: room.players.map(({ token: _t, room_id: _r, ...rest }, index) => attachAvatar(rest, (index % AVATAR_COUNT) + 1)),
    properties: room.properties || [],
    deposits: (room.deposits || []).map(({ room_id: _r, ...rest }) => rest),
    loans: (room.loans || []).map(({ room_id: _r, ...rest }) => rest),
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

const requestHandler = async (req, res) => {
  const reqUrl = new URL(req.url, `${USE_HTTPS ? 'https' : 'http'}://${req.headers.host}`);
  const { pathname } = reqUrl;

  if (req.method === 'GET' && pathname === '/api/health') {
    const count = db.prepare('SELECT COUNT(*) as n FROM rooms').get().n;
    return send(res, 200, { ok: true, rooms: count });
  }

  if (req.method === 'GET' && pathname === '/api/localip') {
    return send(res, 200, { ok: true, ip: LOCAL_IP, port: PORT });
  }

  if (req.method === 'GET' && /^\/api\/avatar\/\d+\.png$/.test(pathname)) {
    const avatarId = normalizeAvatarId(pathname.match(/(\d+)\.png$/)?.[1]);
    try {
      return send(res, 200, fs.readFileSync(avatarFilePath(avatarId)), 'image/png');
    } catch {
      return send(res, 404, 'Avatar not found', 'text/plain; charset=utf-8');
    }
  }

  // ── AI Gateway ──────────────────────────────────────────────────────────────
  // POST /api/ai/chat  { messages, model?, temperature?, max_tokens?, stream? }
  if (req.method === 'POST' && pathname === '/api/ai/chat') {
    let reqBody;
    try { reqBody = await body(req); } catch { return send(res, 400, { ok: false, error: 'invalid_json' }); }
    const aiHandler = createAiHandler();
    return aiHandler(req, res, reqBody);
  }

  // ── 地契 OCR ─────────────────────────────────────────────────────────────────
  // POST /api/ocr/deed  { image: "data:image/jpeg;base64,..." }
  // 返回: { ok: true, deed: { name, price, cardType, groupKey, ruleKind, ruleData, buildUnitCost, rents: [r0,r1,r2,r3,r4,r5] } }
  //   rents[0]=空地过路费, [1-4]=1-4栋房屋, [5]=酒店
  if (req.method === 'POST' && pathname === '/api/ocr/deed') {
    let reqBody;
    try { reqBody = await body(req); } catch { return send(res, 400, { ok: false, error: 'invalid_json' }); }

    const { image } = reqBody;
    if (!image || !image.startsWith('data:image/')) {
      return send(res, 400, { ok: false, error: 'image 字段缺失或格式错误，需提供 data URI' });
    }

    const messages = [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: image }
          },
          {
            type: 'text',
            text: `你正在识别一张中文版大富翁（Monopoly）桌游资产卡片，可能是普通地契，也可能是铁路/车站/机场/港口/水电公司等特殊资产。请重点识别：
1. 卡片名称
2. 购入价格
3. 卡片规则类型与过路费
4. 如果是普通地契，识别每层加盖费用及各档过路费

请仔细阅读卡片上的所有文字和数字，然后严格按照以下 JSON 格式输出，不要包含任何解释、注释或 markdown 代码块：

{"name":"卡片名称","price":购入价格数字或null,"cardType":"deed或special","groupKey":"同类资产分组名称或空字符串","ruleKind":"buildable或count_tier或pair_bonus或dice_multiplier","ruleData":{},"buildUnitCost":每层加盖费用数字或null,"rents":[空地过路费,一幢房屋,两幢房屋,三幢房屋,四幢房屋,旅馆]}

识别规则：
1. name：优先取卡片顶部或标题区域最醒目的名称（如"台北路"、"火车站"、"电力公司"），原样输出，不要添加“路段”“地产”“地契”等后缀，也不要输出颜色或说明文字
2. price：卡片上标注的购买地产所需金额（整数，单位为游戏币"元"），若卡片未印购买价格则填 null
3. 普通可建房地契：cardType 填 "deed"，ruleKind 填 "buildable"，groupKey 填空字符串，ruleData 填 {}。buildUnitCost 提取“每层加盖费用/每幢房屋造价/楼房建筑费”对应的单层金额；若无法确认则填 null
4. 普通地契的 rents：严格按顺序提取 6 个过路费金额，均为整数，单位为游戏币"元"：
   - rents[0]：空地（无房屋时的过路费，通常最小）
   - rents[1]：建有 1 幢房屋时的过路费
   - rents[2]：建有 2 幢房屋时的过路费
   - rents[3]：建有 3 幢房屋时的过路费
   - rents[4]：建有 4 幢房屋时的过路费
   - rents[5]：建有旅馆（酒店）时的过路费（通常最大）
5. 特殊资产卡：cardType 填 "special"，buildUnitCost 填 null，rents 填 [null,null,null,null,null,null]
6. 如果规则是“持有同类型越多，收租越多”（如车站/铁路/港口等），ruleKind 填 "count_tier"，groupKey 填该类型名称（如"铁路"、"车站"、"港口"），ruleData 填 {"rentsByOwned":[持有1张过路费,持有2张过路费,...]}
7. 如果规则是“同组通常只有两个站点，两个都持有后获得巨额过路费”，ruleKind 填 "pair_bonus"，groupKey 填该类型名称，ruleData 填 {"singleRent":单张过路费,"pairRent":两张都持有过路费,"pairSize":2}
8. 如果规则是“掷骰点数乘以倍数”，ruleKind 填 "dice_multiplier"，groupKey 填该类型名称，ruleData 填 {"multipliersByOwned":[持有1张倍数,持有2张倍数,...]}
9. 名称必须与卡片上的名称一致；如果卡片上还有其它较大的宣传文字，忽略它们，不要误填到 name
10. 若某个数字模糊或无法确认，填 null；数组中无法确认的值也填 null
11. 所有数值只填纯整数，不要包含货币符号、逗号、单位或中文数字

示例输出（仅格式参考，数字以实际卡片为准）：
{"name":"台北路","price":60,"cardType":"deed","groupKey":"","ruleKind":"buildable","ruleData":{},"buildUnitCost":50,"rents":[2,10,30,90,160,250]}
{"name":"火车站","price":200,"cardType":"special","groupKey":"铁路","ruleKind":"count_tier","ruleData":{"rentsByOwned":[25,50,100,200]},"buildUnitCost":null,"rents":[null,null,null,null,null,null]}
{"name":"南站","price":200,"cardType":"special","groupKey":"车站","ruleKind":"pair_bonus","ruleData":{"singleRent":50,"pairRent":300,"pairSize":2},"buildUnitCost":null,"rents":[null,null,null,null,null,null]}`
          }
        ]
      }
    ];

    try {
      const raw = await chat(messages, {
        model: DEFAULT_MODEL,
        temperature: 0.1,
        max_tokens: 4096
      });

      console.log('[OCR] model raw content:', JSON.stringify(raw).slice(0, 300));

      // 从回复中提取 JSON
      // 1) 优先匹配 markdown 代码块
      // 2) 否则找到第一个 { 并用括号计数匹配最外层 }
      let jsonStr = null;
      const mdMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (mdMatch) {
        jsonStr = mdMatch[1].trim();
      } else {
        const startIdx = raw.indexOf('{');
        if (startIdx !== -1) {
          let depth = 0;
          let endIdx = -1;
          for (let i = startIdx; i < raw.length; i++) {
            if (raw[i] === '{') depth++;
            if (raw[i] === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
          }
          if (endIdx !== -1) jsonStr = raw.slice(startIdx, endIdx + 1);
        }
      }

      if (!jsonStr) {
        return send(res, 502, { ok: false, error: '模型返回格式异常', raw: raw.slice(0, 500) });
      }

      const deed = JSON.parse(jsonStr);
      const normalizedBuildUnitCost = Math.floor(Number(
        deed.buildUnitCost ??
        deed.build_unit_cost ??
        deed.buildCost ??
        deed.houseCost ??
        deed.build_cost
      ));
      deed.name = String(deed.name || '').trim();
      deed.price = deed.price == null ? null : (Number.isFinite(Math.floor(Number(deed.price))) ? Math.floor(Number(deed.price)) : null);
      deed.buildUnitCost = Number.isFinite(normalizedBuildUnitCost) ? normalizedBuildUnitCost : null;
      const cardFields = normalizePropertyCardFields(deed, deed.price ?? 0);
      deed.cardType = cardFields.cardType;
      deed.groupKey = cardFields.groupKey;
      deed.ruleKind = cardFields.ruleKind;
      deed.ruleData = cardFields.ruleData;
      // 确保 rents 是长度为 6 的数组
      deed.rents = Array.from({ length: 6 }, (_, i) => {
        const value = Math.floor(Number(deed.rents?.[i]));
        return Number.isFinite(value) ? value : null;
      });
      return send(res, 200, { ok: true, deed });
    } catch (e) {
      return send(res, 502, { ok: false, error: e.message });
    }
  }

  if (pathname.startsWith('/api/rooms')) {
    const parts = parseApiPath(pathname);

    if (req.method === 'POST' && pathname === '/api/rooms') {
      try {
        const data = await body(req);
        const playerCount = Math.max(2, Math.min(8, Number(data.playerCount || 4)));
        const startingMoney = Math.max(0, Number(data.startingMoney || 1500));
        const goSalary = Math.max(0, Number(data.goSalary ?? 200));
        const lotteryTicketPrice = Math.max(0, Number(data.lotteryTicketPrice ?? 200));
        const lotteryDrawIntervalMin = Math.max(1, Number(data.lotteryDrawIntervalMin ?? 30));
        const lotteryEnabled = data.lotteryEnabled !== false;
        const room = createRoom(playerCount, startingMoney, goSalary, lotteryTicketPrice, lotteryEnabled, lotteryDrawIntervalMin);
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
        status: r.status || 'active',
        config: JSON.parse(r.config)
      }));
      return send(res, 200, { ok: true, rooms: list });
    }

    const roomId = parts[2];

    // 删除房间（无需鉴权，仅在 init 页使用）
    if (req.method === 'DELETE' && parts.length === 3) {
      const deleteAll = db.transaction(() => {
        stmts.deleteProperties.run(roomId);
        db.prepare('DELETE FROM deposits WHERE room_id = ?').run(roomId);
        db.prepare('DELETE FROM loans WHERE room_id = ?').run(roomId);
        stmts.deleteLogs.run(roomId);
        stmts.deletePlayers.run(roomId);
        stmts.deleteRoom.run(roomId);
      });
      deleteAll();
      return send(res, 200, { ok: true });
    }

    const room = getRoom(roomId);
    if (!room) return send(res, 404, { ok: false, error: 'room_not_found' });

    // ── 恢复游戏（无需鉴权，首页直接调用；庄家在游戏内也可调用） ─────────────
    if (req.method === 'POST' && parts[3] === 'resume') {
      if ((room.status || 'active') === 'ended') return send(res, 400, { ok: false, error: 'room_ended' });
      const wasPaused = (room.status || 'active') === 'paused';
      const now = Date.now();
      if (wasPaused) {
        // 修正 lastInterestAt：把暂停期间的时长补偿回来，避免恢复后立即触发利息结算
        const pausedAt = room.config.pausedAt || now;
        const pausedDuration = now - pausedAt;
        const lastAt = room.config.lastInterestAt ?? room.createdAt;
        const lottery = getLotteryConfig(room.config, room.createdAt);
        const newConfig = {
          ...room.config,
          lastInterestAt: lastAt + pausedDuration,
          pausedAt: undefined,
          lottery: {
            ...lottery,
            lastDrawAt: (lottery.lastDrawAt ?? room.createdAt) + pausedDuration
          }
        };
        // 清除 pausedAt 字段（设为 undefined 会在 JSON.stringify 时被忽略）
        db.prepare('UPDATE rooms SET status = ?, config = ?, updated_at = ? WHERE id = ?')
          .run('active', JSON.stringify(newConfig), now, roomId);
        addLog(room.id, { type: 'system', text: `游戏已恢复`, note: '庄家恢复' });
      } else {
        db.prepare('UPDATE rooms SET status = ?, updated_at = ? WHERE id = ?').run('active', now, roomId);
      }
      const updated = getRoom(roomId);
      // 广播恢复消息给所有仍连接的客户端
      broadcastRoom(roomId, { type: 'room_resumed', room: publicRoom(updated) });
      return send(res, 200, {
        ok: true,
        roomId: room.id,
        bankerToken: room.bankerToken,
        playerTokens: room.players.map(p => ({ id: p.id, name: p.name, token: p.token })),
        room: publicRoom(updated)
      });
    }

    if (req.method === 'GET' && parts.length === 3) {
      const token = reqUrl.searchParams.get('token');
      const identity = resolveIdentity(room, token);
      if (!identity) return send(res, 403, { ok: false, error: 'invalid_token' });
      const playerJoined = identity.role === 'player' && markPlayerJoined(roomId, identity.player.id);
      const currentRoom = playerJoined ? getRoom(roomId) : room;
      if (playerJoined) {
        broadcastRoom(roomId, { type: 'room_update', room: publicRoom(currentRoom) });
      }
      const extra = identity.role === 'banker'
        ? { playerTokens: currentRoom.players.map(p => ({ id: p.id, name: p.name, token: p.token })) }
        : {};
      return send(res, 200, { ok: true, identity: identity.role, playerId: identity.player?.id || null, ...extra, room: publicRoom(currentRoom) });
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
      const oldAvatarId = playerAvatarId(player);
      player.name = String(reqBody.name || '').trim().slice(0, 20) || player.name;
      player.avatar_id = normalizeAvatarId(reqBody.avatarId, oldAvatarId);
      persistPlayer(player);
      if (oldName !== player.name || oldAvatarId !== player.avatar_id) {
        addLog(room.id, {
          type: 'system',
          text: oldName !== player.name ? `${oldName} 重命名为 ${player.name}` : `${player.name} 更换了头像`,
          note: oldAvatarId !== player.avatar_id ? `玩家编辑 · 头像 ${oldAvatarId} → ${player.avatar_id}` : '玩家编辑'
        });
      }
      const updated = publicRoom(getRoom(roomId));
      broadcastRoom(roomId, { type: 'room_update', room: updated });
      return send(res, 200, { ok: true, room: updated });
    }

    if (req.method === 'POST' && parts[3] === 'action') {
      const amount = Number(reqBody.amount || 0);
      const note = String(reqBody.note || '').slice(0, 60);
      const noAmountTypes = ['mortgage', 'redeem', 'update-property', 'buy-lottery', 'respond-property-sale', 'sell-building'];
      if (!noAmountTypes.includes(reqBody.type) && !(amount > 0)) return send(res, 400, { ok: false, error: 'invalid_amount' });

      if (reqBody.type === 'bank-add' || reqBody.type === 'bank-sub') {
        if (identity.role !== 'banker') return send(res, 403, { ok: false, error: 'forbidden' });
        const player = room.players.find(p => p.id === reqBody.playerId);
        if (!player) return send(res, 404, { ok: false, error: 'player_not_found' });
        if (reqBody.type === 'bank-sub' && wouldMakeBalanceNegative(player, -amount)) {
          return send(res, 400, { ok: false, error: 'insufficient_balance' });
        }
        player.balance += reqBody.type === 'bank-add' ? amount : -amount;
        persistPlayer(player);
        // 更新银行资金：bank-add 银行发钱，bankBalance 减少；bank-sub 银行扣钱（收钱），bankBalance 增加
        const bankDelta = reqBody.type === 'bank-add' ? -amount : amount;
        const newBankBalance = (room.config.bankBalance ?? 0) + bankDelta;
        const newConfig = { ...room.config, bankBalance: newBankBalance };
        saveRoomConfig(roomId, newConfig);
        addLog(room.id, {
          type: reqBody.type,
          text: `银行${reqBody.type === 'bank-add' ? '发给' : '扣除'} ${player.name} ¥${amount}`,
          note
        });
      } else if (reqBody.type === 'pay-fine') {
        if (identity.role !== 'player') return send(res, 403, { ok: false, error: 'forbidden' });
        const player = room.players.find(p => p.id === identity.player.id);
        if (!player) return send(res, 404, { ok: false, error: 'player_not_found' });
        if (wouldMakeBalanceNegative(player, -amount)) return send(res, 400, { ok: false, error: 'insufficient_balance' });
        player.balance -= amount;
        persistPlayer(player);
        // 玩家向银行缴款，bankBalance 增加
        const newBankBalance = (room.config.bankBalance ?? 0) + amount;
        const newConfig = { ...room.config, bankBalance: newBankBalance };
        saveRoomConfig(roomId, newConfig);
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
        if (wouldMakeBalanceNegative(from, -amount)) return send(res, 400, { ok: false, error: 'insufficient_balance' });
        from.balance -= amount;
        to.balance += amount;
        const updateTwo = db.transaction(() => {
          persistPlayer(from);
          persistPlayer(to);
        });
        updateTwo();
        addLog(room.id, { type: 'transfer', text: `${from.name} 向 ${to.name} 转账 ¥${amount}`, note });
      } else if (reqBody.type === 'buy-property') {
        if (identity.role !== 'player') return send(res, 403, { ok: false, error: 'forbidden' });
        const player = room.players.find(p => p.id === identity.player.id);
        if (!player) return send(res, 404, { ok: false, error: 'player_not_found' });
        if (wouldMakeBalanceNegative(player, -amount)) return send(res, 400, { ok: false, error: 'insufficient_balance' });
        player.balance -= amount;
        persistPlayer(player);
        // 更新银行资金
        const newBankBalance = (room.config.bankBalance ?? 0) + amount;
        const newConfig = { ...room.config, bankBalance: newBankBalance };
        saveRoomConfig(roomId, newConfig);
        // 存储玩家资产
        const propertyId = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const property = reqBody.property || {};
        const propertyName = String(property.name || '').trim();
        const cardFields = normalizePropertyCardFields(property, amount);
        if (cardFields.ruleKind === 'count_tier' && !cardFields.ruleData.rentsByOwned.length) {
          return send(res, 400, { ok: false, error: 'invalid_special_rule' });
        }
        if (cardFields.ruleKind === 'pair_bonus' && !(cardFields.ruleData.pairRent > 0)) {
          return send(res, 400, { ok: false, error: 'invalid_special_rule' });
        }
        if (cardFields.ruleKind === 'dice_multiplier' && !cardFields.ruleData.multipliersByOwned.length) {
          return send(res, 400, { ok: false, error: 'invalid_special_rule' });
        }
        const propertyPrice = cardFields.price;
        const propertyBuildUnitCost = cardFields.ruleKind === 'buildable' && Number.isFinite(Number(property.buildUnitCost))
          ? Math.max(0, Math.floor(Number(property.buildUnitCost)))
          : 0;
        const propertyRents = Array.isArray(property.rents)
          ? Array.from({ length: 6 }, (_, i) => {
              const value = Math.floor(Number(property.rents[i] ?? 0));
              return Number.isFinite(value) && value >= 0 ? value : 0;
            })
          : Array(6).fill(0);
        stmts.insertProperty.run(
          propertyId,
          player.id,
          room.id,
          propertyName,
          propertyPrice,
          JSON.stringify(propertyRents),
          cardFields.cardType,
          cardFields.groupKey,
          cardFields.ruleKind,
          JSON.stringify(cardFields.ruleData),
          propertyBuildUnitCost,
          Date.now()
        );
        addLog(room.id, {
          type: 'bank-sub',
          text: `${player.name} 购买地产「${propertyName}」¥${amount}`,
          note
        });
      } else if (reqBody.type === 'build-property') {
        if (identity.role !== 'player') return send(res, 403, { ok: false, error: 'forbidden' });
        const player = room.players.find(p => p.id === identity.player.id);
        if (!player) return send(res, 404, { ok: false, error: 'player_not_found' });
        const prop = room.properties.find(p => p.id === reqBody.propertyId);
        if (!prop) return send(res, 404, { ok: false, error: 'property_not_found' });
        if (prop.player_id !== player.id) return send(res, 403, { ok: false, error: 'forbidden' });
        if ((prop.rule_kind || 'buildable') !== 'buildable') return send(res, 400, { ok: false, error: 'property_not_buildable' });

        const buildCount = Math.floor(Number(reqBody.buildCount || 0));
        if (!(buildCount > 0)) return send(res, 400, { ok: false, error: 'invalid_build_count' });
        const currentBuildCount = Number(prop.build_count || 0);
        if (currentBuildCount + buildCount > 5) return send(res, 400, { ok: false, error: 'build_limit_exceeded' });
        if (wouldMakeBalanceNegative(player, -amount)) return send(res, 400, { ok: false, error: 'insufficient_balance' });

        player.balance -= amount;
        persistPlayer(player);

        const newBankBalance = (room.config.bankBalance ?? 0) + amount;
        const newConfig = { ...room.config, bankBalance: newBankBalance };
        saveRoomConfig(roomId, newConfig);

        const nextBuildCount = currentBuildCount + buildCount;
        const nextBuildCost = Number(prop.build_cost || 0) + amount;
        stmts.updatePropertyBuild.run(nextBuildCount, nextBuildCost, prop.id);

        addLog(room.id, {
          type: 'bank-sub',
          text: `${player.name} 为「${prop.name}」建造 ${buildCount} 栋，支付 ¥${amount}`,
          note
        });
      } else if (reqBody.type === 'sell-building') {
        // 出售房产（逐级卖回给银行，按原价退还）
        // reqBody: { propertyId, sellCount }
        if (identity.role !== 'player') return send(res, 403, { ok: false, error: 'forbidden' });
        const player = room.players.find(p => p.id === identity.player.id);
        if (!player) return send(res, 404, { ok: false, error: 'player_not_found' });
        const prop = room.properties.find(p => p.id === reqBody.propertyId);
        if (!prop) return send(res, 404, { ok: false, error: 'property_not_found' });
        if (prop.player_id !== player.id) return send(res, 403, { ok: false, error: 'forbidden' });
        if ((prop.rule_kind || 'buildable') !== 'buildable') return send(res, 400, { ok: false, error: 'property_not_buildable' });

        const currentBuildCount = Number(prop.build_count || 0);
        if (currentBuildCount <= 0) return send(res, 400, { ok: false, error: 'no_buildings_to_sell' });

        const sellCount = Math.floor(Number(reqBody.sellCount || 0));
        if (!(sellCount > 0)) return send(res, 400, { ok: false, error: 'invalid_sell_count' });
        if (sellCount > currentBuildCount) return send(res, 400, { ok: false, error: 'sell_count_exceeds_build' });

        // 每级价格 = 盖房总花费 / 已建栋数（原价退还）
        const currentBuildCost = Number(prop.build_cost || 0);
        const unitCost = currentBuildCount > 0 ? Math.floor(currentBuildCost / currentBuildCount) : 0;
        const refundAmount = unitCost * sellCount;

        const nextBuildCount = currentBuildCount - sellCount;
        const nextBuildCost = currentBuildCost - refundAmount;

        player.balance += refundAmount;
        persistPlayer(player);

        const newBankBalance = (room.config.bankBalance ?? 0) - refundAmount;
        const newConfig = { ...room.config, bankBalance: newBankBalance };
        saveRoomConfig(roomId, newConfig);

        stmts.updatePropertyBuild.run(nextBuildCount, nextBuildCost, prop.id);

        addLog(room.id, {
          type: 'bank-add',
          text: `${player.name} 出售「${prop.name}」${sellCount} 栋房产给银行，获得 ¥${refundAmount}`,
          note
        });
      } else if (reqBody.type === 'update-property') {
        if (identity.role !== 'player') return send(res, 403, { ok: false, error: 'forbidden' });
        const player = room.players.find(p => p.id === identity.player.id);
        if (!player) return send(res, 404, { ok: false, error: 'player_not_found' });
        const prop = room.properties.find(p => p.id === reqBody.propertyId);
        if (!prop) return send(res, 404, { ok: false, error: 'property_not_found' });
        if (prop.player_id !== player.id) return send(res, 403, { ok: false, error: 'forbidden' });

        const name = String(reqBody.name || '').trim();
        const price = Math.floor(Number(reqBody.price));
        const cardFields = normalizePropertyCardFields(reqBody, price);
        const buildUnitCost = cardFields.ruleKind === 'buildable' ? Math.floor(Number(reqBody.buildUnitCost)) : 0;
        const buildCost = cardFields.ruleKind === 'buildable' ? Math.floor(Number(reqBody.buildCost)) : 0;
        const rentsRaw = Array.isArray(reqBody.rents) ? reqBody.rents : [];
        const rents = cardFields.ruleKind === 'buildable'
          ? rentsRaw.map(v => Math.floor(Number(v)))
          : Array(6).fill(0);

        if (!name) {
          return send(res, 400, { ok: false, error: 'invalid_property_name' });
        }
        if (price < 0 || buildUnitCost < 0 || buildCost < 0 || !Number.isFinite(price) || !Number.isFinite(buildUnitCost) || !Number.isFinite(buildCost)) {
          return send(res, 400, { ok: false, error: 'invalid_property_amount' });
        }
        if (rents.length !== 6 || rents.some(v => v < 0 || !Number.isFinite(v))) {
          return send(res, 400, { ok: false, error: 'invalid_property_rents' });
        }
        if (cardFields.ruleKind === 'count_tier' && !cardFields.ruleData.rentsByOwned.length) {
          return send(res, 400, { ok: false, error: 'invalid_special_rule' });
        }
        if (cardFields.ruleKind === 'pair_bonus' && !(cardFields.ruleData.pairRent > 0)) {
          return send(res, 400, { ok: false, error: 'invalid_special_rule' });
        }
        if (cardFields.ruleKind === 'dice_multiplier' && !cardFields.ruleData.multipliersByOwned.length) {
          return send(res, 400, { ok: false, error: 'invalid_special_rule' });
        }

        stmts.updatePropertyDetails.run(
          name,
          price,
          buildUnitCost,
          buildCost,
          JSON.stringify(rents),
          cardFields.cardType,
          cardFields.groupKey,
          cardFields.ruleKind,
          JSON.stringify(cardFields.ruleData),
          prop.id
        );
        addLog(room.id, {
          type: 'transfer',
          text: `${player.name} 修改了「${prop.name}」的地产信息`,
          note: `更新名称、购入价、每层加盖费用、累计盖房金额和过路费${name !== prop.name ? `（新名称：${name}）` : ''}`
        });
      } else if (reqBody.type === 'sell-property') {
        // 出售地产给玩家或银行
        // reqBody: { propertyId, toPlayerId? (null=银行), amount }
        if (identity.role !== 'player') return send(res, 403, { ok: false, error: 'forbidden' });
        const seller = room.players.find(p => p.id === identity.player.id);
        if (!seller) return send(res, 404, { ok: false, error: 'player_not_found' });
        const prop = room.properties.find(p => p.id === reqBody.propertyId);
        if (!prop) return send(res, 404, { ok: false, error: 'property_not_found' });
        if (prop.player_id !== seller.id) return send(res, 403, { ok: false, error: 'forbidden' });

        if (reqBody.toPlayerId) {
          // 出售给玩家：先创建待确认请求，由买家接受后才真正成交
          const buyer = room.players.find(p => p.id === reqBody.toPlayerId);
          if (!buyer) return send(res, 404, { ok: false, error: 'buyer_not_found' });
          if (buyer.id === seller.id) return send(res, 400, { ok: false, error: 'same_player' });
          const pendingSales = pendingPropertySales(room.config);
          const hasPendingForProperty = pendingSales.some(sale => sale.propertyId === prop.id);
          if (hasPendingForProperty) return send(res, 400, { ok: false, error: 'property_sale_pending' });
          const saleRequest = {
            id: `sale_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            propertyId: prop.id,
            propertyName: prop.name,
            sellerId: seller.id,
            buyerId: buyer.id,
            amount,
            note,
            createdAt: Date.now()
          };
          saveRoomConfig(roomId, {
            ...room.config,
            pendingPropertySales: [...pendingSales, saleRequest]
          });
          addLog(room.id, {
            type: 'transfer',
            text: `${seller.name} 向 ${buyer.name} 发起「${prop.name}」出售请求，报价 ¥${amount}`,
            note: note || '等待买家确认'
          });
        } else {
          // 出售给银行：卖家收钱，银行资金减少
          db.prepare('DELETE FROM properties WHERE id = ?').run(prop.id);
          seller.balance += amount;
          persistPlayer(seller);
          const newBankBalance2 = (room.config.bankBalance ?? 0) - amount;
          const newConfig2 = { ...room.config, bankBalance: newBankBalance2 };
          saveRoomConfig(roomId, newConfig2);
          addLog(room.id, {
            type: 'bank-add',
            text: `${seller.name} 将「${prop.name}」以 ¥${amount} 出售给银行`,
            note
          });
        }
      } else if (reqBody.type === 'respond-property-sale') {
        if (identity.role !== 'player') return send(res, 403, { ok: false, error: 'forbidden' });
        const buyer = room.players.find(p => p.id === identity.player.id);
        if (!buyer) return send(res, 404, { ok: false, error: 'player_not_found' });
        const pendingSales = pendingPropertySales(room.config);
        const sale = pendingSales.find(item => item.id === reqBody.saleId);
        if (!sale) return send(res, 404, { ok: false, error: 'property_sale_not_found' });
        if (sale.buyerId !== buyer.id) return send(res, 403, { ok: false, error: 'forbidden' });

        const seller = room.players.find(p => p.id === sale.sellerId);
        if (!seller) return send(res, 404, { ok: false, error: 'seller_not_found' });
        const prop = room.properties.find(p => p.id === sale.propertyId);
        if (!prop) return send(res, 404, { ok: false, error: 'property_not_found' });
        if (prop.player_id !== seller.id) return send(res, 400, { ok: false, error: 'property_owner_changed' });

        const remainingSales = pendingSales.filter(item => item.id !== sale.id);
        if (reqBody.accept) {
          if (wouldMakeBalanceNegative(buyer, -sale.amount)) return send(res, 400, { ok: false, error: 'insufficient_balance' });
          seller.balance += sale.amount;
          buyer.balance -= sale.amount;
          const applySale = db.transaction(() => {
            persistPlayer(seller);
            persistPlayer(buyer);
            stmts.updatePropertyOwner.run(buyer.id, prop.id);
          });
          applySale();
          saveRoomConfig(roomId, {
            ...room.config,
            pendingPropertySales: remainingSales
          });
          addLog(room.id, {
            type: 'transfer',
            text: `${buyer.name} 接受了「${prop.name}」交易，${seller.name} 以 ¥${sale.amount} 售出`,
            note: sale.note || '买家已确认'
          });
        } else {
          saveRoomConfig(roomId, {
            ...room.config,
            pendingPropertySales: remainingSales
          });
          addLog(room.id, {
            type: 'transfer',
            text: `${buyer.name} 拒绝了 ${seller.name} 的「${sale.propertyName}」交易请求`,
            note: sale.note || '买家已拒绝'
          });
        }
      } else if (reqBody.type === 'mortgage') {
        // 抵押地产：玩家获得购入价一半，银行扣款，mortgaged=1
        if (identity.role !== 'player') return send(res, 403, { ok: false, error: 'forbidden' });
        const mortgager = room.players.find(p => p.id === identity.player.id);
        if (!mortgager) return send(res, 404, { ok: false, error: 'player_not_found' });
        const mortgageProp = room.properties.find(p => p.id === reqBody.propertyId);
        if (!mortgageProp) return send(res, 404, { ok: false, error: 'property_not_found' });
        if (mortgageProp.player_id !== mortgager.id) return send(res, 403, { ok: false, error: 'forbidden' });
        if (mortgageProp.mortgaged) return send(res, 400, { ok: false, error: 'already_mortgaged' });
        const mortgageAmount = Math.floor(mortgageProp.price / 2);
        mortgager.balance += mortgageAmount;
        persistPlayer(mortgager);
        const newBankBalanceMortgage = (room.config.bankBalance ?? 0) - mortgageAmount;
        const newConfigMortgage = { ...room.config, bankBalance: newBankBalanceMortgage };
        saveRoomConfig(roomId, newConfigMortgage);
        stmts.updatePropertyMortgaged.run(1, mortgageProp.id);
        addLog(room.id, {
          type: 'bank-add',
          text: `${mortgager.name} 抵押「${mortgageProp.name}」，获得 ¥${mortgageAmount}`,
          note: '地产抵押'
        });
      } else if (reqBody.type === 'redeem') {
        // 赎回地产：玩家支付本金+10%利息，银行收款，mortgaged=0
        if (identity.role !== 'player') return send(res, 403, { ok: false, error: 'forbidden' });
        const redeemer = room.players.find(p => p.id === identity.player.id);
        if (!redeemer) return send(res, 404, { ok: false, error: 'player_not_found' });
        const redeemProp = room.properties.find(p => p.id === reqBody.propertyId);
        if (!redeemProp) return send(res, 404, { ok: false, error: 'property_not_found' });
        if (redeemProp.player_id !== redeemer.id) return send(res, 403, { ok: false, error: 'forbidden' });
        if (!redeemProp.mortgaged) return send(res, 400, { ok: false, error: 'not_mortgaged' });
        const principal = Math.floor(redeemProp.price / 2);
        const interest = Math.floor(principal * 0.1);
        const redeemAmount = principal + interest;
        if (wouldMakeBalanceNegative(redeemer, -redeemAmount)) return send(res, 400, { ok: false, error: 'insufficient_balance' });
        redeemer.balance -= redeemAmount;
        persistPlayer(redeemer);
        const newBankBalanceRedeem = (room.config.bankBalance ?? 0) + redeemAmount;
        const newConfigRedeem = { ...room.config, bankBalance: newBankBalanceRedeem };
        saveRoomConfig(roomId, newConfigRedeem);
        stmts.updatePropertyMortgaged.run(0, redeemProp.id);
        addLog(room.id, {
          type: 'bank-sub',
          text: `${redeemer.name} 赎回「${redeemProp.name}」，支付 ¥${redeemAmount}（含利息 ¥${interest}）`,
          note: '地产赎回'
        });
      } else if (reqBody.type === 'buy-lottery') {
        if (identity.role !== 'player') return send(res, 403, { ok: false, error: 'forbidden' });
        const player = room.players.find(p => p.id === identity.player.id);
        if (!player) return send(res, 404, { ok: false, error: 'player_not_found' });

        const lottery = getLotteryConfig(room.config, room.createdAt);
        const ticketPrice = Number(lottery.ticketPrice || 200);
        const numberCount = Number(lottery.numberCount || 30);
        const chosenNumber = Math.floor(Number(reqBody.number));
        const now = Date.now();
        const lastPurchaseAt = Number(lottery.lastPurchaseAtByPlayer[player.id] || 0);

        if (lottery.enabled === false) {
          return send(res, 400, { ok: false, error: 'lottery_disabled' });
        }
        if (!(chosenNumber >= 1 && chosenNumber <= numberCount)) {
          return send(res, 400, { ok: false, error: 'invalid_lottery_number' });
        }
        if (lottery.tickets.some(ticket => ticket.number === chosenNumber)) {
          return send(res, 400, { ok: false, error: 'lottery_number_taken' });
        }
        if (now - lastPurchaseAt < lottery.buyCooldownMs) {
          return send(res, 400, {
            ok: false,
            error: 'lottery_buy_cooldown',
            waitMs: lottery.buyCooldownMs - (now - lastPurchaseAt)
          });
        }
        if (wouldMakeBalanceNegative(player, -ticketPrice)) {
          return send(res, 400, { ok: false, error: 'insufficient_balance' });
        }

        player.balance -= ticketPrice;
        persistPlayer(player);

        const nextJackpotPool = Number(lottery.jackpotPool || 0) + ticketPrice;
        saveRoomConfig(roomId, {
          ...room.config,
          lottery: {
            ...lottery,
            jackpotPool: nextJackpotPool,
            tickets: [...lottery.tickets, { playerId: player.id, number: chosenNumber, boughtAt: now }],
            lastPurchaseAtByPlayer: {
              ...lottery.lastPurchaseAtByPlayer,
              [player.id]: now
            }
          }
        });
        addLog(room.id, {
          type: 'system',
          text: `${player.name} 购买了 ${chosenNumber} 号彩票，支付 ¥${ticketPrice}`,
          note: `本期奖池 ¥${nextJackpotPool}`
        });
      } else {
        return send(res, 400, { ok: false, error: 'invalid_type' });
      }

      const updated = publicRoom(getRoom(roomId));
      broadcastRoom(roomId, { type: 'room_update', room: updated });
      return send(res, 200, { ok: true, room: updated });
    }

    // ── 存款：存入 ──────────────────────────────────────────────────────────────
    // POST /api/rooms/:id/deposit  { token, amount }
    if (req.method === 'POST' && parts[3] === 'deposit') {
      if (identity.role !== 'player') return send(res, 403, { ok: false, error: 'forbidden' });
      const player = room.players.find(p => p.id === identity.player.id);
      if (!player) return send(res, 404, { ok: false, error: 'player_not_found' });
      const depositAmount = Math.floor(Number(reqBody.amount));
      if (!(depositAmount > 0)) return send(res, 400, { ok: false, error: 'invalid_amount' });
      if (player.balance < depositAmount) return send(res, 400, { ok: false, error: 'insufficient_balance' });

      // 玩家余额扣减，银行资金增加
      player.balance -= depositAmount;
      persistPlayer(player);
      const newBankBalanceDep = (room.config.bankBalance ?? 0) + depositAmount;
      const newConfigDep = { ...room.config, bankBalance: newBankBalanceDep };
      db.prepare('UPDATE rooms SET config = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(newConfigDep), Date.now(), roomId);

      const activeAccount = ensureMergedDepositAccount(roomId, player.id);
      const nextAccount = applyDeposit(activeAccount || {}, depositAmount);
      if (activeAccount) {
        updateDepositAccountRow(activeAccount.id, nextAccount);
      } else {
        const depositId = `dep_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        stmts.insertDeposit.run(
          depositId,
          player.id,
          roomId,
          nextAccount.amount,
          nextAccount.principal_amount,
          nextAccount.interest_earned,
          Date.now(),
          'active'
        );
      }

      addLog(roomId, {
        type: 'deposit',
        text: `${player.name} 存入 ¥${depositAmount}，存款账户余额 ¥${nextAccount.amount}（利率 ${room.config.interestRate ?? 1.5}%）`,
        note: `累计利息 ¥${nextAccount.interest_earned}`
      });

      // 存款后检查是否需要自动调整利率
      autoAdjustInterestRate(roomId, newBankBalanceDep);

      const updated = publicRoom(getRoom(roomId));
      broadcastRoom(roomId, { type: 'room_update', room: updated });
      return send(res, 200, { ok: true, room: updated });
    }

    // ── 存款：取出 ──────────────────────────────────────────────────────────────
    // POST /api/rooms/:id/withdraw  { token, amount }
    if (req.method === 'POST' && parts[3] === 'withdraw') {
      if (identity.role !== 'player') return send(res, 403, { ok: false, error: 'forbidden' });
      const player = room.players.find(p => p.id === identity.player.id);
      if (!player) return send(res, 404, { ok: false, error: 'player_not_found' });
      const deposit = ensureMergedDepositAccount(roomId, player.id);
      if (!deposit) return send(res, 404, { ok: false, error: 'deposit_not_found' });

      const requestedAmount = reqBody.amount == null ? deposit.amount : Math.floor(Number(reqBody.amount));
      let withdrawal;
      try {
        withdrawal = applyWithdrawal(deposit, requestedAmount);
      } catch (e) {
        if (e.message === 'insufficient_deposit') return send(res, 400, { ok: false, error: 'insufficient_deposit' });
        return send(res, 400, { ok: false, error: 'invalid_amount' });
      }

      // 银行资金减少，玩家余额增加
      const newBankBalanceWd = (room.config.bankBalance ?? 0) - withdrawal.withdrawn;
      const newConfigWd = { ...room.config, bankBalance: newBankBalanceWd };
      db.prepare('UPDATE rooms SET config = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(newConfigWd), Date.now(), roomId);
      player.balance += withdrawal.withdrawn;
      persistPlayer(player);
      if (withdrawal.closed) {
        stmts.updateDepositStatus.run('withdrawn', deposit.id);
      } else {
        updateDepositAccountRow(deposit.id, withdrawal);
      }

      addLog(roomId, {
        type: 'withdraw',
        text: `${player.name} 取出存款 ¥${withdrawal.withdrawn}，剩余存款 ¥${withdrawal.amount}`,
        note: `累计利息 ¥${withdrawal.interest_earned}`
      });

      // 取款后检查利率
      autoAdjustInterestRate(roomId, newBankBalanceWd);

      const updated = publicRoom(getRoom(roomId));
      broadcastRoom(roomId, { type: 'room_update', room: updated });
      return send(res, 200, { ok: true, room: updated });
    }

    // ── 贷款：申请（固定利率） ──────────────────────────────────────────────────
    // POST /api/rooms/:id/loan  { token, amount }
    if (req.method === 'POST' && parts[3] === 'loan') {
      if (identity.role !== 'player') return send(res, 403, { ok: false, error: 'forbidden' });
      const player = room.players.find(p => p.id === identity.player.id);
      if (!player) return send(res, 404, { ok: false, error: 'player_not_found' });
      const loanAmount = Math.floor(Number(reqBody.amount));
      if (!(loanAmount > 0)) return send(res, 400, { ok: false, error: 'invalid_amount' });

      // 计算玩家总资产，贷款上限 = 总资产 / 2
      const propertyValue = (room.properties || [])
        .filter(p => p.player_id === player.id)
        .reduce((s, p) => s + propertyAssetValue(p), 0);
      const depositTotal = (room.deposits || [])
        .filter(d => d.player_id === player.id && d.status === 'active')
        .reduce((s, d) => s + Number(d.amount || 0), 0);
      const loanTotal = (room.loans || [])
        .filter(l => l.player_id === player.id && l.status === 'active')
        .reduce((s, l) => s + Number(l.remaining || 0), 0);
      const totalAssets = player.balance + propertyValue + depositTotal - loanTotal;
      const maxLoan = Math.floor(totalAssets / 2);

      // 还需加上已有未还贷款
      const existingLoans = (room.loans || []).filter(l => l.player_id === player.id);
      const existingDebt = existingLoans.reduce((s, l) => s + l.remaining, 0);
      const availableCredit = Math.max(0, maxLoan - existingDebt);

      if (loanAmount > availableCredit) {
        return send(res, 400, { ok: false, error: 'exceeds_credit_limit', maxLoan, availableCredit });
      }

      const loanRate = calcLoanRate(room);

      // 银行发钱给玩家，银行资金减少
      player.balance += loanAmount;
      persistPlayer(player);
      const newBankBalanceLoan = (room.config.bankBalance ?? 0) - loanAmount;
      const newConfigLoan = { ...room.config, bankBalance: newBankBalanceLoan };
      db.prepare('UPDATE rooms SET config = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(newConfigLoan), Date.now(), roomId);

      // 创建贷款记录
      const loanId = `loan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      stmts.insertLoan.run(loanId, player.id, roomId, loanAmount, loanAmount, loanRate, Date.now(), 'active', '');

      addLog(roomId, {
        type: 'loan',
        text: `${player.name} 贷款 ¥${loanAmount}，固定利率 ${loanRate}%`,
        note: '贷款'
      });

      const updated = publicRoom(getRoom(roomId));
      broadcastRoom(roomId, { type: 'room_update', room: updated });
      return send(res, 200, { ok: true, room: updated, loanRate });
    }

    // ── 贷款：还款 ──────────────────────────────────────────────────────────────
    // POST /api/rooms/:id/repay  { token, loanId, amount }
    if (req.method === 'POST' && parts[3] === 'repay') {
      if (identity.role !== 'player') return send(res, 403, { ok: false, error: 'forbidden' });
      const player = room.players.find(p => p.id === identity.player.id);
      if (!player) return send(res, 404, { ok: false, error: 'player_not_found' });
      const loan = (room.loans || []).find(l => l.id === reqBody.loanId && l.player_id === player.id);
      if (!loan) return send(res, 404, { ok: false, error: 'loan_not_found' });
      const repayAmount = Math.min(Math.floor(Number(reqBody.amount)), loan.remaining);
      if (!(repayAmount > 0)) return send(res, 400, { ok: false, error: 'invalid_amount' });
      if (player.balance < repayAmount) return send(res, 400, { ok: false, error: 'insufficient_balance' });

      player.balance -= repayAmount;
      persistPlayer(player);
      const newRemaining = loan.remaining - repayAmount;
      const newBankBalanceRepay = (room.config.bankBalance ?? 0) + repayAmount;
      const newConfigRepay = { ...room.config, bankBalance: newBankBalanceRepay };
      db.prepare('UPDATE rooms SET config = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(newConfigRepay), Date.now(), roomId);

      if (newRemaining <= 0) {
        stmts.updateLoanStatus.run('repaid', loan.id);
        addLog(roomId, {
          type: 'repay',
          text: `${player.name} 还清贷款 ¥${loan.principal}，本次还款 ¥${repayAmount}`,
          note: '还款'
        });
      } else {
        stmts.updateLoanRemaining.run(newRemaining, loan.id);
        addLog(roomId, {
          type: 'repay',
          text: `${player.name} 还款 ¥${repayAmount}，剩余债务 ¥${newRemaining}`,
          note: '还款'
        });
      }

      // 还款后检查利率
      autoAdjustInterestRate(roomId, newBankBalanceRepay);

      const updated = publicRoom(getRoom(roomId));
      broadcastRoom(roomId, { type: 'room_update', room: updated });
      return send(res, 200, { ok: true, room: updated });
    }

    if (req.method === 'POST' && parts[3] === 'update-config') {
      if (identity.role !== 'banker') return send(res, 403, { ok: false, error: 'forbidden' });
      const newGoSalary = Number(reqBody.goSalary);
      if (!(newGoSalary >= 0)) return send(res, 400, { ok: false, error: 'invalid_amount' });
      let newConfig = { ...room.config, goSalary: newGoSalary };
      // 支持同时更新利率和利息周期
      if (reqBody.interestRate !== undefined) {
        const rate = Number(reqBody.interestRate);
        if (rate >= 0 && rate <= 100) newConfig.interestRate = rate;
      }
      if (reqBody.interestIntervalMin !== undefined) {
        const intervalMin = Number(reqBody.interestIntervalMin);
        if (intervalMin >= 1) newConfig.interestIntervalMin = intervalMin;
      }
      db.prepare('UPDATE rooms SET config = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(newConfig), Date.now(), roomId);
      addLog(room.id, { type: 'system', text: `过起点奖励金额更新为 ¥${newGoSalary}`, note: '庄家设置' });
      const updated = publicRoom(getRoom(roomId));
      broadcastRoom(roomId, { type: 'room_update', room: updated });
      return send(res, 200, { ok: true, room: updated });
    }

    if (req.method === 'POST' && parts[3] === 'update-interest') {
      if (identity.role !== 'banker') return send(res, 403, { ok: false, error: 'forbidden' });
      const rate = Number(reqBody.interestRate);
      const intervalMin = Number(reqBody.interestIntervalMin);
      if (!(rate >= 0 && rate <= 100)) return send(res, 400, { ok: false, error: 'invalid_rate' });
      if (!(intervalMin >= 1)) return send(res, 400, { ok: false, error: 'invalid_interval' });
      const newConfig = { ...room.config, interestRate: rate, interestIntervalMin: intervalMin, lastInterestAt: Date.now() };
      db.prepare('UPDATE rooms SET config = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(newConfig), Date.now(), roomId);
      addLog(room.id, { type: 'system', text: `利息设置更新：利率 ${rate}%，每 ${intervalMin} 分钟结算`, note: '庄家设置' });
      const updated = publicRoom(getRoom(roomId));
      broadcastRoom(roomId, { type: 'room_update', room: updated });
      return send(res, 200, { ok: true, room: updated });
    }

    if (req.method === 'POST' && parts[3] === 'reset') {
      if (identity.role !== 'banker') return send(res, 403, { ok: false, error: 'forbidden' });
      const resetAll = db.transaction(() => {
        for (let i = 0; i < room.players.length; i++) {
          const p = room.players[i];
          p.name = `玩家${i + 1}`;
          p.balance = room.config.startingMoney;
          p.avatar_id = (i % AVATAR_COUNT) + 1;
          persistPlayer(p);
        }
        // 重置银行资金为 0，重置利息计时，清空存款贷款
        const now = Date.now();
        const prevLottery = getLotteryConfig(room.config, room.createdAt);
        const newConfig = {
          ...room.config,
          bankBalance: 0,
          lastInterestAt: now,
          lottery: defaultLotteryConfig(now, {
            enabled: prevLottery.enabled !== false,
            ticketPrice: Number(prevLottery.ticketPrice ?? 200)
          })
        };
        db.prepare('UPDATE rooms SET config = ? WHERE id = ?').run(JSON.stringify(newConfig), roomId);
        db.prepare('DELETE FROM deposits WHERE room_id = ?').run(roomId);
        db.prepare('DELETE FROM loans WHERE room_id = ?').run(roomId);
      });
      resetAll();
      addLog(room.id, { type: 'system', text: `房间 ${room.id} 已重置为开局状态`, note: '系统重置' });
      const updated = publicRoom(getRoom(roomId));
      broadcastRoom(roomId, { type: 'room_update', room: updated });
      return send(res, 200, { ok: true, room: updated });
    }

    if (req.method === 'POST' && parts[3] === 'pause') {
      if (identity.role !== 'banker') return send(res, 403, { ok: false, error: 'forbidden' });
      const now = Date.now();
      // 记录暂停时间戳到 config，用于恢复时修正利息计时
      const newConfig = { ...room.config, pausedAt: now };
      db.prepare('UPDATE rooms SET status = ?, config = ?, updated_at = ? WHERE id = ?')
        .run('paused', JSON.stringify(newConfig), now, roomId);
      addLog(room.id, { type: 'system', text: `游戏已暂停`, note: '庄家暂停' });
      // 广播暂停消息，客户端保持连接但显示暂停覆盖层
      const updated = publicRoom(getRoom(roomId));
      broadcastRoom(roomId, { type: 'room_paused', room: updated });
      return send(res, 200, { ok: true });
    }

    if (req.method === 'POST' && parts[3] === 'end-game') {
      if (identity.role !== 'banker') return send(res, 403, { ok: false, error: 'forbidden' });
      db.prepare('UPDATE rooms SET status = ?, updated_at = ? WHERE id = ?').run('ended', Date.now(), roomId);
      addLog(room.id, { type: 'system', text: `游戏已结束`, note: '庄家结束' });
      broadcastRoom(roomId, { type: 'room_ended' });
      const clients = roomClients.get(roomId);
      if (clients) {
        for (const client of [...clients]) {
          client.close(4101, 'room_ended');
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
};

const server = USE_HTTPS
  ? https.createServer({ key: fs.readFileSync(KEY_FILE), cert: fs.readFileSync(CERT_FILE) }, requestHandler)
  : http.createServer(requestHandler);

// ─── WebSocket 服务 ──────────────────────────────────────────────────────────
// 握手 URL: ws(s)://<host>/ws?room=<roomId>&token=<token>

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

  const playerJoined = identity.role === 'player' && markPlayerJoined(roomId, identity.player.id);
  const currentRoom = playerJoined ? getRoom(roomId) : room;
  wsJoinRoom(ws, roomId);

  // 立即推送当前房间状态
  const payload = { type: 'room_update', room: publicRoom(currentRoom) };
  ws.send(JSON.stringify(payload));
  if (playerJoined) broadcastRoom(roomId, payload);

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
  const proto = USE_HTTPS ? 'https' : 'http';
  const wsProto = USE_HTTPS ? 'wss' : 'ws';
  console.log(`Monopoly bank listening on ${proto}://0.0.0.0:${PORT}`);
  console.log(`WebSocket  endpoint  ${wsProto}://0.0.0.0:${PORT}/ws`);
  console.log(`Database: ${DB_FILE}`);
  if (USE_HTTPS) console.log('HTTPS enabled (certs loaded from certs/)');
});

// ─── 定时结算调度器 ──────────────────────────────────────────────────────────
// 每分钟检查所有活跃房间（有 WS 连接的房间），处理利息与彩票开奖

setInterval(() => {
  const now = Date.now();
  for (const [roomId] of roomClients) {
    try {
      const room = getRoom(roomId);
      if (!room) continue;
      // 跳过已暂停的房间，暂停期间不计时
      if ((room.status || 'active') === 'paused') continue;

      const rate = room.config.interestRate ?? 1.5;
      const intervalMin = room.config.interestIntervalMin ?? 10;
      const lastAt = room.config.lastInterestAt ?? room.createdAt;
      const intervalMs = intervalMin * 60 * 1000;
      const interestDue = now - lastAt >= intervalMs;

      const lottery = getLotteryConfig(room.config, room.createdAt);
      const lotteryIntervalMs = Number(lottery.drawIntervalMin || 30) * 60 * 1000;
      const lotteryLastDrawAt = lottery.lastDrawAt ?? room.createdAt;
      const lotteryDue = lottery.enabled !== false && now - lotteryLastDrawAt >= lotteryIntervalMs;

      if (!interestDue && !lotteryDue) continue;

      let bankBalance = room.config.bankBalance ?? 0;
      let hasChanges = false;
      let shouldBroadcast = false;

      if (interestDue) {
        // 1. 银行自身资金利息
        const bankInterest = Math.round(Math.max(0, bankBalance) * (rate / 100));
        if (bankInterest !== 0) {
          bankBalance += bankInterest;
          hasChanges = true;
          addLog(roomId, {
            type: 'system',
            text: `银行资金利息结算 +¥${bankInterest}（利率 ${rate}%）`,
            note: '利息'
          });
        }

        // 2. 存款利息结算：每个玩家的合并存款账户按当前利率增长，银行付出利息给玩家
        const activeDeposits = stmts.getDeposits.all(roomId, 'active');
        for (const dep of activeDeposits) {
          const nextAccount = applyInterest(dep, rate);
          const depInterest = nextAccount.lastInterest;
          if (depInterest <= 0) continue;
          updateDepositAccountRow(dep.id, nextAccount);
          bankBalance -= depInterest;
          hasChanges = true;
          const depPlayer = room.players.find(p => p.id === dep.player_id);
          if (depPlayer) {
            addLog(roomId, {
              type: 'deposit-interest',
              text: `${depPlayer.name} 存款利息 +¥${depInterest}（存款 ¥${dep.amount} → ¥${nextAccount.amount}）`,
              note: `累计利息 ¥${nextAccount.interest_earned}`
            });
          }
        }

        // 3. 贷款利息结算：每笔贷款按各自利率直接从玩家现金扣除，银行收息（增加资金）
        const activeLoans = stmts.getLoans.all(roomId, 'active');
        for (const loan of activeLoans) {
          const loanInterest = Math.round(loan.remaining * (loan.rate / 100));
          if (loanInterest <= 0) continue;
          const loanPlayer = room.players.find(p => p.id === loan.player_id);
          if (loanPlayer) {
            const prevBalance = Number(loanPlayer.balance || 0);
            loanPlayer.balance = prevBalance - loanInterest;
            persistPlayer(loanPlayer);
            bankBalance += loanInterest;
            hasChanges = true;
            addLog(roomId, {
              type: 'loan-interest',
              text: `${loanPlayer.name} 贷款利息 -¥${loanInterest}（现金 ¥${prevBalance} → ¥${loanPlayer.balance}，剩余本金 ¥${loan.remaining}，利率 ${loan.rate}%）`,
              note: '贷款计息'
            });
          }
        }

        saveRoomConfig(roomId, { ...room.config, bankBalance, lastInterestAt: now });
        autoAdjustInterestRate(roomId, bankBalance);
        shouldBroadcast = true;
      }

      if (lotteryDue) {
        const currentRoom = interestDue ? getRoom(roomId) : room;
        settleLotteryDraw(roomId, currentRoom, now);
        hasChanges = true;
        shouldBroadcast = true;
      }

      if (shouldBroadcast) {
        const updated = publicRoom(getRoom(roomId));
        broadcastRoom(roomId, { type: 'room_update', room: updated });
      }
    } catch (e) {
      console.error('[interest] error for room', roomId, e);
    }
  }
}, 60 * 1000); // 每分钟检查一次
