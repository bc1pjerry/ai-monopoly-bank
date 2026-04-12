<template>
  <div class="player-root">
    <!-- 顶部 hero -->
    <div class="hero">
      <div>
        <h1>大富翁银行</h1>
        <p>房间 {{ room.id }} · {{ room.config.playerCount }} 人局</p>
      </div>
      <div class="toolbar">
        <span class="role-label role-player">{{ me?.name }}</span>
        <button class="end-btn" @click="endGame">结束游戏</button>
      </div>
    </div>

    <!-- 我的余额卡片（始终可见） -->
    <div class="my-balance-card">
      <div class="muted" style="font-size:14px; margin-bottom:6px;">我的余额</div>
      <div class="big-bal">¥ {{ fmt(me?.balance) }}</div>
      <div style="display:flex; align-items:center; justify-content:center; gap:10px; margin-top:8px;">
        <div v-if="!editingName" class="muted name-clickable" @click="startEditName">
          {{ me?.name }} <span class="edit-icon">✏️</span>
        </div>
        <div v-else style="display:flex; align-items:center; gap:6px;">
          <input
            ref="nameInput"
            v-model="newName"
            class="name-input"
            maxlength="20"
            @keyup.enter="submitRename"
            @keyup.escape="cancelEditName"
          />
          <button class="primary" style="padding:4px 12px; font-size:13px;" @click="submitRename">确定</button>
          <button style="padding:4px 10px; font-size:13px;" @click="cancelEditName">取消</button>
        </div>
      </div>
    </div>

    <!-- 页面主内容区 -->
    <div class="page-content">

      <!-- ── 主页：转账 ── -->
      <div v-show="activeMainTab === 'home'">
        <!-- 选项卡导航（向玩家 / 向银行） -->
        <div class="tab-bar">
          <button
            class="tab-btn"
            :class="{ active: activeTransferTab === 0 }"
            @click="activeTransferTab = 0"
          >向玩家转账</button>
          <button
            class="tab-btn"
            :class="{ active: activeTransferTab === 1 }"
            @click="activeTransferTab = 1"
          >向银行缴款</button>
        </div>

        <!-- 滑动容器 -->
        <div
          class="tab-slider-wrap"
          @touchstart="onTransferTouchStart"
          @touchend="onTransferTouchEnd"
        >
          <div class="tab-slider" :style="{ transform: `translateX(${-activeTransferTab * 100}%)` }">
            <!-- 转账面板 -->
            <div class="tab-panel card">
              <h2 style="margin-top:0;">向其他玩家转账</h2>
              <p class="muted">选择收款人，输入金额后确认。</p>
              <div class="field">
                <label>收款人</label>
                <select v-model="toPlayerId">
                  <option v-for="p in others" :key="p.id" :value="p.id">{{ p.name }}（¥{{ fmt(p.balance) }}）</option>
                </select>
              </div>
              <NumPad v-model="transferAmount" :quickAmounts="[50,100,200,500,1000]" style="margin-bottom:12px;" />
              <button class="primary" style="width:100%;" @click="submitTransfer">确认转账</button>
            </div>

            <!-- 向银行缴款面板 -->
            <div class="tab-panel card">
              <h2 style="margin-top:0;">向银行缴款</h2>
              <p class="muted">只能转出，不能收回。</p>

              <!-- 缴款类型选择 -->
              <div class="field">
                <label>缴款类型</label>
                <div class="pay-type-group">
                  <button
                    v-for="t in payTypes"
                    :key="t.value"
                    class="pay-type-btn"
                    :class="{ active: fineType === t.value }"
                    @click="selectPayType(t.value)"
                  >
                    <span class="pay-type-icon">{{ t.icon }}</span>
                    <span>{{ t.label }}</span>
                  </button>
                </div>
              </div>

              <!-- 买地：OCR 地契入口 -->
              <div v-if="fineType === 'buy-land'" class="deed-entry">
                <button class="deed-scan-btn" @click="showDeedOcr = true">
                  <svg viewBox="0 0 20 20" fill="none" class="deed-scan-icon">
                    <rect x="1" y="5" width="18" height="13" rx="3" stroke="currentColor" stroke-width="1.6"/>
                    <circle cx="10" cy="11" r="3.5" stroke="currentColor" stroke-width="1.6"/>
                    <path d="M7 5 L8.5 2.5 H11.5 L13 5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
                  </svg>
                  拍摄地契 · 自动录入
                </button>
                <p class="deed-hint">拍照后系统将识别地产名称、价格及过路费</p>
              </div>

              <div class="field">
                <label>备注</label>
                <input v-model="fineNote" type="text" maxlength="60" :placeholder="fineNotePlaceholder" />
              </div>
              <NumPad v-model="fineAmount" :quickAmounts="fineQuickAmounts" style="margin-bottom:12px;" />
              <button class="red-btn" style="width:100%; border:0;" @click="submitFine">确认缴款</button>
            </div>
          </div>
        </div>
      </div>

      <!-- ── 战况：所有玩家 ── -->
      <div v-show="activeMainTab === 'battle'">
        <section class="card">
          <h2 style="margin-top:0;">所有玩家战况</h2>
          <div class="players">
            <div class="player" :class="{ 'is-me': p.id === myPlayerId }" v-for="p in room.players" :key="p.id">
              <div class="player-top">
                <div class="name">{{ p.name }}</div>
                <span class="me-badge" v-if="p.id === myPlayerId">我</span>
              </div>
              <div class="balance">¥ {{ fmt(p.balance) }}</div>
              <BalanceChart
                :logs="room.logs"
                :playerName="p.name"
                :startBalance="room.config.startingMoney"
              />
            </div>
          </div>
        </section>
      </div>

      <!-- ── 流水 ── -->
      <div v-show="activeMainTab === 'logs'">
        <section class="card">
          <h2 style="margin-top:0;">交易流水</h2>
          <LogList :logs="room.logs" :logsTotal="room.logsTotal" :roomId="room.id" :token="myToken" />
        </section>
      </div>

    </div>

    <!-- 地契 OCR 弹窗 -->
    <DeedOcrModal v-if="showDeedOcr" @close="showDeedOcr = false" />

    <!-- 底部 tabbar（固定在视窗最底部） -->    <nav class="bottom-tabbar">
      <!-- 主页：钱袋 -->
      <button
        class="tabbar-item"
        :class="{ active: activeMainTab === 'home' }"
        @click="activeMainTab = 'home'"
      >
        <svg class="tabbar-icon" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- 袋口绳结 -->
          <path d="M12 8 C12 5 14 3.5 16 3.5 C18 3.5 20 5 20 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
          <!-- 袋口收口 -->
          <path d="M11 9 Q16 7 21 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
          <!-- 胖圆肚钱袋 -->
          <path d="M10 10 Q5 13 5 18 Q5 26 16 27 Q27 26 27 18 Q27 13 22 10 Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" fill="currentColor" fill-opacity="0.15"/>
          <!-- 钱袋上的 $ 符号 -->
          <text x="16" y="22" text-anchor="middle" font-size="9" font-weight="700" fill="currentColor" font-family="sans-serif">$</text>
          <!-- 底部小圆润感 -->
          <path d="M10 22 Q16 28 22 22" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none" opacity="0.4"/>
        </svg>
        <span>主页</span>
      </button>

      <!-- 战况：大富翁棋子（圆头小人 + 底座） -->
      <button
        class="tabbar-item"
        :class="{ active: activeMainTab === 'battle' }"
        @click="activeMainTab = 'battle'"
      >
        <svg class="tabbar-icon" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- 帽子 -->
          <rect x="11" y="4" width="10" height="3" rx="1.5" stroke="currentColor" stroke-width="1.8" fill="currentColor" fill-opacity="0.2"/>
          <rect x="13" y="3" width="6" height="2" rx="1" stroke="currentColor" stroke-width="1.5" fill="currentColor" fill-opacity="0.15"/>
          <!-- 头部圆 -->
          <circle cx="16" cy="11" r="4" stroke="currentColor" stroke-width="2" fill="currentColor" fill-opacity="0.15"/>
          <!-- 身体 -->
          <path d="M12 15 Q10 18 11 22 L21 22 Q22 18 20 15 Q18 14 16 14 Q14 14 12 15Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" fill="currentColor" fill-opacity="0.15"/>
          <!-- 底座 -->
          <rect x="9" y="22" width="14" height="3.5" rx="1.75" stroke="currentColor" stroke-width="1.8" fill="currentColor" fill-opacity="0.2"/>
          <rect x="11" y="25.5" width="10" height="2" rx="1" stroke="currentColor" stroke-width="1.5" fill="currentColor" fill-opacity="0.15"/>
        </svg>
        <span>战况</span>
      </button>

      <!-- 流水：金币账本卷轴 -->
      <button
        class="tabbar-item"
        :class="{ active: activeMainTab === 'logs' }"
        @click="activeMainTab = 'logs'"
      >
        <svg class="tabbar-icon" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- 卷轴上卷 -->
          <ellipse cx="16" cy="5.5" rx="8" ry="2.5" stroke="currentColor" stroke-width="1.8" fill="currentColor" fill-opacity="0.2"/>
          <!-- 卷轴主体 -->
          <rect x="8" y="5.5" width="16" height="19" stroke="currentColor" stroke-width="1.8" fill="currentColor" fill-opacity="0.1"/>
          <!-- 卷轴下卷 -->
          <ellipse cx="16" cy="24.5" rx="8" ry="2.5" stroke="currentColor" stroke-width="1.8" fill="currentColor" fill-opacity="0.2"/>
          <!-- 金币圆 -->
          <circle cx="16" cy="13" r="4.5" stroke="currentColor" stroke-width="1.8" fill="currentColor" fill-opacity="0.18"/>
          <text x="16" y="16.5" text-anchor="middle" font-size="6.5" font-weight="800" fill="currentColor" font-family="sans-serif">¥</text>
          <!-- 横线装饰 -->
          <line x1="11" y1="20" x2="21" y2="20" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.5"/>
          <line x1="12" y1="22.2" x2="20" y2="22.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.3"/>
        </svg>
        <span>流水</span>
      </button>
    </nav>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import LogList from './LogList.vue'
import BalanceChart from './BalanceChart.vue'
import NumPad from './NumPad.vue'
import DeedOcrModal from './DeedOcrModal.vue'
import { fmt, apiWithToken } from '../composables/api.js'

const props = defineProps({ room: Object, myToken: String, myPlayerId: String })
const emit = defineEmits(['room-updated', 'end-game'])

// ─── 底部主 tab ───────────────────────────────────────────────────────────────
const activeMainTab = ref('home') // 'home' | 'battle' | 'logs'

// ─── 转账子选项卡 ─────────────────────────────────────────────────────────────
const activeTransferTab = ref(0)

// 触摸滑动（转账子 tab）
let transferTouchStartX = 0
function onTransferTouchStart(e) { transferTouchStartX = e.touches[0].clientX }
function onTransferTouchEnd(e) {
  const dx = e.changedTouches[0].clientX - transferTouchStartX
  if (Math.abs(dx) < 40) return
  if (dx < 0 && activeTransferTab.value < 1) activeTransferTab.value = 1
  if (dx > 0 && activeTransferTab.value > 0) activeTransferTab.value = 0
}

const me = computed(() => props.room.players.find(p => p.id === props.myPlayerId))
const others = computed(() => props.room.players.filter(p => p.id !== props.myPlayerId))

const toPlayerId = ref(others.value[0]?.id || '')
const transferAmount = ref(null)
const fineAmount = ref(null)
const fineNote = ref('')

// ─── 缴款类型 ──────────────────────────────────────────────────────────────────
const payTypes = [
  { value: 'buy-land',  icon: '🏠', label: '买地' },
  { value: 'build',     icon: '🏗️', label: '建房' },
  { value: 'fine',      icon: '💸', label: '交罚款' },
]
const fineType = ref('fine')
const showDeedOcr = ref(false)

function selectPayType(type) {
  fineType.value = type
  fineNote.value = ''
  fineAmount.value = null
}

const fineNotePlaceholder = computed(() => {
  if (fineType.value === 'buy-land') return '例如 台北101'
  if (fineType.value === 'build') return '例如 台北101 盖第2栋'
  return '例如 闯红灯罚款'
})

// ─── 改名 ─────────────────────────────────────────────────────────────────────
const editingName = ref(false)
const newName = ref('')
const nameInput = ref(null)

function startEditName() {
  newName.value = me.value?.name || ''
  editingName.value = true
  nextTick(() => nameInput.value?.focus())
}

function cancelEditName() {
  editingName.value = false
}

async function submitRename() {
  const trimmed = newName.value.trim()
  if (!trimmed) return alert('名字不能为空')
  if (trimmed === me.value?.name) { editingName.value = false; return }
  try {
    const res = await apiWithToken(`/api/rooms/${props.room.id}/rename`, props.myToken, {
      method: 'POST',
      body: { playerId: props.myPlayerId, name: trimmed }
    })
    editingName.value = false
    emit('room-updated', res.room)
  } catch (e) { alert('改名失败：' + e.message) }
}

// ─── 向银行缴款的金额偏好缓存（localStorage） ────────────────────────────────
const FINE_HISTORY_KEY = 'monopoly_fine_history'
const MAX_HISTORY = 20
const MAX_FAVORITES = 3
const DEFAULT_QUICK = [50, 100, 200, 500, 1000]

function loadFineHistory() {
  try {
    return JSON.parse(localStorage.getItem(FINE_HISTORY_KEY) || '[]')
  } catch { return [] }
}

function saveFineHistory(history) {
  localStorage.setItem(FINE_HISTORY_KEY, JSON.stringify(history))
}

function recordFineAmount(amount) {
  const history = loadFineHistory()
  history.push(amount)
  saveFineHistory(history.slice(-MAX_HISTORY))
  refreshFavorites()
}

function calcFavorites() {
  const history = loadFineHistory()
  if (!history.length) return []
  const freq = {}
  for (const v of history) freq[v] = (freq[v] || 0) + 1
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .map(([v]) => Number(v))
    .filter(v => !DEFAULT_QUICK.includes(v))
    .slice(0, MAX_FAVORITES)
}

const favoriteAmounts = ref(calcFavorites())

const fineQuickAmounts = computed(() => {
  const favs = favoriteAmounts.value
  return [...favs, ...DEFAULT_QUICK.filter(v => !favs.includes(v))]
})

function refreshFavorites() {
  favoriteAmounts.value = calcFavorites()
}

// ─── 转账 ─────────────────────────────────────────────────────────────────────
async function submitTransfer() {
  if (!(transferAmount.value > 0)) return alert('请输入正确金额')
  if (!toPlayerId.value) return alert('请选择收款人')
  try {
    const res = await apiWithToken(`/api/rooms/${props.room.id}/action`, props.myToken, {
      method: 'POST',
      body: { type: 'transfer', fromPlayerId: props.myPlayerId, toPlayerId: toPlayerId.value, amount: transferAmount.value }
    })
    transferAmount.value = null
    emit('room-updated', res.room)
  } catch (e) { alert('转账失败：' + e.message) }
}

async function submitFine() {
  if (!(fineAmount.value > 0)) return alert('请输入正确金额')
  const typeLabel = payTypes.find(t => t.value === fineType.value)?.label || '缴款'
  const confirmMsg = fineNote.value.trim()
    ? `确认向银行【${typeLabel}】缴款 ¥${fineAmount.value}（${fineNote.value.trim()}）？`
    : `确认向银行【${typeLabel}】缴款 ¥${fineAmount.value}？`
  if (!confirm(confirmMsg)) return
  const noteText = [typeLabel, fineNote.value.trim()].filter(Boolean).join(' · ')
  try {
    const res = await apiWithToken(`/api/rooms/${props.room.id}/action`, props.myToken, {
      method: 'POST',
      body: { type: 'pay-fine', amount: fineAmount.value, note: noteText }
    })
    recordFineAmount(fineAmount.value)
    fineAmount.value = null
    fineNote.value = ''
    emit('room-updated', res.room)
  } catch (e) { alert('操作失败：' + e.message) }
}

function endGame() {
  if (!confirm('确认结束本局游戏并返回首页？')) return
  emit('end-game')
}
</script>

<style scoped>
/* ── 整体布局 ── */
.player-root {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding-bottom: 72px; /* 给底部 tabbar 留空间 */
}

.page-content {
  flex: 1;
}

/* ── 转账子 tab ── */
.tab-bar {
  display: flex;
  gap: 0;
  margin-bottom: 14px;
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 14px;
  padding: 4px;
}
.tab-btn {
  flex: 1;
  padding: 10px 0;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  color: #a7b0cf;
  background: transparent;
  border: 0;
  transition: .2s ease;
}
.tab-btn.active {
  background: linear-gradient(135deg, var(--accent), #5b21b6);
  color: white;
  box-shadow: 0 2px 12px rgba(124,58,237,.4);
}
.tab-btn:hover:not(.active) {
  color: #e2e8f0;
  transform: none;
}

.tab-slider-wrap {
  overflow: hidden;
  border-radius: 22px;
}
.tab-slider {
  display: flex;
  transition: transform .3s cubic-bezier(.4,0,.2,1);
  will-change: transform;
}
.tab-panel {
  min-width: 100%;
  flex-shrink: 0;
}

/* ── 底部 tabbar ── */
.bottom-tabbar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 64px;
  display: flex;
  align-items: stretch;
  background: rgba(8, 16, 31, 0.92);
  border-top: 1px solid rgba(255,255,255,.10);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  z-index: 100;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.tabbar-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  background: transparent;
  border: 0;
  border-radius: 0;
  color: rgba(167,176,207,.55);
  font-size: 11px;
  font-weight: 600;
  padding: 8px 0;
  transition: color .18s ease;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.tabbar-item:hover {
  transform: none;
  color: rgba(167,176,207,.8);
}

.tabbar-item.active {
  color: #a78bfa;
}

.tabbar-item.active .tabbar-icon {
  stroke: #a78bfa;
  filter: drop-shadow(0 0 6px rgba(124,58,237,.6));
}

.tabbar-icon {
  width: 22px;
  height: 22px;
  stroke: currentColor;
  transition: stroke .18s ease, filter .18s ease;
}

/* ── 缴款类型选择 ── */
.pay-type-group {
  display: flex;
  gap: 8px;
}
.pay-type-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 10px 4px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  color: #a7b0cf;
  background: rgba(255,255,255,.06);
  border: 1.5px solid rgba(255,255,255,.1);
  cursor: pointer;
  transition: all .18s ease;
  -webkit-tap-highlight-color: transparent;
}
.pay-type-btn:hover {
  background: rgba(124,58,237,.12);
  border-color: rgba(124,58,237,.3);
  color: #c4b5fd;
  transform: none;
}
.pay-type-btn.active {
  background: rgba(124,58,237,.22);
  border-color: rgba(124,58,237,.6);
  color: #ede9fe;
  box-shadow: 0 2px 10px rgba(124,58,237,.25);
}
.pay-type-icon {
  font-size: 22px;
  line-height: 1;
}

/* ── 地契扫描入口 ── */
.deed-entry {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.deed-scan-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 13px 0;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 700;
  color: #a78bfa;
  background: rgba(124,58,237,.1);
  border: 1.5px dashed rgba(124,58,237,.5);
  cursor: pointer;
  transition: background .18s, border-color .18s;
  -webkit-tap-highlight-color: transparent;
}
.deed-scan-btn:hover {
  background: rgba(124,58,237,.2);
  border-color: rgba(124,58,237,.8);
}
.deed-scan-btn:active {
  transform: scale(.97);
}
.deed-scan-icon {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  flex-shrink: 0;
}
.deed-hint {
  font-size: 12px;
  color: #475569;
  margin: 0;
  text-align: center;
}

/* ── 其他 ── */.end-btn {
  background: rgba(100,116,139,.22);
  color: #cbd5e1;
  border: 1px solid rgba(100,116,139,.4);
}
.end-btn:hover {
  background: rgba(100,116,139,.35);
}
.name-clickable {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
}
.name-clickable:hover {
  color: #94a3b8;
}
.edit-icon {
  font-size: 12px;
  opacity: 0.6;
}
.name-input {
  background: rgba(30,41,59,.8);
  border: 1px solid rgba(100,116,139,.5);
  color: #e2e8f0;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 14px;
  width: 120px;
  text-align: center;
}
</style>
