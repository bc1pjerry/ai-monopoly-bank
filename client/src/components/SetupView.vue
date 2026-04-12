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
            <div class="history-id">房间 {{ r.id }}</div>
            <div class="history-meta">
              {{ r.config.playerCount }} 人局 · 起始 ¥{{ fmt(r.config.startingMoney) }} · 过起点 ¥{{ fmt(r.config.goSalary ?? 200) }}
              · 最后活动 {{ timeAgo(r.updatedAt) }}
            </div>
          </div>
          <div class="history-actions">
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

const emit = defineEmits(['created'])

const playerCount = ref(4)
const startingMoney = ref(1500)
const goSalary = ref(200)
const historyRooms = ref([])
const historyLoaded = ref(false)
const confirmDeleteId = ref(null)

async function handleCreate() {
  try {
    const data = await apiFetch('/api/rooms', {
      method: 'POST',
      body: { playerCount: playerCount.value, startingMoney: startingMoney.value, goSalary: goSalary.value }
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
.history-id { font-weight:700; font-size:16px; }
.history-meta { color:var(--muted); font-size:13px; margin-top:3px; }
.history-actions { display:flex; gap:8px; align-items:center; flex-shrink:0; }
.confirm-delete {
  background: rgba(239,68,68,.45) !important;
  border-color: rgba(239,68,68,.7) !important;
  color: #fff !important;
  font-weight:700;
}
</style>
