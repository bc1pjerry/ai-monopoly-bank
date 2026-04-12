<template>
  <div class="deed-scanner">
    <!-- 头部 -->
    <div class="scanner-header">
      <button class="back-btn" @click="emit('cancel')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <h2>拍摄地契</h2>
      <div style="width:36px;"></div>
    </div>

    <!-- 未扫描状态：引导拍照 -->
    <div v-if="step === 'idle'" class="step-idle">
      <div class="viewfinder">
        <div class="vf-corner vf-tl"></div>
        <div class="vf-corner vf-tr"></div>
        <div class="vf-corner vf-bl"></div>
        <div class="vf-corner vf-br"></div>
        <div class="vf-hint">
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.8">
            <rect x="6" y="10" width="36" height="28" rx="3"/>
            <circle cx="24" cy="24" r="8"/>
            <circle cx="24" cy="24" r="3" fill="currentColor" opacity=".4"/>
            <path d="M18 10 L20 6 L28 6 L30 10" stroke-linejoin="round"/>
          </svg>
          <p>将地契放在光线充足处<br/>拍摄清晰的正面照片</p>
        </div>
      </div>

      <!-- 隐藏的 input[type=file] -->
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        capture="environment"
        style="display:none"
        @change="onFileSelected"
      />
      <button class="primary shoot-btn" @click="fileInput.click()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
        拍摄地契照片
      </button>
      <p class="muted" style="text-align:center;font-size:13px;margin-top:8px;">也可从相册选取已有照片</p>
    </div>

    <!-- 识别中 -->
    <div v-if="step === 'scanning'" class="step-scanning">
      <div class="scan-preview-wrap">
        <img :src="previewUrl" class="scan-preview" alt="地契预览" />
        <div class="scan-overlay">
          <div class="scan-line"></div>
        </div>
      </div>
      <p class="scanning-text">正在识别地契信息…</p>
    </div>

    <!-- 识别结果确认 -->
    <div v-if="step === 'result'" class="step-result">
      <img :src="previewUrl" class="result-thumb" alt="地契缩略图" />

      <div class="result-card card">
        <div class="result-row">
          <span class="result-label">地产名称</span>
          <input v-model="result.name" class="result-input" placeholder="请输入地产名称" />
        </div>
        <div class="result-row">
          <span class="result-label">购买价格</span>
          <div class="result-price-wrap">
            <span class="price-prefix">¥</span>
            <input v-model.number="result.price" class="result-input" type="number" placeholder="0" />
          </div>
        </div>
        <div class="result-divider"></div>
        <div class="result-rents">
          <div class="result-label" style="margin-bottom:8px;">过路费档位</div>
          <div v-for="(rent, idx) in result.rents" :key="idx" class="rent-row">
            <span class="rent-level">{{ rentLabel(idx) }}</span>
            <div class="result-price-wrap">
              <span class="price-prefix">¥</span>
              <input v-model.number="result.rents[idx]" class="result-input" type="number" placeholder="0" />
            </div>
          </div>
        </div>
      </div>

      <div class="result-actions">
        <button class="secondary-btn" @click="retake">重新拍摄</button>
        <button class="primary" @click="confirmResult">确认使用</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const emit = defineEmits(['cancel', 'confirm'])

const step = ref('idle')  // 'idle' | 'scanning' | 'result'
const fileInput = ref(null)
const previewUrl = ref('')

const result = ref({
  name: '',
  price: null,
  rents: [0, 0, 0, 0, 0]  // 空地、1屋、2屋、3屋、酒店
})

const rentLabels = ['空地', '1栋', '2栋', '3栋', '酒店']
function rentLabel(idx) { return rentLabels[idx] || `档位${idx + 1}` }

async function onFileSelected(e) {
  const file = e.target.files?.[0]
  if (!file) return

  // 生成预览
  previewUrl.value = URL.createObjectURL(file)
  step.value = 'scanning'

  // TODO: 调用 OCR / AI Vision 接口识别地契
  // 目前留空，模拟短暂延迟后进入结果页（结果为空，等待用户手填）
  await new Promise(r => setTimeout(r, 800))

  result.value = {
    name: '',
    price: null,
    rents: [0, 0, 0, 0, 0]
  }
  step.value = 'result'

  // 重置 input，允许重新选同一张图
  e.target.value = ''
}

function retake() {
  step.value = 'idle'
  previewUrl.value = ''
  result.value = { name: '', price: null, rents: [0, 0, 0, 0, 0] }
}

function confirmResult() {
  if (!result.value.name.trim()) return alert('请填写地产名称')
  if (!(result.value.price > 0)) return alert('请填写购买价格')
  emit('confirm', { ...result.value })
}
</script>

<style scoped>
.deed-scanner {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 头部 */
.scanner-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}
.scanner-header h2 {
  margin: 0;
  font-size: 18px;
}
.back-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: rgba(255,255,255,.08);
  border: 1px solid rgba(255,255,255,.12);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  color: #a7b0cf;
}
.back-btn svg {
  width: 18px;
  height: 18px;
}
.back-btn:hover {
  background: rgba(255,255,255,.14);
  transform: none;
}

/* ── idle ── */
.step-idle {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.viewfinder {
  position: relative;
  width: 100%;
  aspect-ratio: 4/3;
  border-radius: 18px;
  background: rgba(0,0,0,.35);
  border: 1.5px solid rgba(255,255,255,.08);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.vf-corner {
  position: absolute;
  width: 24px;
  height: 24px;
  border-color: #a78bfa;
  border-style: solid;
}
.vf-tl { top: 14px; left: 14px; border-width: 2.5px 0 0 2.5px; border-radius: 3px 0 0 0; }
.vf-tr { top: 14px; right: 14px; border-width: 2.5px 2.5px 0 0; border-radius: 0 3px 0 0; }
.vf-bl { bottom: 14px; left: 14px; border-width: 0 0 2.5px 2.5px; border-radius: 0 0 0 3px; }
.vf-br { bottom: 14px; right: 14px; border-width: 0 2.5px 2.5px 0; border-radius: 0 0 3px 0; }

.vf-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: rgba(167,176,207,.6);
}
.vf-hint svg {
  width: 56px;
  height: 56px;
  opacity: .5;
}
.vf-hint p {
  margin: 0;
  font-size: 13px;
  text-align: center;
  line-height: 1.6;
}

.shoot-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 16px;
  padding: 16px;
}

/* ── scanning ── */
.step-scanning {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.scan-preview-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 4/3;
  border-radius: 18px;
  overflow: hidden;
  border: 1.5px solid rgba(124,58,237,.4);
}
.scan-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.scan-overlay {
  position: absolute;
  inset: 0;
  background: rgba(124,58,237,.1);
  overflow: hidden;
}
.scan-line {
  position: absolute;
  left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, #a78bfa, transparent);
  animation: scanMove 1.4s ease-in-out infinite;
}
@keyframes scanMove {
  0% { top: 10%; opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { top: 90%; opacity: 0; }
}

.scanning-text {
  color: #a78bfa;
  font-size: 15px;
  font-weight: 600;
  margin: 0;
  animation: pulse 1.2s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: .5; }
}

/* ── result ── */
.step-result {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.result-thumb {
  width: 100%;
  max-height: 160px;
  object-fit: cover;
  border-radius: 14px;
  border: 1.5px solid rgba(255,255,255,.1);
}

.result-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.result-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.result-label {
  font-size: 13px;
  color: #a7b0cf;
  white-space: nowrap;
  min-width: 70px;
}
.result-price-wrap {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
}
.price-prefix {
  font-size: 16px;
  font-weight: 700;
  color: #a78bfa;
}
.result-input {
  flex: 1;
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.12);
  color: #eef2ff;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 15px;
  font-weight: 600;
}
.result-input:focus {
  outline: none;
  border-color: rgba(124,58,237,.6);
  background: rgba(124,58,237,.08);
}

.result-divider {
  height: 1px;
  background: rgba(255,255,255,.08);
  margin: 2px 0;
}

.result-rents {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rent-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.rent-level {
  font-size: 12px;
  color: #64748b;
  min-width: 70px;
  text-align: right;
}

.result-actions {
  display: flex;
  gap: 10px;
}
.secondary-btn {
  flex: 1;
  background: rgba(255,255,255,.07);
  border: 1px solid rgba(255,255,255,.12);
  color: #a7b0cf;
  padding: 14px;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 600;
}
.secondary-btn:hover {
  background: rgba(255,255,255,.12);
  transform: none;
}
.result-actions .primary {
  flex: 2;
  padding: 14px;
}
</style>
