<template>
  <div class="banker-dashboard">

    <!-- ══ 顶部导航栏 ══ -->
    <header class="topbar">
      <div class="topbar-left">
        <span class="topbar-logo">大富翁银行</span>
        <span class="role-label role-banker">庄家</span>
        <span class="room-badge">房间 {{ room.id }}</span>
      </div>
      <div class="topbar-center">
        <span class="timer-label-sm">游戏时间</span>
        <span class="timer-display-sm">{{ formattedTime }}</span>
      </div>
      <div class="topbar-right">
        <button class="tb-btn secondary" @click="$emit('share')">分享链接</button>
        <button class="tb-btn go-btn" @click="goModalVisible = true">过起点</button>
        <button class="tb-btn reset-btn" @click="resetRoom">重置</button>
        <button class="tb-btn pause-btn" @click="pauseGame">暂停</button>
        <button class="tb-btn end-btn" @click="endGame">结束</button>
      </div>
    </header>

    <!-- ══ 主内容区 ══ -->
    <main class="dash-body">

      <!-- 左栏：KPI 统计 + 玩家卡片 -->
      <section class="dash-left">

        <!-- KPI 行 -->
        <div class="kpi-row">
          <div class="kpi-card">
            <div class="kpi-label">玩家数</div>
            <div class="kpi-value">{{ room.players.length }}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">市场总金额</div>
            <div class="kpi-value kpi-green">¥{{ fmt(totalBalance) }}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">起始金额</div>
            <div class="kpi-value">¥{{ fmt(room.config.startingMoney) }}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">银行资金</div>
            <div class="kpi-value" :class="(room.config.bankBalance ?? 0) >= 0 ? 'kpi-green' : 'kpi-red'">¥{{ fmt(room.config.bankBalance ?? 0) }}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">流水数</div>
            <div class="kpi-value">{{ room.logsTotal ?? room.logs.length }}</div>
          </div>
        </div>

        <!-- 玩家卡片网格 -->
        <div class="players-grid">
          <div
            class="player-card"
            v-for="p in room.players"
            :key="p.id"
            :class="{ 'player-card--rich': p.balance > room.config.startingMoney, 'player-card--poor': p.balance < room.config.startingMoney }"
          >
            <div class="pc-header">
              <span class="pc-name">{{ p.name }}</span>
              <span class="pc-delta" :class="delta(p) > 0 ? 'pos' : delta(p) < 0 ? 'neg' : 'neu'">
                {{ delta(p) > 0 ? '+' : '' }}{{ delta(p) !== 0 ? fmt(delta(p)) : '持平' }}
              </span>
            </div>
            <div class="pc-balance">¥{{ fmt(p.balance) }}</div>
            <BalanceChart
              :logs="room.logs"
              :playerName="p.name"
              :startBalance="room.config.startingMoney"
            />

          </div>
        </div>
      </section>

      <!-- 右栏：交易流水 -->
      <aside class="dash-right">
        <div class="panel-header">
          <h2 class="panel-title">交易流水</h2>
        </div>
        <LogList :logs="room.logs" :logsTotal="room.logsTotal" :roomId="room.id" :token="myToken" />
      </aside>
    </main>

    <!-- ══ 银行操作弹窗 ══ -->
    <div class="modal-backdrop" v-if="actionVisible" @click.self="actionVisible = false">
      <div class="modal bank-modal">
        <div class="modal-header">
          <h3>{{ actionType === 'bank-add' ? '银行发钱' : '银行扣钱' }}</h3>
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
            style="flex:1;"
            @click="submitAction"
          >
            {{ actionType === 'bank-add' ? '确认发钱' : '确认扣钱' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ══ 过起点弹窗 ══ -->
    <div class="modal-backdrop" v-if="goModalVisible" @click.self="goModalVisible = false">
      <div class="modal go-modal">
        <div class="modal-header">
          <h3>过起点发钱</h3>
          <button class="modal-close" @click="goModalVisible = false">✕</button>
        </div>
        <div class="go-salary-display">
          每人奖励
          <span class="go-salary-val">¥{{ fmt(room.config.goSalary ?? 200) }}</span>
        </div>
        <div class="go-player-list">
          <div class="go-player-row" v-for="p in room.players" :key="p.id">
            <div class="go-player-info">
              <span class="go-player-name">{{ p.name }}</span>
              <span class="go-player-balance">¥{{ fmt(p.balance) }}</span>
            </div>
            <button class="go-single-btn" @click="payGoSalary(p.id)">
              ＋¥{{ fmt(room.config.goSalary ?? 200) }}
            </button>
          </div>
        </div>
        <button class="go-all-btn" @click="payGoSalaryAll">
          一键全部过起点（共 ¥{{ fmt((room.config.goSalary ?? 200) * room.players.length) }}）
        </button>
        <div class="go-config-row">
          <label class="go-config-label">修改过起点金额</label>
          <div class="go-config-edit">
            <input
              class="go-config-input"
              type="number"
              min="0"
              v-model.number="editGoSalary"
            />
            <button class="secondary go-save-btn" @click="saveGoSalary">保存</button>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import LogList from './LogList.vue'
import BalanceChart from './BalanceChart.vue'
import NumPad from './NumPad.vue'
import { fmt, apiWithToken } from '../composables/api.js'

const props = defineProps({ room: Object, myToken: String })
const emit = defineEmits(['room-updated', 'share', 'end-game'])

// ─── 银行操作弹窗状态 ─────────────────────────────────────────────────────────
const actionVisible = ref(false)
const actionType = ref('bank-add')
const bankPlayerId = ref(props.room.players[0]?.id || '')
const amount = ref(null)
const note = ref('')

// ─── 过起点弹窗状态 ───────────────────────────────────────────────────────────
const goModalVisible = ref(false)
const editGoSalary = ref(props.room.config.goSalary ?? 200)

function openAction(type, playerId) {
  actionType.value = type
  bankPlayerId.value = playerId || props.room.players[0]?.id || ''
  amount.value = null
  note.value = ''
  actionVisible.value = true
}

// ─── 玩家资产变动（相对于起始金额）─────────────────────────────────────────
function delta(player) {
  return player.balance - props.room.config.startingMoney
}

const totalBalance = computed(() =>
  props.room.players.reduce((s, p) => s + Number(p.balance || 0), 0)
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

// ─── 银行操作 ─────────────────────────────────────────────────────────────────
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

// ─── 过起点 ───────────────────────────────────────────────────────────────────
async function payGoSalary(playerId) {
  const salary = props.room.config.goSalary ?? 200
  if (!(salary > 0)) return alert('过起点金额未设置')
  try {
    const res = await apiWithToken(`/api/rooms/${props.room.id}/action`, props.myToken, {
      method: 'POST',
      body: { type: 'bank-add', playerId, amount: salary, note: '过起点' }
    })
    emit('room-updated', res.room)
  } catch (e) { alert('发钱失败：' + e.message) }
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
    goModalVisible.value = false
  } catch (e) { alert('操作失败：' + e.message) }
}

async function saveGoSalary() {
  if (!(editGoSalary.value >= 0)) return alert('请输入正确金额')
  try {
    const res = await apiWithToken(`/api/rooms/${props.room.id}/update-config`, props.myToken, {
      method: 'POST',
      body: { goSalary: editGoSalary.value }
    })
    emit('room-updated', res.room)
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
  if (!confirm('确认暂停游戏？所有玩家将断开连接并返回主页。')) return
  try {
    await apiWithToken(`/api/rooms/${props.room.id}/pause`, props.myToken, { method: 'POST', body: {} })
  } catch {}
  emit('end-game')
}

function endGame() {
  if (!confirm('确认结束本局游戏并返回首页？')) return
  emit('end-game')
}
</script>

<style scoped>
/* ══ 整体布局 ══ */
.banker-dashboard {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* ══ 顶部导航栏 ══ */
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 28px;
  height: 62px;
  background: rgba(8,16,31,.85);
  border-bottom: 1px solid rgba(255,255,255,.1);
  backdrop-filter: blur(16px);
  position: sticky;
  top: 0;
  z-index: 50;
  flex-shrink: 0;
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.topbar-logo {
  font-size: 18px;
  font-weight: 800;
  color: #ede9fe;
  white-space: nowrap;
}

.room-badge {
  font-size: 13px;
  color: #a7b0cf;
  background: rgba(255,255,255,.07);
  border: 1px solid rgba(255,255,255,.12);
  padding: 3px 10px;
  border-radius: 999px;
}

.topbar-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  flex-shrink: 0;
}

.timer-label-sm {
  font-size: 10px;
  color: #a78bfa;
  letter-spacing: .1em;
  text-transform: uppercase;
  font-weight: 600;
}

.timer-display-sm {
  font-size: 26px;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  letter-spacing: .06em;
  color: #ede9fe;
  line-height: 1;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  justify-content: flex-end;
}

.tb-btn {
  padding: 7px 14px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: .15s ease;
  white-space: nowrap;
}
.tb-btn:hover { transform: translateY(-1px); }

.go-btn {
  background: rgba(16,185,129,.16);
  color: #6ee7b7;
  border-color: rgba(16,185,129,.35);
}
.go-btn:hover { background: rgba(16,185,129,.28); }

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

/* ══ 主体两栏 ══ */
.dash-body {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 0;
  flex: 1;
  min-height: 0;
}

.dash-left {
  padding: 22px 22px 22px 28px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.dash-right {
  border-left: 1px solid rgba(255,255,255,.1);
  background: rgba(255,255,255,.03);
  padding: 22px 18px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ══ KPI 行 ══ */
.kpi-row {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 14px;
}

.kpi-card {
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 18px;
  padding: 16px 18px;
  backdrop-filter: blur(8px);
}

.kpi-label {
  font-size: 11px;
  color: #a7b0cf;
  text-transform: uppercase;
  letter-spacing: .08em;
  font-weight: 600;
  margin-bottom: 6px;
}

.kpi-value {
  font-size: 26px;
  font-weight: 900;
  color: #eef2ff;
  letter-spacing: -.02em;
}

.kpi-green { color: #34d399; }
.kpi-red { color: #f87171; }

/* ══ 玩家卡片 ══ */
.players-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
}

.player-card {
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 18px;
  padding: 16px;
  transition: border-color .2s, background .2s;
}

.player-card--rich {
  border-color: rgba(16,185,129,.4);
  background: rgba(16,185,129,.06);
}

.player-card--poor {
  border-color: rgba(239,68,68,.35);
  background: rgba(239,68,68,.05);
}

.pc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.pc-name {
  font-weight: 700;
  font-size: 16px;
  color: #eef2ff;
}

.pc-delta {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
}
.pc-delta.pos { background: rgba(16,185,129,.2); color: #6ee7b7; }
.pc-delta.neg { background: rgba(239,68,68,.18); color: #fca5a5; }
.pc-delta.neu { background: rgba(255,255,255,.08); color: #a7b0cf; }

.pc-balance {
  font-size: 28px;
  font-weight: 900;
  letter-spacing: -.03em;
  margin: 8px 0 10px;
  color: #eef2ff;
}

/* ══ 右栏流水 ══ */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.panel-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #eef2ff;
}

/* ══ 银行操作弹窗 ══ */
.bank-modal {
  width: min(94vw, 460px);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
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

.modal-actions {
  display: flex;
  gap: 10px;
}

/* ══ 过起点弹窗 ══ */
.go-modal {
  width: min(94vw, 500px);
}

.go-salary-display {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(16,185,129,.1);
  border: 1px solid rgba(16,185,129,.25);
  border-radius: 14px;
  padding: 14px 18px;
  font-size: 15px;
  font-weight: 600;
  color: #a7e8c8;
  margin-bottom: 16px;
}

.go-salary-val {
  font-size: 26px;
  font-weight: 900;
  color: #34d399;
}

.go-player-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
}

.go-player-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: rgba(255,255,255,.05);
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 12px;
  padding: 10px 14px;
}

.go-player-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.go-player-name {
  font-weight: 700;
  font-size: 15px;
  color: #eef2ff;
}

.go-player-balance {
  font-size: 12px;
  color: #a7b0cf;
}

.go-single-btn {
  padding: 8px 14px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid rgba(16,185,129,.35);
  background: rgba(16,185,129,.16);
  color: #6ee7b7;
  white-space: nowrap;
  transition: .15s ease;
}
.go-single-btn:hover { background: rgba(16,185,129,.28); }

.go-all-btn {
  width: 100%;
  padding: 13px 0;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
  border: 1px solid rgba(16,185,129,.5);
  background: rgba(16,185,129,.22);
  color: #34d399;
  transition: .15s ease;
  margin-bottom: 18px;
}
.go-all-btn:hover { background: rgba(16,185,129,.35); transform: translateY(-1px); }

.go-config-row {
  border-top: 1px solid rgba(255,255,255,.08);
  padding-top: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.go-config-label {
  font-size: 14px;
  color: #a7b0cf;
  font-weight: 600;
}

.go-config-edit {
  display: flex;
  align-items: center;
  gap: 8px;
}

.go-config-input {
  width: 100px;
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
.go-config-input:focus {
  border-color: rgba(16,185,129,.5);
  background: rgba(16,185,129,.08);
}

.go-save-btn {
  white-space: nowrap;
}

/* ══ 响应式：小屏退化 ══ */
@media (max-width: 900px) {
  .dash-body {
    grid-template-columns: 1fr;
  }
  .dash-right {
    border-left: none;
    border-top: 1px solid rgba(255,255,255,.1);
  }
  .kpi-row {
    grid-template-columns: repeat(2, 1fr);
  }  .topbar-center {
    display: none;
  }
}
</style>
