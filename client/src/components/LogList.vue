<template>
  <div>
    <div class="log" v-if="allLogs.length">
      <div class="log-item" v-for="log in allLogs" :key="log.id">
        <!-- 第一行：类型胶囊 -->
        <div class="log-row-type">
          <span class="pill" :class="logClass(log.type)">{{ logLabel(log.type) }}</span>
        </div>
        <!-- 第二行：详情（from → to + 金额） -->
        <div class="log-row-detail">
          <div class="log-desc">
            <template v-if="parsedLog(log).from && parsedLog(log).to">
              <span class="player-name">{{ parsedLog(log).from }}</span>
              <span class="arrow">→</span>
              <span class="player-name">{{ parsedLog(log).to }}</span>
            </template>
            <template v-else>
              <span class="desc-text">{{ parsedLog(log).desc }}</span>
            </template>
          </div>
          <span class="amount">¥{{ parsedLog(log).amount }}</span>
        </div>
        <!-- 第三行：时间 + 备注 -->
        <div class="log-row-time">
          <span class="log-time">{{ nowText(log.ts) }}</span>
          <span v-if="log.note" class="log-note">· {{ log.note }}</span>
        </div>
      </div>
    </div>
    <div class="empty" v-else>还没有流水记录。</div>

    <!-- 哨兵元素：滚动进入视口时触发加载 -->
    <div ref="sentinel" class="sentinel">
      <span v-if="loading" class="sentinel-tip">加载中...</span>
      <span v-else-if="!hasMore && allLogs.length > 0" class="sentinel-tip">已显示全部 {{ total }} 条记录</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { nowText, apiFetch } from '../composables/api.js'

const props = defineProps({
  logs: { type: Array, default: () => [] },
  logsTotal: { type: Number, default: 0 },
  roomId: { type: String, default: '' },
  token: { type: String, default: '' }
})

const extraLogs = ref([])
const loading = ref(false)
const loadedOffset = ref(props.logs.length)
const sentinel = ref(null)
let observer = null

watch(() => props.logs, () => {
  extraLogs.value = []
  loadedOffset.value = props.logs.length
})

const allLogs = computed(() => [...props.logs, ...extraLogs.value])
const total = computed(() => props.logsTotal || props.logs.length)
const hasMore = computed(() => allLogs.value.length < total.value)

async function loadMore() {
  if (loading.value || !hasMore.value) return
  loading.value = true
  try {
    const url = `/api/rooms/${props.roomId}/logs?token=${encodeURIComponent(props.token)}&offset=${loadedOffset.value}&limit=50`
    const data = await apiFetch(url)
    extraLogs.value = [...extraLogs.value, ...data.logs]
    loadedOffset.value += data.logs.length
  } catch (e) {
    console.error('加载流水失败：', e.message)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) loadMore()
    },
    { threshold: 0.1 }
  )
  if (sentinel.value) observer.observe(sentinel.value)
})

onUnmounted(() => {
  observer?.disconnect()
})

function logClass(type) {
  return { 'bank-add': 'income', 'bank-sub': 'expense', 'transfer': 'transfer', 'system': 'system' }[type] || 'system'
}

function logLabel(type) {
  return { 'bank-add': '银行发钱', 'bank-sub': '银行扣钱', 'transfer': '玩家转账', 'system': '系统' }[type] || '系统'
}

// 解析 log.text，提取 from / to / amount / desc
function parsedLog(log) {
  const text = log.text || ''

  // 玩家转账："{from} 向 {to} 转账 ¥{amount}"
  const transferMatch = text.match(/^(.+)\s向\s(.+)\s转账\s¥([\d,]+)$/)
  if (transferMatch) {
    return { from: transferMatch[1], to: transferMatch[2], amount: transferMatch[3] }
  }

  // 银行操作：提取金额
  const bankMatch = text.match(/¥([\d,]+)/)
  const amount = bankMatch ? bankMatch[1] : ''

  // 去掉金额部分作为描述
  const desc = text.replace(/\s*¥[\d,]+/, '').trim()

  return { desc, amount }
}
</script>

<style scoped>
.log {
  max-height: 520px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.log-item {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  padding: 12px 14px;
  transition: background 0.15s ease;
}

.log-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

/* 三行布局 */
.log-row-type {
  margin-bottom: 6px;
}

.log-row-detail {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.log-row-time {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* 主体行：胶囊 + 描述 */
.log-main {
  display: flex;
  align-items: center;
  gap: 10px;
}

.log-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

/* 转账描述：from → to */
.log-desc {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  min-width: 0;
}

.player-name {
  font-size: 14px;
  font-weight: 600;
  color: #eef2ff;
  white-space: nowrap;
}

.arrow {
  font-size: 13px;
  color: rgba(167, 176, 207, 0.6);
  flex-shrink: 0;
}

.desc-text {
  font-size: 14px;
  color: #eef2ff;
}

/* 金额粗体 */
.amount {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #eef2ff;
  flex-shrink: 0;
}

/* 底部：时间 + 备注 */
.log-time {
  font-size: 11px;
  color: rgba(167, 176, 207, 0.55);
}

.log-note {
  font-size: 11px;
  color: rgba(167, 176, 207, 0.45);
}

/* 胶囊颜色（复用全局变量） */
.pill {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
  letter-spacing: 0.01em;
}

.income  { background: rgba(16, 185, 129, 0.16); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.25); }
.expense { background: rgba(239, 68, 68, 0.16);  color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.25); }
.transfer { background: rgba(6, 182, 212, 0.16); color: #67e8f9; border: 1px solid rgba(6, 182, 212, 0.25); }
.system  { background: rgba(245, 158, 11, 0.16); color: #fcd34d; border: 1px solid rgba(245, 158, 11, 0.25); }

/* 哨兵 */
.sentinel {
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 6px;
}

.sentinel-tip {
  font-size: 11px;
  color: rgba(167, 176, 207, 0.5);
}
</style>
