<template>
  <section class="setup">
    <!-- 创建新房间 -->
    <div class="card create-card">
      <h1 class="setup-title">大富翁银行</h1>
      <div class="setup-form-grid">
        <div class="field">
          <label>人均金额</label>
          <div class="setup-input money-input">
            <span class="input-prefix">¥</span>
            <input
              :value="startingMoney"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              @input="startingMoney = parseAmount($event.target.value)"
              @blur="startingMoney = normalizeAmount(startingMoney, DEFAULT_STARTING_MONEY)"
            />
            <div class="stepper-actions">
              <button type="button" aria-label="减少人均金额" @click="adjustAmount('startingMoney', -100)">-</button>
              <button type="button" aria-label="增加人均金额" @click="adjustAmount('startingMoney', 100)">+</button>
            </div>
          </div>
        </div>
        <div class="field">
          <label>人数</label>
          <div class="player-count-picker" role="radiogroup" aria-label="人数">
            <button
              v-for="n in playerOptions"
              :key="n"
              type="button"
              :class="{ active: playerCount === n }"
              :aria-checked="playerCount === n"
              role="radio"
              @click="playerCount = n"
            >
              {{ n }}
            </button>
          </div>
        </div>
      </div>

      <div class="advanced-toggle">
        <div>
          <strong>高级选项</strong>
          <span>过起点奖励、彩票开关和票价</span>
        </div>
        <label class="switch-row">
          <input v-model="advancedEnabled" type="checkbox" />
          <span class="switch-ui" aria-hidden="true"><span></span></span>
          <span>{{ advancedEnabled ? '已打开' : '默认' }}</span>
        </label>
      </div>

      <div v-if="advancedEnabled" class="advanced-panel">
        <div class="setup-form-grid">
          <div class="field">
            <label>过起点奖励金额</label>
            <div class="setup-input money-input">
              <span class="input-prefix">¥</span>
              <input
                :value="goSalary"
                type="text"
                inputmode="numeric"
                autocomplete="off"
                @input="goSalary = parseAmount($event.target.value)"
                @blur="goSalary = normalizeAmount(goSalary, DEFAULT_GO_SALARY)"
              />
              <div class="stepper-actions">
                <button type="button" aria-label="减少过起点奖励金额" @click="adjustAmount('goSalary', -50)">-</button>
                <button type="button" aria-label="增加过起点奖励金额" @click="adjustAmount('goSalary', 50)">+</button>
              </div>
            </div>
          </div>
          <div class="lottery-settings">
            <div class="lottery-settings-head">
              <div>
                <strong>彩票系统</strong>
                <span>票价和开奖时间</span>
              </div>
              <label class="switch-row">
                <input v-model="lotteryEnabled" type="checkbox" />
                <span class="switch-ui" aria-hidden="true"><span></span></span>
                <span>{{ lotteryEnabled ? '开启' : '关闭' }}</span>
              </label>
            </div>
            <div v-if="lotteryEnabled" class="lottery-fields">
              <div class="field">
                <label>彩票单张价格</label>
                <div class="setup-input money-input">
                  <span class="input-prefix">¥</span>
                  <input
                    :value="lotteryTicketPrice"
                    type="text"
                    inputmode="numeric"
                    autocomplete="off"
                    @input="lotteryTicketPrice = parseAmount($event.target.value)"
                    @blur="lotteryTicketPrice = normalizeAmount(lotteryTicketPrice, DEFAULT_LOTTERY_TICKET_PRICE)"
                  />
                  <div class="stepper-actions">
                    <button type="button" aria-label="减少彩票单张价格" @click="adjustAmount('lotteryTicketPrice', -50)">-</button>
                    <button type="button" aria-label="增加彩票单张价格" @click="adjustAmount('lotteryTicketPrice', 50)">+</button>
                  </div>
                </div>
              </div>
              <div class="field">
                <label>开奖时间</label>
                <div class="setup-input">
                  <input
                    :value="lotteryDrawIntervalMin"
                    type="text"
                    inputmode="numeric"
                    autocomplete="off"
                    @input="lotteryDrawIntervalMin = parseAmount($event.target.value)"
                    @blur="lotteryDrawIntervalMin = normalizeAmount(lotteryDrawIntervalMin, DEFAULT_LOTTERY_DRAW_INTERVAL_MIN, 1)"
                  />
                  <span class="input-suffix">分钟</span>
                  <div class="stepper-actions">
                    <button type="button" aria-label="缩短开奖时间" @click="adjustAmount('lotteryDrawIntervalMin', -5, 1)">-</button>
                    <button type="button" aria-label="延长开奖时间" @click="adjustAmount('lotteryDrawIntervalMin', 5, 1)">+</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <button class="primary" style="width:100%;" @click="handleCreate">创建房间</button>
      <p class="muted">创建后会显示庄家链接和每位玩家的专属链接，发给对应的人即可。</p>
    </div>

    <div class="history-drawer" v-if="historyLoaded">
      <button class="history-toggle" type="button" @click="historyOpen = true">
        <span>历史游戏</span>
        <strong>{{ historyRooms.length }} 局</strong>
      </button>
    </div>

    <Teleport to="body">
      <Transition name="history-fade">
        <div v-if="historyOpen" class="history-modal-backdrop" @click.self="historyOpen = false">
          <div class="history-modal" role="dialog" aria-modal="true" aria-labelledby="historyTitle">
            <div class="history-modal-head">
              <div>
                <h2 id="historyTitle">历史游戏</h2>
                <p>{{ historyRooms.length ? `共 ${historyRooms.length} 局记录` : '暂无历史游戏记录' }}</p>
              </div>
              <button class="history-close" type="button" aria-label="关闭历史游戏" @click="historyOpen = false">×</button>
            </div>

            <div v-if="historyRooms.length === 0" class="empty history-empty">暂无历史游戏记录</div>
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
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { apiFetch, fmt } from '../composables/api.js'

const emit = defineEmits(['created', 'resume'])

const DEFAULT_PLAYER_COUNT = 4
const DEFAULT_STARTING_MONEY = 1500
const DEFAULT_GO_SALARY = 200
const DEFAULT_LOTTERY_ENABLED = true
const DEFAULT_LOTTERY_TICKET_PRICE = 200
const DEFAULT_LOTTERY_DRAW_INTERVAL_MIN = 30

const playerOptions = [2, 3, 4, 5, 6, 7, 8]

const playerCount = ref(DEFAULT_PLAYER_COUNT)
const startingMoney = ref(DEFAULT_STARTING_MONEY)
const advancedEnabled = ref(false)
const goSalary = ref(DEFAULT_GO_SALARY)
const lotteryEnabled = ref(DEFAULT_LOTTERY_ENABLED)
const lotteryTicketPrice = ref(DEFAULT_LOTTERY_TICKET_PRICE)
const lotteryDrawIntervalMin = ref(DEFAULT_LOTTERY_DRAW_INTERVAL_MIN)
const historyRooms = ref([])
const historyLoaded = ref(false)
const historyOpen = ref(false)
const confirmDeleteId = ref(null)

function parseAmount(value) {
  const digits = String(value).replace(/[^\d]/g, '')
  return digits === '' ? '' : Number(digits)
}

function normalizeAmount(value, fallback, min = 0) {
  const amount = Math.max(min, Math.floor(Number(value)))
  return Number.isFinite(amount) ? amount : fallback
}

function adjustAmount(field, delta, min = 0) {
  const refs = { startingMoney, goSalary, lotteryTicketPrice, lotteryDrawIntervalMin }
  const current = normalizeAmount(refs[field].value, min, min)
  refs[field].value = Math.max(min, current + delta)
}

async function handleCreate() {
  try {
    startingMoney.value = normalizeAmount(startingMoney.value, DEFAULT_STARTING_MONEY)
    goSalary.value = normalizeAmount(goSalary.value, DEFAULT_GO_SALARY)
    lotteryTicketPrice.value = normalizeAmount(lotteryTicketPrice.value, DEFAULT_LOTTERY_TICKET_PRICE)
    lotteryDrawIntervalMin.value = normalizeAmount(lotteryDrawIntervalMin.value, DEFAULT_LOTTERY_DRAW_INTERVAL_MIN, 1)

    const data = await apiFetch('/api/rooms', {
      method: 'POST',
      body: {
        playerCount: playerCount.value,
        startingMoney: startingMoney.value,
        goSalary: advancedEnabled.value ? goSalary.value : DEFAULT_GO_SALARY,
        lotteryEnabled: advancedEnabled.value ? lotteryEnabled.value : DEFAULT_LOTTERY_ENABLED,
        lotteryTicketPrice: advancedEnabled.value && lotteryEnabled.value
          ? lotteryTicketPrice.value
          : DEFAULT_LOTTERY_TICKET_PRICE,
        lotteryDrawIntervalMin: advancedEnabled.value && lotteryEnabled.value
          ? lotteryDrawIntervalMin.value
          : DEFAULT_LOTTERY_DRAW_INTERVAL_MIN
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
    if (historyRooms.value.length === 0) historyOpen.value = false
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
    historyOpen.value = false
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
.setup {
  width: min(720px, 100%);
  min-height: calc(100vh - 48px);
  min-height: calc(100dvh - 48px);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  justify-content: center;
  position: relative;
  isolation: isolate;
}
.setup::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  background:
    linear-gradient(180deg, rgba(8,16,31,.58), rgba(8,16,31,.78)),
    radial-gradient(circle at 50% 42%, rgba(8,16,31,.12), rgba(8,16,31,.78) 72%),
    url("/assets/monopoly-bank-bg.png") center / cover no-repeat;
}
.create-card {
  background: rgba(17,24,39,.78);
  border-color: rgba(255,255,255,.18);
}
.setup-title {
  margin: 0 0 24px;
  font-size: 46px;
  line-height: 1.05;
  font-weight: 900;
  letter-spacing: 0;
}
.setup-form-grid { display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
.history-drawer {
  margin-top: 12px;
}
.history-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0,0,0,.58);
  backdrop-filter: blur(10px);
}
.history-fade-enter-active,
.history-fade-leave-active {
  transition: opacity .18s ease;
}
.history-fade-enter-active .history-modal,
.history-fade-leave-active .history-modal {
  transition: transform .2s ease, opacity .18s ease;
}
.history-fade-enter-from,
.history-fade-leave-to {
  opacity: 0;
}
.history-fade-enter-from .history-modal,
.history-fade-leave-to .history-modal {
  opacity: 0;
  transform: translateY(8px) scale(.98);
}
.history-modal {
  width: min(720px, 100%);
  max-height: min(680px, calc(100dvh - 40px));
  display: flex;
  flex-direction: column;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 22px;
  background: #111827;
  box-shadow: var(--shadow);
}
.history-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.history-modal-head h2 {
  margin: 0;
  font-size: 24px;
}
.history-modal-head p {
  margin: 4px 0 0;
  font-size: 13px;
}
.history-close {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: rgba(255,255,255,.08);
  color: var(--text);
  font-size: 24px;
  line-height: 1;
}
.history-toggle {
  width: 100%;
  min-height: 46px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: rgba(17,24,39,.68);
  color: var(--text);
  box-shadow: 0 10px 28px rgba(0,0,0,.18);
  backdrop-filter: blur(12px);
}
.history-toggle span {
  color: var(--muted);
  font-weight: 700;
}
.history-toggle strong {
  color: #c4b5fd;
  font-size: 13px;
}
.history-list { display:flex; flex-direction:column; gap:10px; }
.history-empty,
.history-list {
  margin-top: 10px;
}
.history-modal .history-list {
  min-height: 0;
  overflow: auto;
  padding-right: 2px;
}
.history-modal .history-item {
  animation: historyItemIn .18s ease both;
}
.history-modal .history-item:nth-child(2) { animation-delay: .025s; }
.history-modal .history-item:nth-child(3) { animation-delay: .05s; }
.history-modal .history-item:nth-child(4) { animation-delay: .075s; }
.history-modal .history-item:nth-child(n + 5) { animation-delay: .1s; }
@keyframes historyItemIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
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
.setup-input {
  width: 100%;
  min-height: 48px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 5px 4px 13px;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: rgba(255,255,255,.06);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.05);
  transition: border-color .16s, background .16s, box-shadow .16s;
}
.setup-input:focus-within {
  border-color: rgba(124,58,237,.7);
  background: rgba(124,58,237,.1);
  box-shadow: 0 0 0 3px rgba(124,58,237,.18);
}
.setup-input input {
  min-width: 0;
  flex: 1;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 18px;
  font-weight: 800;
  appearance: none;
}
.input-prefix {
  color: #c4b5fd;
  font-weight: 800;
}
.input-suffix {
  color: var(--muted);
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}
.stepper-actions {
  display: inline-flex;
  gap: 4px;
}
.stepper-actions button,
.player-count-picker button {
  border: 1px solid var(--line);
  background: rgba(255,255,255,.08);
  color: var(--text);
}
.stepper-actions button {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  padding: 0;
  border-radius: 10px;
  font-size: 18px;
  font-weight: 800;
}
.stepper-actions button:hover,
.player-count-picker button:hover {
  background: rgba(255,255,255,.13);
}
.player-count-picker {
  min-height: 48px;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
  padding: 5px;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: rgba(255,255,255,.06);
}
.player-count-picker button {
  min-width: 0;
  padding: 0;
  border-radius: 10px;
  font-weight: 800;
}
.player-count-picker button.active {
  background: linear-gradient(135deg, var(--accent), #5b21b6);
  border-color: rgba(196,181,253,.55);
  color: #fff;
  box-shadow: 0 8px 18px rgba(91,33,182,.25);
}
.advanced-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin: 4px 0 16px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: rgba(255,255,255,.045);
}
.advanced-toggle strong {
  display: block;
  font-size: 15px;
}
.advanced-toggle > div > span {
  display: block;
  margin-top: 3px;
  color: var(--muted);
  font-size: 12px;
}
.advanced-panel {
  margin: -4px 0 16px;
  padding: 14px;
  border: 1px solid rgba(124,58,237,.28);
  border-radius: 18px;
  background: rgba(124,58,237,.09);
}
.lottery-settings {
  grid-column: 1 / -1;
  padding: 12px;
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 16px;
  background: rgba(255,255,255,.045);
}
.lottery-settings-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 12px;
}
.lottery-settings-head strong {
  display: block;
  font-size: 15px;
}
.lottery-settings-head > div > span {
  display: block;
  margin-top: 3px;
  color: var(--muted);
  font-size: 12px;
}
.lottery-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.lottery-fields .field {
  margin-bottom: 0;
}
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
@media (max-width: 980px) {
  .setup-form-grid { grid-template-columns: 1fr; }
  .lottery-fields { grid-template-columns: 1fr; }
}
@media (max-width: 520px) {
  .setup {
    min-height: calc(100vh - 32px);
    min-height: calc(100dvh - 32px);
  }
  .setup-title {
    margin-bottom: 20px;
    font-size: 36px;
  }
  .advanced-toggle { align-items: flex-start; flex-direction: column; }
  .lottery-settings-head { align-items: flex-start; flex-direction: column; }
  .player-count-picker { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .player-count-picker button { min-height: 34px; }
}
</style>
