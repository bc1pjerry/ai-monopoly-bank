/**
 * useRoomSocket — 封装与服务端的 WebSocket 连接
 *
 * 用法：
 *   const { connect, disconnect } = useRoomSocket({
 *     onUpdate(room) { ... },   // 收到房间数据推送
 *     onError(err)  { ... },    // 连接失败 / 被拒绝
 *     onPaused(room) { ... },   // 收到 room_paused 广播（保持连接）
 *     onResumed(room){ ... },   // 收到 room_resumed 广播
 *     onEnded()     { ... }     // 收到 room_ended 广播
 *   })
 *   connect(roomId, token)
 *   disconnect()
 */

function buildWsUrl(roomId, token) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}/ws?room=${encodeURIComponent(roomId)}&token=${encodeURIComponent(token)}`
}

export function useRoomSocket({ onUpdate, onError, onPaused, onResumed, onEnded } = {}) {
  let ws = null
  let reconnectTimer = null
  let currentRoomId = null
  let currentToken = null
  let destroyed = false

  const RECONNECT_DELAY = 3000   // 断线后 3s 重连
  const MAX_RECONNECTS = 20      // 最多重连次数，防止永久循环
  let reconnectCount = 0

  function connect(roomId, token) {
    currentRoomId = roomId
    currentToken = token
    destroyed = false
    reconnectCount = 0
    _open()
  }

  function disconnect() {
    destroyed = true
    clearTimeout(reconnectTimer)
    if (ws) {
      ws.onclose = null   // 关闭时不触发重连
      ws.close()
      ws = null
    }
  }

  function _open() {
    if (destroyed) return
    if (ws) {
      ws.onclose = null
      ws.close()
      ws = null
    }

    const url = buildWsUrl(currentRoomId, currentToken)
    ws = new WebSocket(url)

    ws.onopen = () => {
      reconnectCount = 0
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'room_update' && typeof onUpdate === 'function') {
          onUpdate(msg.room)
        } else if (msg.type === 'room_paused') {
          // 游戏暂停：保持连接，通知上层显示暂停覆盖层
          if (typeof onPaused === 'function') onPaused(msg.room)
        } else if (msg.type === 'room_resumed') {
          // 游戏恢复：通知上层取消暂停覆盖层
          if (typeof onResumed === 'function') onResumed(msg.room)
        } else if (msg.type === 'room_ended') {
          // 游戏结束：停止重连，通知上层
          destroyed = true
          clearTimeout(reconnectTimer)
          if (typeof onEnded === 'function') onEnded()
        }
      } catch {}
    }

    ws.onclose = (event) => {
      ws = null
      if (destroyed) return

      // 被服务端主动拒绝（4001 / 4003 / 4004）不重连
      // 4101 = room_ended，也不重连
      if (event.code >= 4000 && event.code < 4200) {
        if (event.code === 4101) {
          // room_ended 关闭码，触发 onEnded
          destroyed = true
          if (typeof onEnded === 'function') onEnded()
          return
        }
        if (typeof onError === 'function') onError(event.reason || 'ws_rejected')
        return
      }

      if (reconnectCount >= MAX_RECONNECTS) {
        if (typeof onError === 'function') onError('ws_max_reconnects')
        return
      }

      reconnectCount++
      reconnectTimer = setTimeout(_open, RECONNECT_DELAY)
    }

    ws.onerror = () => {
      // onerror 后必然触发 onclose，由 onclose 处理重连
    }
  }

  return { connect, disconnect }
}
