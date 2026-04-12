// 共用 API 工具

export function fmt(n) {
  return new Intl.NumberFormat('zh-CN').format(Number(n || 0))
}

export function nowText(ts) {
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

let _lanOrigin = location.origin

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
  if (!res.ok || data.ok === false) throw new Error(data.error || 'request_failed')
  return data
}

export async function apiWithToken(path, token, options = {}) {
  const body = options.body ? { ...options.body, token } : { token }
  return apiFetch(path, { ...options, body })
}
