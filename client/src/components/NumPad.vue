<template>
  <div class="numpad">
    <!-- 金额显示屏 (Clickable Trigger) -->
    <div class="numpad-display trigger" :class="{ 'has-value': display !== '0' }" @click="openModal">
      <span class="numpad-currency">¥</span>
      <span class="numpad-value">{{ formattedDisplay }}</span>
    </div>

    <!-- 弹窗键盘 -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="isOpen" class="numpad-modal-mask" @click="closeModal">
          <div class="numpad-modal-content" @click.stop>
            
            <div class="numpad-modal-header">
              <div class="numpad-display modal-display" :class="{ 'has-value': display !== '0' }">
                <span class="numpad-currency">¥</span>
                <span class="numpad-value">{{ formattedDisplay }}</span>
              </div>
              <button class="numpad-confirm" @click="confirm">确认</button>
            </div>

            <!-- 快捷金额 -->
            <div v-if="quickAmounts.length" class="numpad-quick">
              <button
                v-for="v in quickAmounts"
                :key="v"
                class="numpad-quick-btn"
                :class="{ active: numericValue === v }"
                @click="setAmount(v)"
              >{{ v }}</button>
            </div>

            <!-- 数字键盘 -->
            <div class="numpad-grid">
              <button class="numpad-key" @click="press('1')">1</button>
              <button class="numpad-key" @click="press('2')">2</button>
              <button class="numpad-key" @click="press('3')">3</button>

              <button class="numpad-key" @click="press('4')">4</button>
              <button class="numpad-key" @click="press('5')">5</button>
              <button class="numpad-key" @click="press('6')">6</button>

              <button class="numpad-key" @click="press('7')">7</button>
              <button class="numpad-key" @click="press('8')">8</button>
              <button class="numpad-key" @click="press('9')">9</button>

              <button class="numpad-key numpad-clear" @click="clear">清空</button>
              <button class="numpad-key" @click="press('0')">0</button>
              <button class="numpad-key numpad-del" @click="del">⌫</button>
            </div>

          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  modelValue: { type: Number, default: null },
  quickAmounts: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue', 'ok'])

const isOpen = ref(false)

function openModal() {
  isOpen.value = true
}

function closeModal() {
  isOpen.value = false
}

function confirm() {
  isOpen.value = false
  emit('ok')
}

defineExpose({ openModal })

// 内部用字符串维护，避免前导零问题
const display = ref(props.modelValue ? String(props.modelValue) : '0')

// 外部 v-model 变化时同步（如外部清空）
watch(() => props.modelValue, (v) => {
  display.value = (v != null && v > 0) ? String(v) : '0'
})

const numericValue = computed(() => {
  const n = parseInt(display.value, 10)
  return isNaN(n) ? 0 : n
})

// 千位分隔格式化显示
const formattedDisplay = computed(() =>
  new Intl.NumberFormat('zh-CN').format(numericValue.value)
)

function emitValue() {
  emit('update:modelValue', numericValue.value > 0 ? numericValue.value : null)
}

function press(digit) {
  if (display.value === '0') {
    display.value = digit
  } else {
    // 最多 7 位（999,9999）
    if (display.value.length >= 7) return
    display.value += digit
  }
  emitValue()
}

function del() {
  if (display.value.length <= 1) {
    display.value = '0'
  } else {
    display.value = display.value.slice(0, -1)
  }
  emitValue()
}

function clear() {
  display.value = '0'
  emitValue()
}

function setAmount(v) {
  display.value = String(v)
  emitValue()
}
</script>

<style scoped>
.numpad {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ── 显示屏 ── */
.numpad-display {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 4px;
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(255,255,255,.05);
  border: 1px solid rgba(255,255,255,.12);
  min-height: 62px;
  transition: border-color .15s, background .15s;
}
.numpad-display.trigger {
  cursor: pointer;
}
.numpad-display.trigger:active {
  transform: scale(0.98);
}
.numpad-display.has-value {
  border-color: rgba(124,58,237,.5);
  background: rgba(124,58,237,.08);
}
.numpad-currency {
  font-size: 22px;
  font-weight: 700;
  color: #a78bfa;
  line-height: 1;
}
.numpad-value {
  font-size: 38px;
  font-weight: 900;
  letter-spacing: -.03em;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: #eef2ff;
}

/* ── 弹窗 ── */
.numpad-modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  z-index: 9999;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.numpad-modal-content {
  width: 100%;
  max-width: 600px;
  background: #1e1e24;
  border-radius: 24px 24px 0 0;
  padding: 24px;
  box-shadow: 0 -4px 24px rgba(0,0,0,0.5);
  display: flex;
  flex-direction: column;
  gap: 16px;
  animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  padding-bottom: calc(24px + env(safe-area-inset-bottom));
}
@keyframes slideUp {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.numpad-modal-header {
  display: flex;
  align-items: stretch;
  gap: 12px;
}
.numpad-modal-header .modal-display {
  flex: 1;
  margin: 0;
  background: rgba(0,0,0,.2);
  border-color: rgba(255,255,255,.1);
}
.numpad-modal-header .modal-display.has-value {
  border-color: rgba(124,58,237,.5);
  background: rgba(124,58,237,.08);
}
.numpad-confirm {
  padding: 0 24px;
  border-radius: 14px;
  background: #7c3aed;
  color: white;
  font-size: 18px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: background 0.2s, transform 0.1s;
  user-select: none;
}
.numpad-confirm:active {
  background: #6d28d9;
  transform: scale(0.95);
}

/* ── 键盘网格 ── */
.numpad-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.numpad-key {
  padding: 18px 0;
  border-radius: 16px;
  font-size: 24px;
  font-weight: 600;
  background: rgba(255,255,255,.07);
  color: #eef2ff;
  border: 1px solid rgba(255,255,255,.1);
  cursor: pointer;
  transition: background .12s, transform .1s;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.numpad-key:hover {
  background: rgba(255,255,255,.14);
}
.numpad-key:active {
  transform: scale(.95);
  background: rgba(255,255,255,.2);
}
.numpad-clear {
  font-size: 16px;
  font-weight: 600;
  color: #a7b0cf;
  background: rgba(255,255,255,.04);
}
.numpad-del {
  font-size: 22px;
  color: #fca5a5;
  background: rgba(239,68,68,.08);
  border-color: rgba(239,68,68,.2);
}
.numpad-del:hover {
  background: rgba(239,68,68,.18);
}

/* ── 快捷金额 ── */
.numpad-quick {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.numpad-quick-btn {
  flex: 1;
  min-width: 52px;
  padding: 10px 8px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  background: rgba(255,255,255,.06);
  color: #a7b0cf;
  border: 1px solid rgba(255,255,255,.1);
  cursor: pointer;
  transition: background .12s, color .12s, border-color .12s;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.numpad-quick-btn:hover {
  background: rgba(124,58,237,.18);
  color: #c4b5fd;
  border-color: rgba(124,58,237,.4);
}
.numpad-quick-btn.active {
  background: rgba(124,58,237,.3);
  color: #ede9fe;
  border-color: rgba(124,58,237,.6);
}
</style>