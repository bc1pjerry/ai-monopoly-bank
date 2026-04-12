<template>
  <!-- 全屏遮罩 -->
  <div class="ocr-overlay" @click.self="$emit('close')">
    <div class="ocr-sheet">
      <!-- 标题栏 -->
      <div class="ocr-header">
        <span class="ocr-title">扫描地契</span>
        <button class="ocr-close" @click="$emit('close')">✕</button>
      </div>

      <!-- 主体 -->
      <div class="ocr-body">

        <!-- ① 未拍照：引导区 -->
        <template v-if="phase === 'idle'">
          <div class="guide-area">
            <div class="guide-icon">
              <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="4" y="16" width="56" height="40" rx="7" stroke="currentColor" stroke-width="3" fill="currentColor" fill-opacity="0.08"/>
                <circle cx="32" cy="36" r="11" stroke="currentColor" stroke-width="3" fill="currentColor" fill-opacity="0.1"/>
                <circle cx="32" cy="36" r="5" fill="currentColor" fill-opacity="0.35"/>
                <path d="M22 16 L26 9 H38 L42 16" stroke="currentColor" stroke-width="3" stroke-linejoin="round" fill="none"/>
                <circle cx="52" cy="23" r="3" fill="currentColor" fill-opacity="0.5"/>
              </svg>
            </div>
            <p class="guide-tip">拍摄地契卡片，AI 将自动识别<br/>地产名称、购入价格及各级过路费</p>
          </div>

          <div class="action-btns">
            <label class="primary-btn camera-label">
              <svg viewBox="0 0 20 20" fill="none" class="btn-icon">
                <rect x="1" y="5" width="18" height="13" rx="3" stroke="currentColor" stroke-width="1.6"/>
                <circle cx="10" cy="11" r="3.5" stroke="currentColor" stroke-width="1.6"/>
                <path d="M7 5 L8.5 2.5 H11.5 L13 5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
              </svg>
              拍照识别
              <input
                type="file"
                accept="image/*"
                capture="environment"
                class="hidden-input"
                @change="onFileSelected"
              />
            </label>

            <label class="secondary-btn album-label">
              <svg viewBox="0 0 20 20" fill="none" class="btn-icon">
                <rect x="1" y="3" width="18" height="14" rx="2.5" stroke="currentColor" stroke-width="1.6"/>
                <circle cx="6.5" cy="7.5" r="1.5" fill="currentColor" opacity="0.7"/>
                <path d="M2 14 L7 9 L11 13 L14 10 L18 14" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
              </svg>
              从相册选择
              <input
                type="file"
                accept="image/*"
                class="hidden-input"
                @change="onFileSelected"
              />
            </label>
          </div>
        </template>

        <!-- ② 识别中 -->
        <template v-else-if="phase === 'scanning'">
          <div class="scanning-area">
            <div class="preview-wrap">
              <img :src="previewUrl" class="preview-img" alt="地契预览" />
              <div class="scan-line"></div>
            </div>
            <p class="scanning-tip">小米 Mimo AI 正在识别地契信息…</p>
          </div>
        </template>

        <!-- ③ 识别失败 -->
        <template v-else-if="phase === 'error'">
          <div class="error-area">
            <div class="error-banner">
              <svg viewBox="0 0 20 20" fill="none" class="error-icon">
                <circle cx="10" cy="10" r="8.5" stroke="currentColor" stroke-width="1.6"/>
                <path d="M10 6v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <circle cx="10" cy="13.5" r="1" fill="currentColor"/>
              </svg>
              识别失败
            </div>
            <p class="error-msg">{{ errorMsg }}</p>
            <button class="primary-btn" @click="reset">重新拍摄</button>
          </div>
        </template>

        <!-- ④ 识别结果 -->
        <template v-else-if="phase === 'result'">
          <div class="result-area">
            <!-- 预览缩略图 -->
            <div class="preview-thumb-wrap">
              <img :src="previewUrl" class="preview-thumb" alt="地契" />
            </div>

            <!-- 可编辑结果卡 -->
            <div class="deed-card">
              <div class="deed-row">
                <span class="deed-label">地产名称</span>
                <input
                  v-model="deed.name"
                  class="deed-input"
                  placeholder="未识别"
                  maxlength="30"
                />
              </div>
              <div class="deed-row">
                <span class="deed-label">购入价格</span>
                <div class="deed-price-wrap">
                  <span class="deed-currency">¥</span>
                  <input
                    v-model.number="deed.price"
                    class="deed-input deed-input-num"
                    type="number"
                    placeholder="—"
                    min="0"
                  />
                </div>
              </div>
              <div class="deed-divider"></div>
              <div class="deed-row" v-for="(label, i) in rentLabels" :key="i">
                <span class="deed-label">{{ label }}</span>
                <div class="deed-price-wrap">
                  <span class="deed-currency">¥</span>
                  <input
                    v-model.number="deed.rents[i]"
                    class="deed-input deed-input-num"
                    type="number"
                    placeholder="—"
                    min="0"
                  />
                </div>
              </div>
            </div>

            <div class="result-actions">
              <button class="secondary-btn" @click="reset">重新拍摄</button>
              <button class="primary-btn" @click="confirm">确认录入</button>
            </div>
          </div>
        </template>

      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'

const emit = defineEmits(['close', 'deed-confirmed'])

const phase = ref('idle')        // 'idle' | 'scanning' | 'error' | 'result'
const previewUrl = ref('')
const errorMsg = ref('')

const rentLabels = ['空地过路费', '1 栋房屋', '2 栋房屋', '3 栋房屋', '4 栋房屋', '酒店']

const deed = reactive({
  name: '',
  price: null,
  rents: [null, null, null, null, null, null]
})

// ─── 文件选择 ─────────────────────────────────────────────────────────────────

function onFileSelected(e) {
  const file = e.target.files?.[0]
  if (!file) return
  e.target.value = ''

  const reader = new FileReader()
  reader.onload = async (ev) => {
    const dataUrl = ev.target.result
    previewUrl.value = dataUrl
    phase.value = 'scanning'
    // 转成 JPEG 再发送（小米 API 不接受 PNG）
    const jpegDataUrl = await toJpeg(dataUrl)
    await recognizeDeed(jpegDataUrl)
  }
  reader.readAsDataURL(file)
}

// 用 canvas 将任意图片转为 JPEG base64，同时限制最长边 ≤ 1600px 减少传输量
function toJpeg(dataUrl, maxSize = 1600, quality = 0.85) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width > maxSize || height > maxSize) {
        if (width > height) { height = Math.round(height * maxSize / width); width = maxSize }
        else { width = Math.round(width * maxSize / height); height = maxSize }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.src = dataUrl
  })
}

// ─── 调用后端 OCR 接口 ────────────────────────────────────────────────────────

async function recognizeDeed(dataUrl) {
  try {
    const res = await fetch('/api/ocr/deed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl })
    })
    const json = await res.json()
    if (!json.ok) throw new Error(json.error || '识别失败')

    const d = json.deed
    deed.name  = d.name  ?? ''
    deed.price = d.price ?? null
    // 确保 rents 始终是长度为 6 的数组
    deed.rents = Array.from({ length: 6 }, (_, i) => d.rents?.[i] ?? null)
    phase.value = 'result'
  } catch (err) {
    errorMsg.value = err.message
    phase.value = 'error'
  }
}

// ─── 操作 ─────────────────────────────────────────────────────────────────────

function reset() {
  if (previewUrl.value.startsWith('blob:')) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
  deed.name = ''
  deed.price = null
  deed.rents = [null, null, null, null, null, null]
  errorMsg.value = ''
  phase.value = 'idle'
}

function confirm() {
  emit('deed-confirmed', {
    name:  deed.name,
    price: deed.price,
    rents: [...deed.rents]
  })
  emit('close')
}
</script>

<style scoped>
/* ── 遮罩 ── */
.ocr-overlay {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(0, 0, 0, .65);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

/* ── 底部弹出卡片 ── */
.ocr-sheet {
  width: 100%;
  max-width: 480px;
  max-height: 92vh;
  background: linear-gradient(160deg, #0f172a 0%, #1a1040 100%);
  border-top: 1px solid rgba(255,255,255,.12);
  border-radius: 24px 24px 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: slide-up .28s cubic-bezier(.34,1.4,.64,1) both;
}

@keyframes slide-up {
  from { transform: translateY(100%); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}

/* ── 标题栏 ── */
.ocr-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 14px;
  border-bottom: 1px solid rgba(255,255,255,.08);
  flex-shrink: 0;
}
.ocr-title {
  font-size: 17px;
  font-weight: 700;
  color: #e2e8f0;
  letter-spacing: .02em;
}
.ocr-close {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: rgba(255,255,255,.08);
  border: 0;
  color: #94a3b8;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background .15s;
}
.ocr-close:hover { background: rgba(255,255,255,.16); }

/* ── 主体 ── */
.ocr-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 20px 36px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

/* ── 引导区 ── */
.guide-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px 0 8px;
}
.guide-icon {
  width: 80px;
  height: 80px;
  color: #a78bfa;
  opacity: .85;
}
.guide-icon svg { width: 100%; height: 100%; }
.guide-tip {
  text-align: center;
  color: #94a3b8;
  font-size: 14px;
  line-height: 1.6;
  margin: 0;
}

/* ── 按钮组 ── */
.action-btns {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.primary-btn, .secondary-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 14px 0;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 700;
  border: 0;
  cursor: pointer;
  transition: opacity .15s, transform .1s;
  position: relative;
  overflow: hidden;
  -webkit-tap-highlight-color: transparent;
}
.primary-btn {
  background: linear-gradient(135deg, #7c3aed, #5b21b6);
  color: #fff;
  box-shadow: 0 4px 16px rgba(124,58,237,.4);
}
.primary-btn:hover { opacity: .9; }
.primary-btn:active { transform: scale(.97); }
.secondary-btn {
  background: rgba(255,255,255,.07);
  color: #cbd5e1;
  border: 1px solid rgba(255,255,255,.12) !important;
}
.secondary-btn:hover { background: rgba(255,255,255,.12); }
.secondary-btn:active { transform: scale(.97); }

.camera-label, .album-label { cursor: pointer; }
.hidden-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
}
.btn-icon {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  flex-shrink: 0;
}

/* ── 扫描中 ── */
.scanning-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}
.preview-wrap {
  position: relative;
  width: 100%;
  max-height: 240px;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid rgba(124,58,237,.4);
}
.preview-img {
  width: 100%;
  max-height: 240px;
  object-fit: cover;
  display: block;
}
.scan-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, #a78bfa, transparent);
  animation: scan 1.4s ease-in-out infinite;
  box-shadow: 0 0 8px rgba(167,139,250,.8);
}
@keyframes scan {
  0%   { top: 0%; }
  50%  { top: calc(100% - 2px); }
  100% { top: 0%; }
}
.scanning-tip {
  color: #94a3b8;
  font-size: 14px;
  margin: 0;
}

/* ── 识别失败 ── */
.error-area {
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: stretch;
}
.error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(239,68,68,.08);
  border: 1px solid rgba(239,68,68,.25);
  border-radius: 10px;
  padding: 10px 14px;
  color: #fca5a5;
  font-size: 13px;
  font-weight: 600;
}
.error-icon {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  flex-shrink: 0;
}
.error-msg {
  color: #64748b;
  font-size: 12px;
  line-height: 1.55;
  margin: 0;
  word-break: break-all;
}

/* ── 识别结果 ── */
.result-area {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.preview-thumb-wrap {
  width: 100%;
  height: 100px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(124,58,237,.3);
}
.preview-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* ── 地契信息卡（可编辑） ── */
.deed-card {
  background: rgba(255,255,255,.04);
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 14px;
  overflow: hidden;
}
.deed-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 14px;
  gap: 8px;
}
.deed-row + .deed-row {
  border-top: 1px solid rgba(255,255,255,.06);
}
.deed-label {
  color: #94a3b8;
  font-size: 13px;
  flex-shrink: 0;
  width: 110px;
}
.deed-divider {
  height: 1px;
  background: rgba(124,58,237,.3);
  margin: 2px 0;
}
.deed-input {
  flex: 1;
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 8px;
  color: #e2e8f0;
  font-size: 13px;
  font-weight: 600;
  padding: 5px 10px;
  text-align: right;
  outline: none;
  min-width: 0;
  transition: border-color .15s;
}
.deed-input:focus {
  border-color: rgba(124,58,237,.6);
  background: rgba(124,58,237,.08);
}
.deed-input-num {
  width: 90px;
  flex: none;
}
.deed-price-wrap {
  display: flex;
  align-items: center;
  gap: 4px;
}
.deed-currency {
  color: #a78bfa;
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
}

.result-actions {
  display: flex;
  gap: 10px;
}
.result-actions .secondary-btn,
.result-actions .primary-btn {
  flex: 1;
}
</style>
