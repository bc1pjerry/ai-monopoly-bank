<template>
  <div class="mobile-banker">

    <!-- 顶部状态栏 -->
    <header class="mb-header">
      <div class="mb-header-top">
        <span class="mb-title">庄家控制台</span>
        <span class="mb-room">{{ room.id }}</span>
      </div>
      <div class="mb-timer">{{ formattedTime }}</div>
      <div class="mb-kpi-row">
        <div class="mb-kpi">
          <div class="mb-kpi-label">玩家</div>
          <div class="mb-kpi-val">{{ room.players.length }}</div>
        </div>
        <div class="mb-kpi">
          <div class="mb-kpi-label">总余额</div>
          <div class="mb-kpi-val" style="color:#34d399;">¥{{ fmt(totalBalance) }}</div>
        </div>
        <div class="mb-kpi">
          <div class="mb-kpi-label">
            银行资金
            <span class="mb-interest-rate">{{ room.config.interestRate ?? 1.5 }}%</span>
          </div>
          <div class="mb-kpi-val" :style="{ color: (room.config.bankBalance ?? 0) >= 0 ? '#34d399' : '#f87171' }">¥{{ fmt(room.config.bankBalance ?? 0) }}</div>
          <div class="mb-interest-countdown" :class="mbInterestCountdownSecs <= 60 ? 'mb-interest-countdown--soon' : ''">{{ mbInterestCountdownLabel }}</div>
        </div>
        <div class="mb-kpi">
          <div class="mb-kpi-label">总存款</div>
          <div class="mb-kpi-val" style="color:#2dd4bf;">¥{{ fmt(totalDeposits) }}</div>
          <div class="mb-kpi-sub">{{ activeDepositCount }} 笔</div>
        </div>
        <div class="mb-kpi">
          <div class="mb-kpi-label">总贷款</div>
          <div class="mb-kpi-val" style="color:#fb923c;">¥{{ fmt(totalLoans) }}</div>
          <div class="mb-kpi-sub">{{ activeLoanCount }} 笔</div>
        </div>
      </div>
    </header>

    <!-- 控制操作 tab -->
    <div class="mb-tabs">
      <button :class="['mb-tab', tab === 'players' && 'active']" @click="tab = 'players'">玩家账户</button>
      <button :class="['mb-tab', tab === 'go' && 'active']" @click="tab = 'go'">过起点</button>
      <button :class="['mb-tab', tab === 'logs' && 'active']" @click="tab = 'logs'">流水</button>
      <button :class="['mb-tab', tab === 'control' && 'active']" @click="tab = 'control'">设置</button>
    </div>

    <!-- 玩家账户 -->
    <div v-if="tab === 'players'" class="mb-content">
      <div
        class="mb-player-card"
        v-for="p in room.players"
        :key="p.id"
      >
        <div class="mb-pc-top">
            <span class="mb-pc-name">{{ p.name }}</span>
            <span class="mb-pc-delta" :class="delta(p) > 0 ? 'pos' : delta(p) < 0 ? 'neg' : 'neu'">
              {{ delta(p) > 0 ? '+' : '' }}{{ delta(p) !== 0 ? fmt(delta(p)) : '持平' }}
            </span>
          </div>
          <div class="mb-pc-balance">¥{{ fmt(p.balance) }}</div>
          <div class="mb-pc-assets-row">
            <span class="mb-pc-assets-label">总资产</span>
            <span class="mb-pc-assets-val">¥{{ fmt(totalAssets(p)) }}</span>
            <span class="mb-pc-assets-breakdown" v-if="getPropertyValue(p.id) > 0">（地产 ¥{{ fmt(getPropertyValue(p.id)) }}）</span>
          </div>
          <div class="mb-pc-prop-row">
            <span class="mb-pc-prop-label">持有房产</span>
            <span class="mb-pc-prop-val">{{ getPropertyCount(p.id) }} 块</span>
          </div>
          <div class="mb-pc-actions">
          <button class="green-btn mb-action-btn" @click="openAction('bank-add', p.id)">＋ 发钱</button>
          <button class="red-btn mb-action-btn" @click="openAction('bank-sub', p.id)">－ 扣钱</button>
        </div>
      </div>
    </div>

    <!-- 流水 -->
    <div v-if="tab === 'logs'" class="mb-content">
      <LogList :logs="room.logs" :logsTotal="room.logsTotal" :roomId="room.id" :token="myToken" />
    </div>

    <!-- 过起点 -->
    <div v-if="tab === 'go'" class="mb-content">
      <div class="mb-go-hint">
        每人过起点奖励
        <span class="mb-go-amount">¥{{ fmt(room.config.goSalary ?? 200) }}</span>
      </div>
      <div
        class="mb-player-card"
        v-for="p in room.players"
        :key="p.id"
      >
        <div class="mb-pc-top">
          <span class="mb-pc-name">{{ p.name }}</span>
          <span class="mb-pc-balance-sm">¥{{ fmt(p.balance) }}</span>
        </div>
        <button class="go-btn" @click="payGoSalary(p.id)">
          过起点 ＋¥{{ fmt(room.config.goSalary ?? 200) }}
        </button>
      </div>
      <button class="go-all-btn" @click="payGoSalaryAll">
        一键全部过起点（共 ¥{{ fmt((room.config.goSalary ?? 200) * room.players.length) }}）
      </button>
    </div>

    <!-- 房间控制 -->
    <div v-if="tab === 'control'" class="mb-content">
      <div class="mb-control-card">
        <div class="mb-ctrl-item">
          <div>
            <div class="mb-ctrl-title">过起点奖励金额</div>
            <div class="mb-ctrl-desc">玩家每次经过起点时发放的金额</div>
          </div>
          <div class="mb-ctrl-go-edit">
            <input
              class="mb-go-input"
              type="number"
              min="0"
              v-model.number="editGoSalary"
              @focus="editGoSalary = room.config.goSalary ?? 200"
            />
            <button class="tb-btn go-save-btn" @click="saveGoSalary">保存</button>
          </div>
        </div>
        <div class="mb-ctrl-item">
          <div>
            <div class="mb-ctrl-title">重置本局</div>
            <div class="mb-ctrl-desc">将所有玩家余额重置为起始金额</div>
          </div>
          <button class="tb-btn reset-btn" @click="resetRoom">重置</button>
        </div>
        <div class="mb-ctrl-item">
          <div>
            <div class="mb-ctrl-title">暂停游戏</div>
            <div class="mb-ctrl-desc">所有玩家界面显示暂停，利息计时冻结</div>
          </div>
          <button class="tb-btn pause-btn" @click="isPaused ? resumeGame() : pauseGame()">{{ isPaused ? '恢复' : '暂停' }}</button>
        </div>
        <div class="mb-ctrl-item">
          <div>
            <div class="mb-ctrl-title">结束游戏</div>
            <div class="mb-ctrl-desc">返回首页，数据保留</div>
          </div>
          <button class="tb-btn end-btn" @click="endGame">结束</button>
        </div>
      </div>
    </div>

    <!-- ══ 银行操作弹窗 ══ -->
    <div class="modal-backdrop" v-if="actionVisible" @click.self="actionVisible = false">
      <div class="modal bank-modal-mobile">
        <div class="modal-header">
          <h3>{{ actionType === 'bank-add' ? '发钱给玩家' : '扣除玩家余额' }}</h3>
          <button class="modal-close" @click="actionVisible = false">✕</button>
        </div>
        <div class="field">
          <label>操作类型</label>
          <select v-model="actionType">
            <option value="bank-add">银行发钱 / 收入</option>
            <option value="bank-sub">银行扣钱 / 支出</option>
          </select>
        </div>
        <div class="field">
          <label>目标玩家</label>
          <select v-model="bankPlayerId">
            <option v-for="p in room.players" :key="p.id" :value="p.id">
              {{ p.name }}（¥{{ fmt(p.balance) }}）
            </option>
          </select>
        </div>
        <div class="field">
          <label>备注</label>
          <input v-model="note" type="text" maxlength="60" placeholder="例如 过起点 / 买地 / 交租" />
        </div>
        <NumPad v-model="amount" :quickAmounts="[50,100,200,500,1000]" style="margin-bottom:16px;" />
        <div class="modal-actions">
          <button class="secondary" @click="actionVisible = false">取消</button>
          <button
            :class="actionType === 'bank-add' ? 'primary' : 'red-btn'"
            style="flex:1; border:0;"
            @click="submitAction"
          >
            {{ actionType === 'bank-add' ? '确认发钱' : '确认扣钱' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 暂停覆盖层 -->
    <div v-if="isPaused" class="pause-overlay">
      <div class="pause-overlay-content">
        <div class="pause-icon">⏸</div>
        <h2 class="pause-title">游戏已暂停</h2>
        <p class="pause-desc">利息计时已冻结，恢复游戏后继续</p>
        <button class="pause-resume-btn" @click="resumeGame">恢复游戏</button>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import LogList from './LogList.vue'
import NumPad from './NumPad.vue'
import { fmt, apiWithToken } from '../composables/api.js'

const props = defineProps({ room: Object, myToken: String })
const emit = defineEmits(['room-updated', 'end-game'])

// ─── 暂停状态 ─────────────────────────────────────────────────────────────────
const isPaused = computed(() => (props.room?.status || 'active') === 'paused')

const tab = ref('players')

// ─── 银行操作弹窗 ─────────────────────────────────────────────────────────────
const actionVisible = ref(false)
const actionType = ref('bank-add')
const bankPlayerId = ref(props.room.players[0]?.id || '')
const amount = ref(null)
const note = ref('')

// ─── 过起点金额编辑 ───────────────────────────────────────────────────────────
const editGoSalary = ref(props.room.config.goSalary ?? 200)

function openAction(type, playerId) {
  actionType.value = type
  bankPlayerId.value = playerId || props.room.players[0]?.id || ''
  amount.value = null
  note.value = ''
  actionVisible.value = true
}

function delta(player) {
  return player.balance - props.room.config.startingMoney
}

function getPropertyValue(playerId) {
  return (props.room.properties || [])
    .filter(p => p.player_id === playerId)
    .reduce((s, p) => s + Number(p.price || 0) + Number(p.build_cost || 0), 0)
}

function getPropertyCount(playerId) {
  return (props.room.properties || []).filter(p => p.player_id === playerId).length
}

function getPlayerDepositTotal(playerId) {
  return (props.room.deposits || [])
    .filter(d => d.player_id === playerId && d.status === 'active')
    .reduce((s, d) => s + Number(d.amount || 0), 0)
}

function getPlayerDebt(playerId) {
  return (props.room.loans || [])
    .filter(l => l.player_id === playerId && l.status === 'active')
    .reduce((s, l) => s + Number(l.remaining || 0), 0)
}

function totalAssets(player) {
  return Number(player.balance || 0) + getPropertyValue(player.id) + getPlayerDepositTotal(player.id) - getPlayerDebt(player.id)
}

const totalBalance = computed(() =>
  props.room.players.reduce((s, p) => s + Number(p.balance || 0), 0)
)

const totalNetAssets = computed(() =>
  props.room.players.reduce((s, p) => s + totalAssets(p), 0)
)

// ─── 存款 / 贷款汇总 ──────────────────────────────────────────────────────────
const totalDeposits = computed(() =>
  (props.room.deposits || []).filter(d => d.status === 'active').reduce((s, d) => s + Number(d.amount || 0), 0)
)
const totalLoans = computed(() =>
  (props.room.loans || []).filter(l => l.status === 'active').reduce((s, l) => s + Number(l.remaining || 0), 0)
)
const activeDepositCount = computed(() =>
  (props.room.deposits || []).filter(d => d.status === 'active').length
)
const activeLoanCount = computed(() =>
  (props.room.loans || []).filter(l => l.status === 'active').length
)

// ─── 游戏计时器 ───────────────────────────────────────────────────────────────
function getElapsed() {
  return Math.floor((Date.now() - props.room.createdAt) / 1000)
}

const elapsedSeconds = ref(getElapsed())
let timerInterval = null

const formattedTime = computed(() => {
  const h = Math.floor(elapsedSeconds.value / 3600)
  const m = Math.floor((elapsedSeconds.value % 3600) / 60)
  const s = elapsedSeconds.value % 60
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

// ─── 利息倒计时 ───────────────────────────────────────────────────────────────
const mbInterestCountdownSecs = computed(() => {
  // 暂停时冻结倒计时，根据 pausedAt 计算暂停时刻的剩余秒数
  if (isPaused.value) {
    const intervalMin = props.room.config.interestIntervalMin ?? 10
    const lastAt = props.room.config.lastInterestAt ?? props.room.createdAt
    const pausedAt = props.room.config.pausedAt ?? Date.now()
    const nextAt = lastAt + intervalMin * 60 * 1000
    return Math.max(0, Math.round((nextAt - pausedAt) / 1000))
  }
  void elapsedSeconds.value
  const intervalMin = props.room.config.interestIntervalMin ?? 10
  const lastAt = props.room.config.lastInterestAt ?? props.room.createdAt
  const nextAt = lastAt + intervalMin * 60 * 1000
  return Math.max(0, Math.round((nextAt - Date.now()) / 1000))
})

const mbInterestCountdownLabel = computed(() => {
  const secs = mbInterestCountdownSecs.value
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

function startTimer() {
  if (timerInterval) return
  timerInterval = setInterval(() => { elapsedSeconds.value = getElapsed() }, 1000)
}
function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null }
}
function onVisibilityChange() {
  if (document.hidden) stopTimer(); else { elapsedSeconds.value = getElapsed(); startTimer() }
}

onMounted(() => {
  startTimer()
  document.addEventListener('visibilitychange', onVisibilityChange)
})
onUnmounted(() => {
  stopTimer()
  document.removeEventListener('visibilitychange', onVisibilityChange)
})

// ─── 操作 ─────────────────────────────────────────────────────────────────────
async function submitAction() {
  if (!(amount.value > 0)) return alert('请输入正确金额')
  try {
    const res = await apiWithToken(`/api/rooms/${props.room.id}/action`, props.myToken, {
      method: 'POST',
      body: { type: actionType.value, playerId: bankPlayerId.value, amount: amount.value, note: note.value.trim() }
    })
    amount.value = null
    note.value = ''
    actionVisible.value = false
    emit('room-updated', res.room)
  } catch (e) { alert('操作失败：' + e.message) }
}

async function payGoSalary(playerId) {
  const salary = props.room.config.goSalary ?? 200
  if (!(salary > 0)) return alert('过起点金额未设置')
  const player = props.room.players.find(p => p.id === playerId)
  try {
    const res = await apiWithToken(`/api/rooms/${props.room.id}/action`, props.myToken, {
      method: 'POST',
      body: { type: 'bank-add', playerId, amount: salary, note: '过起点' }
    })
    emit('room-updated', res.room)
  } catch (e) { alert(`发钱失败：${e.message}`) }
}

async function payGoSalaryAll() {
  const salary = props.room.config.goSalary ?? 200
  if (!(salary > 0)) return alert('过起点金额未设置')
  if (!confirm(`确认给所有 ${props.room.players.length} 名玩家各发 ¥${fmt(salary)}？`)) return
  try {
    let lastRoom = null
    for (const p of props.room.players) {
      const res = await apiWithToken(`/api/rooms/${props.room.id}/action`, props.myToken, {
        method: 'POST',
        body: { type: 'bank-add', playerId: p.id, amount: salary, note: '过起点' }
      })
      lastRoom = res.room
    }
    if (lastRoom) emit('room-updated', lastRoom)
  } catch (e) { alert(`操作失败：${e.message}`) }
}

async function saveGoSalary() {
  if (!(editGoSalary.value >= 0)) return alert('请输入正确金额')
  try {
    const res = await apiWithToken(`/api/rooms/${props.room.id}/update-config`, props.myToken, {
      method: 'POST',
      body: { goSalary: editGoSalary.value }
    })
    emit('room-updated', res.room)
    alert('过起点金额已更新')
  } catch (e) { alert('保存失败：' + e.message) }
}

async function resetRoom() {
  if (!confirm('确认把这局重置回开局状态？')) return
  try {
    const res = await apiWithToken(`/api/rooms/${props.room.id}/reset`, props.myToken, { method: 'POST', body: {} })
    emit('room-updated', res.room)
  } catch (e) { alert('重置失败：' + e.message) }
}

async function pauseGame() {
  if (!confirm('确认暂停游戏？所有玩家界面将显示暂停状态，利息计时将冻结。')) return
  try {
    await apiWithToken(`/api/rooms/${props.room.id}/pause`, props.myToken, { method: 'POST', body: {} })
  } catch {}
}

async function resumeGame() {
  try {
    await apiWithToken(`/api/rooms/${props.room.id}/resume`, props.myToken, { method: 'POST', body: {} })
  } catch (e) { alert('恢复失败：' + e.message) }
}

async function endGame() {
  if (!confirm('确认结束本局游戏并返回首页？')) return
  try {
    await apiWithToken(`/api/rooms/${props.room.id}/end-game`, props.myToken, { method: 'POST', body: {} })
  } catch {}
  emit('end-game')
}
</script>

<style scoped>
/* ══ 整体 ══ */
.mobile-banker {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  max-width: 480px;
  margin: 0 auto;
}

/* ══ 头部 ══ */
.mb-header {
  background: rgba(124,58,237,.18);
  border: 1px solid rgba(124,58,237,.3);
  border-radius: 0 0 22px 22px;
  padding: 16px 20px 18px;
  margin-bottom: 0;
}

.mb-header-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.mb-title {
  font-size: 16px;
  font-weight: 800;
  color: #ede9fe;
}

.mb-room {
  font-size: 12px;
  color: #a78bfa;
  background: rgba(124,58,237,.25);
  padding: 2px 10px;
  border-radius: 999px;
  border: 1px solid rgba(124,58,237,.4);
}

.mb-timer {
  font-size: 44px;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  letter-spacing: .04em;
  color: #ede9fe;
  line-height: 1;
  text-align: center;
  margin-bottom: 14px;
}

.mb-kpi-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.mb-kpi {
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 12px;
  padding: 10px 12px;
  text-align: center;
}

.mb-kpi-label {
  font-size: 11px;
  color: #a7b0cf;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
}

.mb-interest-rate {
  font-size: 10px;
  font-weight: 700;
  color: #34d399;
  background: rgba(52,211,153,.15);
  border: 1px solid rgba(52,211,153,.3);
  border-radius: 5px;
  padding: 0 4px;
  line-height: 1.5;
}

.mb-kpi-val {
  font-size: 18px;
  font-weight: 800;
  color: #eef2ff;
}

.mb-interest-countdown {
  font-size: 10px;
  color: #a7b0cf;
  font-variant-numeric: tabular-nums;
  margin-top: 2px;
  letter-spacing: .03em;
}

.mb-kpi-sub {
  font-size: 10px;
  color: #64748b;
  margin-top: 2px;
}

.mb-interest-countdown--soon {
  color: #f87171;
  animation: pulse-countdown-mb .8s ease-in-out infinite;
}

@keyframes pulse-countdown-mb {
  0%, 100% { opacity: 1; }
  50% { opacity: .4; }
}

/* ══ Tab ══ */
.mb-tabs {
  display: flex;
  gap: 0;
  background: rgba(255,255,255,.05);
  border-bottom: 1px solid rgba(255,255,255,.1);
}

.mb-tab {
  flex: 1;
  padding: 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: #a7b0cf;
  background: transparent;
  border: none;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color .15s, border-color .15s;
}

.mb-tab.active {
  color: #c4b5fd;
  border-bottom-color: #7c3aed;
}

/* ══ 内容区 ══ */
.mb-content {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
}

/* ══ 玩家卡片 ══ */
.mb-player-card {
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 16px;
  padding: 14px;
}

.mb-pc-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.mb-pc-name {
  font-size: 16px;
  font-weight: 700;
  color: #eef2ff;
}

.mb-pc-delta {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
}
.mb-pc-delta.pos { background: rgba(16,185,129,.2); color: #6ee7b7; }
.mb-pc-delta.neg { background: rgba(239,68,68,.18); color: #fca5a5; }
.mb-pc-delta.neu { background: rgba(255,255,255,.08); color: #a7b0cf; }

.mb-pc-balance {
  font-size: 30px;
  font-weight: 900;
  letter-spacing: -.03em;
  color: #eef2ff;
  margin: 8px 0 4px;
}

.mb-pc-assets-row {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 10px;
}

.mb-pc-assets-label {
  font-size: 11px;
  color: #a7b0cf;
  font-weight: 600;
}

.mb-pc-assets-val {
  font-size: 13px;
  font-weight: 700;
  color: #a78bfa;
}

.mb-pc-assets-breakdown {
  font-size: 11px;
  color: #6d5fb5;
}

.mb-pc-prop-row {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 10px;
  margin-top: -6px;
}

.mb-pc-prop-label {
  font-size: 11px;
  color: #a7b0cf;
  font-weight: 600;
}

.mb-pc-prop-val {
  font-size: 13px;
  font-weight: 700;
  color: #fbbf24;
}

.mb-pc-actions {
  display: flex;
  gap: 8px;
}

.mb-action-btn {
  flex: 1;
  padding: 10px 0;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid transparent;
  transition: .15s ease;
}
.mb-action-btn:active { transform: scale(.96); }

/* ══ 房间控制 ══ */
.mb-control-card {
  background: rgba(255,255,255,.05);
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 18px;
  overflow: hidden;
}

.mb-ctrl-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 16px;
  border-bottom: 1px solid rgba(255,255,255,.06);
}
.mb-ctrl-item:last-child { border-bottom: none; }

.mb-ctrl-title {
  font-size: 15px;
  font-weight: 700;
  color: #eef2ff;
  margin-bottom: 2px;
}

.mb-ctrl-desc {
  font-size: 12px;
  color: #a7b0cf;
}

/* ══ 控制按钮（复用 topbar 样式） ══ */
.tb-btn {
  padding: 8px 16px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  white-space: nowrap;
  transition: .15s ease;
}

.reset-btn {
  background: rgba(6,182,212,.16);
  color: #cffafe;
  border-color: rgba(6,182,212,.35);
}
.reset-btn:hover { background: rgba(6,182,212,.28); }

.pause-btn {
  background: rgba(245,158,11,.16);
  color: #fef3c7;
  border-color: rgba(245,158,11,.35);
}
.pause-btn:hover { background: rgba(245,158,11,.28); }

.end-btn {
  background: rgba(100,116,139,.18);
  color: #cbd5e1;
  border-color: rgba(100,116,139,.35);
}
.end-btn:hover { background: rgba(100,116,139,.3); }

.go-save-btn {
  background: rgba(16,185,129,.18);
  color: #6ee7b7;
  border-color: rgba(16,185,129,.35);
  padding: 6px 14px;
}
.go-save-btn:hover { background: rgba(16,185,129,.3); }

/* ══ 银行操作弹窗 ══ */
.bank-modal-mobile {
  width: min(96vw, 420px);
  max-height: 92vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.modal-header h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
}

.modal-close {
  background: rgba(255,255,255,.08);
  border: 1px solid rgba(255,255,255,.12);
  color: #a7b0cf;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.modal-close:hover { background: rgba(255,255,255,.16); color: #eef2ff; }

.modal-actions {
  display: flex;
  gap: 10px;
}

/* ══ 过起点 tab ══ */
.mb-go-hint {
  background: rgba(16,185,129,.1);
  border: 1px solid rgba(16,185,129,.25);
  border-radius: 14px;
  padding: 14px 16px;
  font-size: 15px;
  font-weight: 600;
  color: #a7e8c8;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.mb-go-amount {
  font-size: 22px;
  font-weight: 900;
  color: #34d399;
}

.mb-pc-balance-sm {
  font-size: 15px;
  font-weight: 700;
  color: #a7b0cf;
}

.go-btn {
  width: 100%;
  margin-top: 10px;
  padding: 12px 0;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid rgba(16,185,129,.35);
  background: rgba(16,185,129,.16);
  color: #6ee7b7;
  transition: .15s ease;
}
.go-btn:active { transform: scale(.97); background: rgba(16,185,129,.3); }

.go-all-btn {
  width: 100%;
  padding: 14px 0;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
  border: 1px solid rgba(16,185,129,.5);
  background: rgba(16,185,129,.22);
  color: #34d399;
  transition: .15s ease;
  margin-top: 4px;
}
.go-all-btn:active { transform: scale(.98); background: rgba(16,185,129,.38); }

/* 设置 tab 中的过起点编辑区 */
.mb-ctrl-go-edit {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.mb-go-input {
  width: 90px;
  padding: 7px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,.18);
  background: rgba(255,255,255,.08);
  color: #eef2ff;
  font-size: 14px;
  font-weight: 600;
  text-align: right;
  outline: none;
}
.mb-go-input:focus {
  border-color: rgba(16,185,129,.5);
  background: rgba(16,185,129,.08);
}

/* ── 暂停覆盖层 ── */
.pause-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(15, 23, 42, 0.88);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: pause-fade-in 0.3s ease;
}
@keyframes pause-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
.pause-overlay-content {
  text-align: center;
  color: #e2e8f0;
  padding: 40px;
}
.pause-icon {
  font-size: 64px;
  margin-bottom: 16px;
  animation: pause-pulse 2s ease-in-out infinite;
}
@keyframes pause-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.95); }
}
.pause-title {
  font-size: 28px;
  font-weight: 800;
  margin: 0 0 12px;
  color: #f1f5f9;
}
.pause-desc {
  font-size: 15px;
  color: #94a3b8;
  margin: 0 0 28px;
}
.pause-resume-btn {
  padding: 12px 40px;
  font-size: 16px;
  font-weight: 700;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
}
.pause-resume-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.4);
}
</style>
