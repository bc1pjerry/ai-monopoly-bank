<template>
  <div :class="view === 'banker' || view === 'banker-mobile' ? 'wrap-full' : 'wrap'">
    <!-- 建房视图 -->
    <SetupView v-if="view === 'setup'" @created="onRoomCreated" @resume="onRoomResumed" />

    <!-- 庄家 PC Dashboard 视图 -->
    <BankerView
      v-else-if="view === 'banker'"
      :room="room"
      :myToken="myToken"
      @room-updated="onRoomUpdated"
      @share="shareVisible = true"
      @end-game="onEndGame"
    />

    <!-- 庄家手机控制视图 -->
    <BankerMobileView
      v-else-if="view === 'banker-mobile'"
      :room="room"
      :myToken="myToken"
      @room-updated="onRoomUpdated"
      @end-game="onEndGame"
    />

    <!-- 玩家视图 -->
    <PlayerView
      v-else-if="view === 'player'"
      :room="room"
      :myToken="myToken"
      :myPlayerId="myPlayerId"
      @room-updated="onRoomUpdated"
    />

    <!-- 无效链接 -->
    <div v-else-if="view === 'invalid'" style="text-align:center;padding:80px 24px;color:#a7b0cf;">
      <h2>链接无效</h2>
      <p>请使用庄家分发的专属链接进入房间。</p>
    </div>

    <!-- 分享弹窗（庄家） -->
    <ShareModal
      v-if="shareVisible && allTokens"
      :roomId="roomId"
      :bankerToken="allTokens.bankerToken"
      :playerTokens="allTokens.playerTokens"
      @close="shareVisible = false"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import SetupView from './components/SetupView.vue'
import BankerView from './components/BankerView.vue'
import BankerMobileView from './components/BankerMobileView.vue'
import PlayerView from './components/PlayerView.vue'
import ShareModal from './components/ShareModal.vue'
import { setLanOrigin } from './composables/api.js'
import { useRoomSocket } from './composables/useRoomSocket.js'

const params = new URLSearchParams(location.search)
const roomId = ref(params.get('room') || '')
const myToken = ref(params.get('token') || '')
const mobileMode = params.get('mode') === 'mobile'
const view = ref('loading') // 'setup' | 'banker' | 'banker-mobile' | 'player' | 'invalid' | 'loading'
const room = ref(null)
const myPlayerId = ref(null)
const shareVisible = ref(false)
const allTokens = ref(null)

// ─── WebSocket ───────────────────────────────────────────────────────────────

const { connect: wsConnect, disconnect: wsDisconnect } = useRoomSocket({
  onUpdate(updatedRoom) {
    room.value = updatedRoom
  },
  onError(reason) {
    console.warn('[ws] 连接失败：', reason)
    if (reason === 'invalid_token' || reason === 'room_not_found') {
      view.value = 'invalid'
    }
  },
  onPaused(updatedRoom) {
    // 保持当前视图，更新房间数据（status 变为 'paused'），子组件根据 room.status 显示暂停覆盖层
    if (updatedRoom) room.value = updatedRoom
  },
  onResumed(updatedRoom) {
    // 恢复游戏，更新房间数据（status 变回 'active'）
    if (updatedRoom) room.value = updatedRoom
  },
  onEnded() {
    onEndGame()
  }
})

// ─── 初始化进房 ──────────────────────────────────────────────────────────────

async function fetchRoom(silent = false) {
  if (!roomId.value || !myToken.value) return
  try {
    const res = await fetch(`/api/rooms/${roomId.value}?token=${encodeURIComponent(myToken.value)}`)
    const data = await res.json()
    if (!data.ok) {
      if (!silent) alert('无法进入房间：' + data.error)
      view.value = 'invalid'
      return
    }
    room.value = data.room
    myPlayerId.value = data.playerId
    if (data.identity === 'banker') {
      if (data.playerTokens) {
        allTokens.value = { bankerToken: myToken.value, playerTokens: data.playerTokens }
      }
      // 手机模式使用 BankerMobileView
      view.value = mobileMode ? 'banker-mobile' : 'banker'
    } else {
      view.value = 'player'
    }
    wsConnect(roomId.value, myToken.value)
  } catch {
    if (!silent) alert('无法连接到服务器')
  }
}

// ─── 子组件操作后的乐观更新回调 ─────────────────────────────────────────────

function onRoomUpdated(updatedRoom) {
  if (updatedRoom) room.value = updatedRoom
}

// ─── 事件处理 ────────────────────────────────────────────────────────────────

async function onRoomCreated(data) {
  allTokens.value = { bankerToken: data.bankerToken, playerTokens: data.playerTokens }
  roomId.value = data.roomId
  myToken.value = data.bankerToken
  room.value = data.room
  myPlayerId.value = null
  view.value = 'banker'
  history.replaceState({}, '', `/?room=${encodeURIComponent(data.roomId)}&token=${encodeURIComponent(data.bankerToken)}`)
  shareVisible.value = true
  wsConnect(data.roomId, data.bankerToken)
}

async function onRoomResumed(data) {
  // data = { roomId, bankerToken, playerTokens, room } — same shape as onRoomCreated
  allTokens.value = { bankerToken: data.bankerToken, playerTokens: data.playerTokens }
  roomId.value = data.roomId
  myToken.value = data.bankerToken
  room.value = data.room
  myPlayerId.value = null
  view.value = 'banker'
  history.replaceState({}, '', `/?room=${encodeURIComponent(data.roomId)}&token=${encodeURIComponent(data.bankerToken)}`)
  wsConnect(data.roomId, data.bankerToken)
}

function onEndGame() {
  wsDisconnect()
  roomId.value = ''
  myToken.value = ''
  room.value = null
  myPlayerId.value = null
  allTokens.value = null
  shareVisible.value = false
  history.replaceState({}, '', '/')
  view.value = 'setup'
}

onMounted(async () => {
  try {
    const ipData = await fetch('/api/localip').then(r => r.json())
    if (ipData.ok && ipData.ip !== '127.0.0.1') {
      setLanOrigin(`http://${ipData.ip}:${ipData.port}`)
    }
  } catch {}

  if (roomId.value && myToken.value) {
    await fetchRoom()
  } else if (!roomId.value) {
    view.value = 'setup'
  } else {
    view.value = 'invalid'
  }
})

onUnmounted(() => wsDisconnect())
</script>
