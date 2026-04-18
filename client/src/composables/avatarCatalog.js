export const AVATAR_COUNT = 16

export function normalizeAvatarId(value, fallback = 1) {
  const numeric = Number(value)
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= AVATAR_COUNT) return numeric
  const safeFallback = Number(fallback)
  return Number.isInteger(safeFallback) && safeFallback >= 1 && safeFallback <= AVATAR_COUNT ? safeFallback : 1
}

export function avatarPath(avatarId) {
  return `/api/avatar/${normalizeAvatarId(avatarId)}.png`
}

const avatarLabels = [
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
]

export const avatarOptions = Array.from({ length: AVATAR_COUNT }, (_, index) => {
  const id = index + 1
  return {
    id,
    label: avatarLabels[index],
    src: avatarPath(id)
  }
})
