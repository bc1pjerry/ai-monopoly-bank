<template>
  <section class="setup">
    <!-- 创建新房间 -->
    <div class="card create-card">
      <div class="badge" style="display:inline-flex; margin-bottom:12px;">10 秒开房 · 扫码进房</div>
      <h2>先快速布置一局</h2>
      <p>输入玩家数量和起始金额，系统会立刻创建房间，并生成各人专属链接。</p>
      <div class="form-grid">
        <div class="field">
          <label>玩家数量</label>
          <input v-model.number="playerCount" type="number" min="2" max="8" />
        </div>
        <div class="field">
          <label>每人起始金额</label>
          <input v-model.number="startingMoney" type="number" min="0" step="1" />
        </div>
        <div class="field">
          <label>过起点奖励金额</label>
          <input v-model.number="goSalary" type="number" min="0" step="1" />
        </div>
        <div class="field">
          <label>彩票系统</label>
          <label class="switch-row">
            <input v-model="lotteryEnabled" type="checkbox" />
            <span class="switch-ui" aria-hidden="true"><span></span></span>
            <span>{{ lotteryEnabled ? '开启' : '关闭' }}</span>
          </label>
        </div>
        <div class="field" v-if="lotteryEnabled">
          <label>彩票单张价格</label>
          <input v-model.number="lotteryTicketPrice" type="number" min="0" step="1" />
        </div>
      </div>
      <button class="primary" style="width:100%;" @click="handleCreate">创建房间</button>
      <p class="muted">创建后会显示庄家链接和每位玩家的专属链接，发给对应的人即可。</p>
    </div>

    <!-- 历史游戏列表 -->
    <div class="card history-card" style="margin-top:18px;" v-if="historyLoaded">
      <h2 style="margin-top:0;">历史游戏</h2>
      <div v-if="historyRooms.length === 0" class="empty">暂无历史游戏记录</div>
      <div v-else class="history-list">
        <div class="history-item" v-for="r in historyRooms" :key="r.id">
          <div class="history-info">
            <div class="history-id">
              房间 {{ r.id }}
              <span v-if="r.status === 'paused'" class="status-badge paused">已暂停</span>
              <span v-else-if="r.status === 'ended'" class="status-badge ended">已结束</span>
              <span v-else class="status-badge active">进行中</span>
            </div>
            <div class="history-meta">
              {{ r.config.playerCount }} 人局 · 起始 ¥{{ fmt(r.config.startingMoney) }} · 过起点 ¥{{ fmt(r.config.goSalary ?? 200) }}
              · 彩票{{ r.config.lottery?.enabled === false ? '关闭' : '开启' }}
              · 最后活动 {{ timeAgo(r.updatedAt) }}
            </div>
          </div>
          <div class="history-actions">
            <button
              v-if="r.status !== 'ended'"
              :class="r.status === 'paused' ? 'resume-btn mini' : 'enter-btn mini'"
              @click="handleResume(r.id)"
            >
              {{ r.status === 'paused' ? '恢复游戏' : '进入游戏' }}
            </button>
            <button
              class="red-btn mini"
              :class="{ 'confirm-delete': confirmDeleteId === r.id }"
              @click="handleDelete(r.id)"
            >
              {{ confirmDeleteId === r.id ? '确认删除？' : '删除' }}
            </button>
            <button v-if="confirmDeleteId === r.id" class="secondary mini" @click="confirmDeleteId = null">
              取消
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { apiFetch, fmt } from '../composables/api.js'

const emit = defineEmits(['created', 'resume'])

const playerCount = ref(4)
const startingMoney = ref(1500)
const goSalary = ref(200)
const lotteryEnabled = ref(true)
const lotteryTicketPrice = ref(200)
const historyRooms = ref([])
const historyLoaded = ref(false)
const confirmDeleteId = ref(null)

async function handleCreate() {
  try {
    const data = await apiFetch('/api/rooms', {
      method: 'POST',
      body: {
        playerCount: playerCount.value,
        startingMoney: startingMoney.value,
        goSalary: goSalary.value,
        lotteryEnabled: lotteryEnabled.value,
        lotteryTicketPrice: lotteryTicketPrice.value
      }
    })
    emit('created', data)
  } catch (e) {
    alert('创建房间失败：' + e.message)
  }
}

async function loadHistory() {
  try {
    const data = await apiFetch('/api/rooms')
    historyRooms.value = data.rooms || []
  } catch {}
  historyLoaded.value = true
}

async function handleDelete(roomId) {
  if (confirmDeleteId.value !== roomId) {
    confirmDeleteId.value = roomId
    return
  }
  try {
    await apiFetch(`/api/rooms/${roomId}`, { method: 'DELETE' })
    historyRooms.value = historyRooms.value.filter(r => r.id !== roomId)
    confirmDeleteId.value = null
  } catch (e) {
    alert('删除失败：' + e.message)
    confirmDeleteId.value = null
  }
}

async function handleResume(roomId) {
  try {
    const data = await apiFetch(`/api/rooms/${roomId}/resume`, {
      method: 'POST',
      body: {}
    })
    // data: { roomId, bankerToken, playerTokens, room }
    emit('resume', data)
  } catch (e) {
    alert('恢复失败：' + e.message)
  }
}

function timeAgo(ts) {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m} 分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  return `${d} 天前`
}

onMounted(loadHistory)
</script>

<style scoped>
.setup { max-width: 720px; margin: 60px auto; }
.create-card h2 { margin-top:0; font-size:30px; }
.history-list { display:flex; flex-direction:column; gap:10px; }
.history-item {
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:12px;
  background:rgba(255,255,255,.05);
  border:1px solid var(--line);
  border-radius:14px;
  padding:12px 14px;
}
.history-info { flex:1; min-width:0; }
.history-id { font-weight:700; font-size:16px; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.history-meta { color:var(--muted); font-size:13px; margin-top:3px; }
.history-actions { display:flex; gap:8px; align-items:center; flex-shrink:0; }
.confirm-delete {
  background: rgba(239,68,68,.45) !important;
  border-color: rgba(239,68,68,.7) !important;
  color: #fff !important;
  font-weight:700;
}
.status-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 20px;
  vertical-align: middle;
}
.status-badge.paused {
  background: rgba(234, 179, 8, 0.2);
  color: #eab308;
  border: 1px solid rgba(234, 179, 8, 0.4);
}
.status-badge.ended {
  background: rgba(107, 114, 128, 0.2);
  color: #9ca3af;
  border: 1px solid rgba(107, 114, 128, 0.4);
}
.status-badge.active {
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
  border: 1px solid rgba(34, 197, 94, 0.35);
}
.resume-btn {
  background: rgba(234, 179, 8, 0.2);
  color: #eab308;
  border: 1px solid rgba(234, 179, 8, 0.5);
  border-radius: 8px;
  padding: 4px 12px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
}
.resume-btn:hover {
  background: rgba(234, 179, 8, 0.35);
}
.enter-btn {
  background: rgba(34, 197, 94, 0.2);
  color: #4ade80;
  border: 1px solid rgba(34, 197, 94, 0.5);
  border-radius: 8px;
  padding: 4px 12px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
}
.enter-btn:hover {
  background: rgba(34, 197, 94, 0.35);
}
.field { display:flex; flex-direction:column; gap:6px; margin-bottom:12px; }
.field label { font-size:13px; color:var(--muted); }
.field input { padding:8px 12px; border-radius:8px; border:1px solid var(--line); background:rgba(255,255,255,.05); color:inherit; font-size:14px; }
.switch-row {
  display: flex;
  flex-direction: row !important;
  align-items: center;
  gap: 10px !important;
  min-height: 36px;
  cursor: pointer;
  color: inherit !important;
}
.switch-row input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.switch-ui {
  width: 46px;
  height: 26px;
  border-radius: 999px;
  background: rgba(148,163,184,.35);
  border: 1px solid var(--line);
  padding: 2px;
  transition: background .16s, border-color .16s;
}
.switch-ui span {
  display: block;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  transition: transform .16s;
}
.switch-row input:checked + .switch-ui {
  background: rgba(139,92,246,.45);
  border-color: rgba(139,92,246,.7);
}
.switch-row input:checked + .switch-ui span {
  transform: translateX(20px);
}
</style>
