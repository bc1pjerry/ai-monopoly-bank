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
        <button class="tb-btn pause-btn" @click="isPaused ? resumeGame() : pauseGame()">{{ isPaused ? '恢复' : '暂停' }}</button>
        <button class="tb-btn end-btn" @click="endGame">结束</button>
      </div>
    </header>

    <!-- ══ 主内容区 ══ -->
    <main class="dash-body">

      <!-- 左栏：KPI 统计 + 玩家卡片 -->
      <section class="dash-left">

        <!-- KPI 行 -->
        <div class="kpi-row">
          <!-- 第一行 -->
          <div class="kpi-card">
            <div class="kpi-label">已购房产</div>
            <div class="kpi-value">{{ totalPropertyCount }}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">总余额</div>
            <div class="kpi-value kpi-green">¥{{ fmt(totalBalance) }}</div>
          </div>
          <div class="kpi-card kpi-card--bank" @click="interestModalVisible = true" title="点击配置利息">
            <div class="kpi-card-header">
              <div class="kpi-label" style="margin-bottom:0">银行资金</div>
            </div>
            <div class="kpi-value" :class="(room.config.bankBalance ?? 0) >= 0 ? 'kpi-green' : 'kpi-red'">¥{{ fmt(room.config.bankBalance ?? 0) }}</div>
          </div>
          <!-- 第二行 -->
          <div class="kpi-card kpi-card--deposit">
            <div class="kpi-label">总存款</div>
            <div class="kpi-value kpi-teal">¥{{ fmt(totalDeposits) }}</div>
            <div class="kpi-sub">{{ activeDepositCount }} 笔</div>
          </div>
          <div class="kpi-card kpi-card--loan">
            <div class="kpi-label">总贷款</div>
            <div class="kpi-value kpi-orange">¥{{ fmt(totalLoans) }}</div>
            <div class="kpi-sub">{{ activeLoanCount }} 笔</div>
          </div>
          <div class="kpi-card kpi-card--bank" @click="interestModalVisible = true" title="点击配置利息">
            <div class="kpi-label">当前利率</div>
            <div class="kpi-value kpi-green">{{ (room.config.interestRate ?? 1.5) }}%</div>
            <div class="kpi-sub interest-next" :class="interestCountdownSecs <= 60 ? 'interest-countdown--soon' : ''">下次调整：{{ interestCountdownLabel }}</div>
          </div>
          <div class="kpi-card kpi-card--lottery">
            <div class="kpi-label">彩票奖池</div>
            <div class="kpi-value kpi-purple">¥{{ fmt(lottery.jackpotPool) }}</div>
            <div class="kpi-sub">已售 {{ lottery.tickets.length }} 张</div>
          </div>
          <div class="kpi-card kpi-card--lottery">
            <div class="kpi-label">彩票开奖</div>
            <div class="kpi-value">{{ lotteryCountdownLabel }}</div>
            <div class="kpi-sub">银行需出 ¥{{ fmt(lotteryBankBonusPreview) }}</div>
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
            <div class="pc-assets-row">
              <span class="pc-assets-label">总资产</span>
              <span class="pc-assets-val">¥{{ fmt(totalAssets(p)) }}</span>
              <span class="pc-assets-breakdown" v-if="getPropertyValue(p.id) > 0">（地产 ¥{{ fmt(getPropertyValue(p.id)) }}）</span>
            </div>
            <div class="pc-prop-row">
              <span class="pc-prop-label">持有房产</span>
              <span class="pc-prop-val">{{ getPropertyCount(p.id) }} 块</span>
            </div>
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
          <span class="panel-count">{{ room.logsTotal ?? room.logs.length }} 笔</span>
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

    <!-- ══ 利息设置弹窗 ══ -->
    <div class="modal-backdrop" v-if="interestModalVisible" @click.self="interestModalVisible = false">
      <div class="modal interest-modal">
        <div class="modal-header">
          <h3>利息设置</h3>
          <button class="modal-close" @click="interestModalVisible = false">✕</button>
        </div>
        <div class="interest-info-row">
          <div class="interest-info-item">
            <div class="interest-info-label">当前利率</div>
            <div class="interest-info-val kpi-green">{{ room.config.interestRate ?? 1.5 }}%</div>
          </div>
          <div class="interest-info-item">
            <div class="interest-info-label">结算周期</div>
            <div class="interest-info-val">{{ room.config.interestIntervalMin ?? 10 }} 分钟</div>
          </div>
          <div class="interest-info-item">
            <div class="interest-info-label">下次结算</div>
            <div class="interest-info-val" :class="interestCountdownSecs <= 60 ? 'kpi-red' : 'kpi-green'">{{ interestCountdownLabel }}</div>
          </div>
        </div>
        <div class="interest-preview">
          预计下次利息：<span class="kpi-green">+¥{{ fmt(Math.round((room.config.bankBalance ?? 0) * ((room.config.interestRate ?? 1.5) / 100))) }}</span>
        </div>
        <div class="field">
          <label>利率（%）</label>
          <input class="go-config-input" style="width:100%" type="number" min="0" max="100" step="0.1" v-model.number="editInterestRate" />
        </div>
        <div class="field">
          <label>结算周期（分钟）</label>
          <input class="go-config-input" style="width:100%" type="number" min="1" max="1440" step="1" v-model.number="editInterestIntervalMin" />
        </div>
        <div class="modal-actions">
          <button class="secondary" style="flex:1" @click="interestModalVisible = false">取消</button>
          <button class="primary" style="flex:2" @click="saveInterestSettings">保存设置</button>
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
import BalanceChart from './BalanceChart.vue'
import NumPad from './NumPad.vue'
import { fmt, apiWithToken } from '../composables/api.js'

const props = defineProps({ room: Object, myToken: String })
const emit = defineEmits(['room-updated', 'share', 'end-game'])

// ─── 暂停状态 ─────────────────────────────────────────────────────────────────
const isPaused = computed(() => (props.room?.status || 'active') === 'paused')

// ─── 银行操作弹窗状态 ─────────────────────────────────────────────────────────
const actionVisible = ref(false)
const actionType = ref('bank-add')
const bankPlayerId = ref(props.room.players[0]?.id || '')
const amount = ref(null)
const note = ref('')

// ─── 过起点弹窗状态 ───────────────────────────────────────────────────────────
const goModalVisible = ref(false)
const editGoSalary = ref(props.room.config.goSalary ?? 200)

// ─── 利息设置弹窗状态 ─────────────────────────────────────────────────────────
const interestModalVisible = ref(false)
const editInterestRate = ref(props.room.config.interestRate ?? 1.5)
const editInterestIntervalMin = ref(props.room.config.interestIntervalMin ?? 10)

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

const totalPropertyCount = computed(() =>
  (props.room.properties || []).length
)

// ─── 存款 / 贷款汇总 ──────────────────────────────────────────────────────────
const activeDeposits = computed(() =>
  (props.room.deposits || []).filter(d => d.status === 'active')
)
const activeLoans = computed(() =>
  (props.room.loans || []).filter(l => l.status === 'active')
)
const totalDeposits = computed(() =>
  activeDeposits.value.reduce((s, d) => s + Number(d.amount || 0), 0)
)
const totalLoans = computed(() =>
  activeLoans.value.reduce((s, l) => s + Number(l.remaining || 0), 0)
)
const activeDepositCount = computed(() => activeDeposits.value.length)
const activeLoanCount = computed(() => activeLoans.value.length)

const lottery = computed(() => ({
  ticketPrice: 200,
  numberCount: 30,
  drawIntervalMin: 30,
  jackpotPool: 0,
  tickets: [],
  ...(props.room.config?.lottery || {})
}))

const lotteryBankBonusPreview = computed(() =>
  Math.max(0, Math.floor(Math.max(0, Number(props.room.config?.bankBalance || 0)) * 0.1))
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
const interestCountdownSecs = computed(() => {
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

const interestCountdownLabel = computed(() => {
  const secs = interestCountdownSecs.value
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

const lotteryCountdownSecs = computed(() => {
  if (isPaused.value) {
    const pausedAt = props.room.config.pausedAt ?? Date.now()
    const nextAt = Number(lottery.value.lastDrawAt || props.room.createdAt) + Number(lottery.value.drawIntervalMin || 30) * 60 * 1000
    return Math.max(0, Math.round((nextAt - pausedAt) / 1000))
  }
  void elapsedSeconds.value
  const nextAt = Number(lottery.value.lastDrawAt || props.room.createdAt) + Number(lottery.value.drawIntervalMin || 30) * 60 * 1000
  return Math.max(0, Math.round((nextAt - Date.now()) / 1000))
})

const lotteryCountdownLabel = computed(() => {
  const secs = lotteryCountdownSecs.value
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

async function saveInterestSettings() {
  const rate = Number(editInterestRate.value)
  const intervalMin = Number(editInterestIntervalMin.value)
  if (!(rate >= 0 && rate <= 100)) return alert('请输入有效利率（0-100%）')
  if (!(intervalMin >= 1)) return alert('结算周期最小为 1 分钟')
  try {
    const res = await apiWithToken(`/api/rooms/${props.room.id}/update-interest`, props.myToken, {
      method: 'POST',
      body: { interestRate: rate, interestIntervalMin: intervalMin }
    })
    emit('room-updated', res.room)
    interestModalVisible.value = false
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
/* ══ 整体布局 ══ */
.banker-dashboard {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  overflow: hidden;
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
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  flex: 1;
}

/* ══ KPI 行 ══ */
.kpi-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
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
.kpi-purple { color: #a78bfa; }
.kpi-teal { color: #2dd4bf; }
.kpi-orange { color: #fb923c; }

.kpi-sub {
  font-size: 11px;
  color: #64748b;
  margin-top: 2px;
}

.interest-next {
  font-variant-numeric: tabular-nums;
  letter-spacing: .04em;
}

.kpi-card--deposit {
  border-color: rgba(45,212,191,.25);
  background: rgba(45,212,191,.06);
}
.kpi-card--loan {
  border-color: rgba(251,146,60,.25);
  background: rgba(251,146,60,.06);
}
.kpi-card--lottery {
  border-color: rgba(167,139,250,.25);
  background: rgba(124,58,237,.08);
}

/* ══ 银行资金卡片（带利息徽标） ══ */
.kpi-card--bank {
  cursor: pointer;
  position: relative;
  transition: border-color .2s, background .2s;
}
.kpi-card--bank:hover {
  border-color: rgba(52,211,153,.4);
  background: rgba(52,211,153,.07);
}

.kpi-card-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 6px;
}

.interest-rate-text {
  font-size: 11px;
  font-weight: 700;
  color: #34d399;
  background: rgba(52,211,153,.15);
  border: 1px solid rgba(52,211,153,.3);
  border-radius: 6px;
  padding: 1px 5px;
  line-height: 1.4;
}

.interest-countdown {
  font-size: 10px;
  font-weight: 600;
  color: #a7b0cf;
  font-variant-numeric: tabular-nums;
  letter-spacing: .04em;
  margin-top: 4px;
}

.kpi-interest-countdown {
  font-size: 22px;
  font-weight: 800;
  color: #eef2ff;
  margin-top: 8px;
}

.interest-countdown--soon {
  color: #f87171;
  animation: pulse-countdown .8s ease-in-out infinite;
}

@keyframes pulse-countdown {
  0%, 100% { opacity: 1; }
  50% { opacity: .5; }
}

/* ══ 利息设置弹窗 ══ */
.interest-modal {
  width: min(94vw, 420px);
}

.interest-info-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 14px;
}

.interest-info-item {
  background: rgba(255,255,255,.05);
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 12px;
  padding: 10px 12px;
  text-align: center;
}

.interest-info-label {
  font-size: 10px;
  color: #a7b0cf;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .06em;
  margin-bottom: 4px;
}

.interest-info-val {
  font-size: 18px;
  font-weight: 800;
  color: #eef2ff;
  font-variant-numeric: tabular-nums;
}

.interest-preview {
  background: rgba(52,211,153,.08);
  border: 1px solid rgba(52,211,153,.2);
  border-radius: 12px;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 600;
  color: #a7b0cf;
  margin-bottom: 14px;
  text-align: center;
}

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
  margin: 8px 0 4px;
  color: #eef2ff;
}

.pc-assets-row {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 10px;
}

.pc-assets-label {
  font-size: 11px;
  color: #a7b0cf;
  font-weight: 600;
}

.pc-assets-val {
  font-size: 13px;
  font-weight: 700;
  color: #a78bfa;
}

.pc-assets-breakdown {
  font-size: 11px;
  color: #6d5fb5;
}

.pc-prop-row {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 10px;
  margin-top: -6px;
}

.pc-prop-label {
  font-size: 11px;
  color: #a7b0cf;
  font-weight: 600;
}

.pc-prop-val {
  font-size: 13px;
  font-weight: 700;
  color: #fbbf24;
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

.panel-count {
  font-size: 12px;
  font-weight: 600;
  color: #a7b0cf;
  background: rgba(255,255,255,.08);
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 8px;
  padding: 2px 8px;
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
    grid-template-columns: repeat(4, 1fr);
  }  .topbar-center {
    display: none;
  }
}

/* ══ 暂停覆盖层 ══ */
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
