<template>
  <div class="chart-wrap">
    <svg
      v-if="points.length >= 2"
      :viewBox="`0 0 ${W} ${H}`"
      preserveAspectRatio="none"
      class="chart-svg"
    >
      <defs>
        <!-- 曲线渐变：紫色 → 青色，与网站主题一致 -->
        <linearGradient :id="lineGradId" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stop-color="#7c3aed" />
          <stop offset="100%" stop-color="#06b6d4" />
        </linearGradient>
        <!-- 填充区域渐变 -->
        <linearGradient :id="fillGradId" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stop-color="#7c3aed" stop-opacity="0.30" />
          <stop offset="55%"  stop-color="#06b6d4" stop-opacity="0.08" />
          <stop offset="100%" stop-color="#06b6d4" stop-opacity="0" />
        </linearGradient>
      </defs>

      <!-- 填充区域 -->
      <path
        :d="fillPath"
        :fill="`url(#${fillGradId})`"
        stroke="none"
      />

      <!-- 贝塞尔曲线主线 -->
      <path
        :d="linePath"
        fill="none"
        :stroke="`url(#${lineGradId})`"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />

      <!-- 末端光点 -->
      <circle
        :cx="points[points.length - 1].x"
        :cy="points[points.length - 1].y"
        r="3"
        fill="#06b6d4"
        opacity="0.85"
      />
      <!-- 末端光晕 -->
      <circle
        :cx="points[points.length - 1].x"
        :cy="points[points.length - 1].y"
        r="6"
        fill="#06b6d4"
        opacity="0.15"
      />
    </svg>

    <!-- 数据不足时的占位 -->
    <div v-else class="chart-empty">暂无流水数据</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  /** 全局 logs 数组，按服务端格式 */
  logs: { type: Array, default: () => [] },
  /** 玩家姓名（用于匹配 log.text） */
  playerName: { type: String, required: true },
  /** 玩家起始余额（开局余额） */
  startBalance: { type: Number, default: 0 }
})

// SVG 画布尺寸（单位 px，最终 CSS 拉伸）
const W = 300
const H = 68

// 每个图表用唯一 id，避免多卡片渐变 id 冲突
const lineGradId = computed(() => `lg_${props.playerName.replace(/\s/g, '_')}`)
const fillGradId = computed(() => `fg_${props.playerName.replace(/\s/g, '_')}`)

/**
 * 从 logs 中提取该玩家余额变动序列，返回带 x/y 的坐标点数组。
 *
 * log.text 格式（服务端写死的）：
 *   bank-add  : "银行发给 {name} ¥{amt}"
 *   bank-sub  : "银行扣除 {name} ¥{amt}"
 *   bank-sub  : "{name} 缴罚款给银行 ¥{amt}"   (pay-fine 也写 bank-sub)
 *   transfer  : "{fromName} 向 {toName} 转账 ¥{amt}"
 *   system    : 忽略
 */
const points = computed(() => {
  const name = props.playerName
  if (!name) return []

  // 按时间正序
  const sorted = [...props.logs].sort((a, b) => a.ts - b.ts)

  const balances = [props.startBalance]
  let cur = props.startBalance

  for (const log of sorted) {
    const m = log.text.match(/¥([\d,]+)/)
    if (!m) continue
    const amt = parseInt(m[1].replace(/,/g, ''), 10)
    if (!Number.isFinite(amt) || amt <= 0) continue

    let delta = 0

    if (log.type === 'bank-add') {
      // "银行发给 NAME ¥N"
      if (log.text.includes(name)) delta = amt
    } else if (log.type === 'bank-sub') {
      // "银行扣除 NAME ¥N"  或  "NAME 缴罚款给银行 ¥N"
      if (log.text.includes(name)) delta = -amt
    } else if (log.type === 'transfer') {
      // "FROMNAME 向 TONAME 转账 ¥N"
      // 用更精确的正则避免名字互相包含时的误判
      const transferRe = /^(.+?) 向 (.+?) 转账 ¥[\d,]+$/
      const tm = log.text.match(transferRe)
      if (tm) {
        if (tm[1] === name) delta = -amt      // 付款方
        else if (tm[2] === name) delta = amt   // 收款方
      }
    }
    // system 类型忽略

    if (delta !== 0) {
      cur += delta
      balances.push(cur)
    }
  }

  if (balances.length < 2) return []

  // 映射到 SVG 坐标
  const minB = Math.min(...balances)
  const maxB = Math.max(...balances)
  const range = maxB - minB || 1
  const padX = 4
  const padY = 6

  return balances.map((b, i) => ({
    x: padX + (i / (balances.length - 1)) * (W - padX * 2),
    y: padY + (1 - (b - minB) / range) * (H - padY * 2)
  }))
})

/**
 * Catmull-Rom → Cubic Bézier（张力 0.35）
 * 生成平滑贝塞尔曲线的 SVG path d 属性
 */
function buildCurvePath(pts) {
  if (pts.length < 2) return ''
  const t = 0.35
  let d = `M ${r(pts[0].x)},${r(pts[0].y)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(i + 2, pts.length - 1)]
    const cp1x = p1.x + (p2.x - p0.x) * t
    const cp1y = p1.y + (p2.y - p0.y) * t
    const cp2x = p2.x - (p3.x - p1.x) * t
    const cp2y = p2.y - (p3.y - p1.y) * t
    d += ` C ${r(cp1x)},${r(cp1y)} ${r(cp2x)},${r(cp2y)} ${r(p2.x)},${r(p2.y)}`
  }
  return d
}

function r(n) { return Math.round(n * 100) / 100 }

const linePath = computed(() => buildCurvePath(points.value))

const fillPath = computed(() => {
  const pts = points.value
  if (pts.length < 2) return ''
  const line = buildCurvePath(pts)
  const last = pts[pts.length - 1]
  const first = pts[0]
  return `${line} L ${r(last.x)},${H} L ${r(first.x)},${H} Z`
})
</script>

<style scoped>
.chart-wrap {
  width: 100%;
  height: 68px;
  position: relative;
  margin-top: 4px;
}
.chart-svg {
  width: 100%;
  height: 100%;
  display: block;
  overflow: visible;
}
.chart-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: rgba(167, 176, 207, 0.4);
  border: 1px dashed rgba(255,255,255,0.08);
  border-radius: 10px;
}
</style>
