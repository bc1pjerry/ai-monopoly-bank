const path = require('path');

const AVATAR_COUNT = 16;
const AVATAR_DIR = path.join(__dirname, 'assets', 'avatars');

const AVATAR_LABELS = [
  '大富翁绅士',
  '银行家',
  '发明家',
  '探险家',
  '名媛',
  '主厨',
  '侦探',
  '赛车手',
  '魔术师',
  '飞行员',
  '艺术家',
  '建筑师',
  '水手',
  '运动员',
  '科学家',
  '收藏家'
];

function normalizeAvatarId(value, fallback = 1) {
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= AVATAR_COUNT) return numeric;
  const safeFallback = Number(fallback);
  return Number.isInteger(safeFallback) && safeFallback >= 1 && safeFallback <= AVATAR_COUNT ? safeFallback : 1;
}

function avatarPath(avatarId) {
  return `/api/avatar/${normalizeAvatarId(avatarId)}.png`;
}

function getAvatarMeta(avatarId) {
  const normalized = normalizeAvatarId(avatarId);
  return {
    id: normalized,
    label: AVATAR_LABELS[normalized - 1]
  };
}

function avatarFilePath(avatarId) {
  return path.join(AVATAR_DIR, `avatar-${normalizeAvatarId(avatarId)}.png`);
}

module.exports = {
  AVATAR_COUNT,
  AVATAR_DIR,
  avatarPath,
  avatarFilePath,
  getAvatarMeta,
  normalizeAvatarId
};
