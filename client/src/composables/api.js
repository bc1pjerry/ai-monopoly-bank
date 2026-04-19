// 共用 API 工具

export function fmt(n) {
  return new Intl.NumberFormat('zh-CN').format(Number(n || 0))
}

export function nowText(ts) {
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

let _lanOrigin = location.origin

const ERROR_MESSAGES = {
  insufficient_balance: '余额不足',
  exceeds_credit_limit: '超出可贷额度',
  property_sale_pending: '这处地产已有待确认报价',
  property_sale_not_found: '交易请求不存在或已处理',
  property_owner_changed: '地产归属已变化，请重新发起交易',
  invalid_lottery_number: '彩票号码必须在 1 到 30 之间',
  lottery_number_taken: '这个号码本期已经被买走了',
  lottery_buy_cooldown: '距离上次购票未满 2 分钟',
  lottery_disabled: '本局未开启彩票系统'
}

export function setLanOrigin(origin) {
  _lanOrigin = origin
}

export function getLanOrigin() {
  return _lanOrigin
}

export function buildLink(roomId, token) {
  return `${_lanOrigin}/?room=${encodeURIComponent(roomId)}&token=${encodeURIComponent(token)}`
}

export function buildMobileLink(roomId, token) {
  return `${_lanOrigin}/?room=${encodeURIComponent(roomId)}&token=${encodeURIComponent(token)}&mode=mobile`
}

export async function apiFetch(path, options = {}) {
  const rawBody = options.body
  const body = rawBody == null
    ? undefined
    : typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody)
  const res = await fetch(path, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body
  })
  const data = await res.json()
  if (!res.ok || data.ok === false) {
    const code = data.error || 'request_failed'
    const error = new Error(ERROR_MESSAGES[code] || code)
    error.code = code
    throw error
  }
  return data
}

export async function apiWithToken(path, token, options = {}) {
  const body = options.body ? { ...options.body, token } : { token }
  return apiFetch(path, { ...options, body })
}
