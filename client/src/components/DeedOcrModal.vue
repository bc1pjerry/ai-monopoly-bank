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
              <!-- 相机图标 -->
              <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="4" y="16" width="56" height="40" rx="7" stroke="currentColor" stroke-width="3" fill="currentColor" fill-opacity="0.08"/>
                <circle cx="32" cy="36" r="11" stroke="currentColor" stroke-width="3" fill="currentColor" fill-opacity="0.1"/>
                <circle cx="32" cy="36" r="5" fill="currentColor" fill-opacity="0.35"/>
                <path d="M22 16 L26 9 H38 L42 16" stroke="currentColor" stroke-width="3" stroke-linejoin="round" fill="none"/>
                <circle cx="52" cy="23" r="3" fill="currentColor" fill-opacity="0.5"/>
              </svg>
            </div>
            <p class="guide-tip">拍摄地契卡片，系统将自动识别<br/>地产名称、购入价格及各级过路费</p>
          </div>

          <div class="action-btns">
            <!-- 调起相机 -->
            <label class="primary-btn camera-label">
              <svg viewBox="0 0 20 20" fill="none" class="btn-icon">
                <rect x="1" y="5" width="18" height="13" rx="3" stroke="currentColor" stroke-width="1.6"/>
                <circle cx="10" cy="11" r="3.5" stroke="currentColor" stroke-width="1.6"/>
                <path d="M7 5 L8.5 2.5 H11.5 L13 5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
              </svg>
              拍照识别
              <input
                ref="cameraInput"
                type="file"
                accept="image/*"
                capture="environment"
                class="hidden-input"
                @change="onFileSelected"
              />
            </label>

            <!-- 从相册选择 -->
            <label class="secondary-btn album-label">
              <svg viewBox="0 0 20 20" fill="none" class="btn-icon">
                <rect x="1" y="3" width="18" height="14" rx="2.5" stroke="currentColor" stroke-width="1.6"/>
                <circle cx="6.5" cy="7.5" r="1.5" fill="currentColor" opacity="0.7"/>
                <path d="M2 14 L7 9 L11 13 L14 10 L18 14" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
              </svg>
              从相册选择
              <input
                ref="albumInput"
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
            <p class="scanning-tip">正在识别地契信息…</p>
          </div>
        </template>

        <!-- ③ 识别结果 -->
        <template v-else-if="phase === 'result'">
          <div class="result-area">
            <!-- TODO: OCR 功能开发中，此处展示占位结果 -->
            <div class="todo-banner">
              <svg viewBox="0 0 20 20" fill="none" class="todo-icon">
                <circle cx="10" cy="10" r="8.5" stroke="currentColor" stroke-width="1.6"/>
                <path d="M10 6v4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <circle cx="10" cy="14" r="1" fill="currentColor"/>
              </svg>
              OCR 识别功能开发中
            </div>

            <p class="result-sub">图片已接收，以下为示例数据结构，<br/>待接入 AI 视觉接口后自动填入。</p>

            <!-- 占位结果卡片 -->
            <div class="deed-card">
              <div class="deed-row">
                <span class="deed-label">地产名称</span>
                <span class="deed-value placeholder">—</span>
              </div>
              <div class="deed-row">
                <span class="deed-label">购入价格</span>
                <span class="deed-value placeholder">—</span>
              </div>
              <div class="deed-divider"></div>
              <div class="deed-row">
                <span class="deed-label">过路费（无建筑）</span>
                <span class="deed-value placeholder">—</span>
              </div>
              <div class="deed-row">
                <span class="deed-label">1 栋房屋</span>
                <span class="deed-value placeholder">—</span>
              </div>
              <div class="deed-row">
                <span class="deed-label">2 栋房屋</span>
                <span class="deed-value placeholder">—</span>
              </div>
              <div class="deed-row">
                <span class="deed-label">3 栋房屋</span>
                <span class="deed-value placeholder">—</span>
              </div>
              <div class="deed-row">
                <span class="deed-label">4 栋房屋</span>
                <span class="deed-value placeholder">—</span>
              </div>
              <div class="deed-row">
                <span class="deed-label">酒店</span>
                <span class="deed-value placeholder">—</span>
              </div>
            </div>

            <div class="result-actions">
              <button class="secondary-btn" @click="reset">重新拍摄</button>
              <button class="primary-btn" disabled style="opacity:.45; cursor:not-allowed;">
                确认录入
              </button>
            </div>
          </div>
        </template>

      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

defineEmits(['close'])

// phase: 'idle' | 'scanning' | 'result'
const phase = ref('idle')
const previewUrl = ref('')

function onFileSelected(e) {
  const file = e.target.files?.[0]
  if (!file) return

  const url = URL.createObjectURL(file)
  previewUrl.value = url
  phase.value = 'scanning'

  // TODO: 此处调用 OCR / AI Vision API，完成后切换到 'result'
  // 目前模拟 1.5s 后进入占位结果界面
  setTimeout(() => {
    phase.value = 'result'
  }, 1500)
}

function reset() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
  phase.value = 'idle'
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
  max-height: 88vh;
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
  padding: 20px 20px 32px;
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
  border: 1px solid rgba(255,255,255,.12);
}
.secondary-btn:hover { background: rgba(255,255,255,.12); }
.secondary-btn:active { transform: scale(.97); }

/* 文件选择隐藏 input */
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
  max-height: 220px;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid rgba(124,58,237,.4);
}
.preview-img {
  width: 100%;
  max-height: 220px;
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

/* ── 识别结果 ── */
.result-area {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.todo-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(251,191,36,.08);
  border: 1px solid rgba(251,191,36,.25);
  border-radius: 10px;
  padding: 10px 14px;
  color: #fbbf24;
  font-size: 13px;
  font-weight: 600;
}
.todo-icon {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  flex-shrink: 0;
}
.result-sub {
  color: #64748b;
  font-size: 12px;
  line-height: 1.55;
  margin: 0;
}

/* ── 地契信息卡 ── */
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
  padding: 10px 14px;
  font-size: 13px;
}
.deed-row + .deed-row {
  border-top: 1px solid rgba(255,255,255,.06);
}
.deed-label {
  color: #94a3b8;
}
.deed-value {
  font-weight: 700;
  color: #e2e8f0;
}
.deed-value.placeholder {
  color: rgba(255,255,255,.2);
}
.deed-divider {
  height: 1px;
  background: rgba(124,58,237,.3);
  margin: 2px 0;
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
