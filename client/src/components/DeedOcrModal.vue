<template>
  <div class="ocr-overlay" @click.self="closeModal">
    <div class="ocr-sheet">
      <div class="ocr-header">
        <span class="ocr-title">扫描资产卡</span>
        <button class="ocr-close" @click="closeModal">✕</button>
      </div>

      <div class="ocr-body">
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
            <p class="guide-tip">拍摄资产卡片，AI 将自动识别<br/>名称、价格、规则及过路费</p>
          </div>

          <div class="action-btns">
            <button class="primary-btn" type="button" @click="startLiveScan">
              <svg viewBox="0 0 20 20" fill="none" class="btn-icon">
                <rect x="2" y="4" width="16" height="12" rx="3" stroke="currentColor" stroke-width="1.6"/>
                <path d="M6 8.5h8M6 11.5h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                <path d="M4 3v3M16 3v3M4 14v3M16 14v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
              </svg>
              实时扫描
            </button>

            <label class="secondary-btn camera-label">
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

        <template v-else-if="phase === 'camera'">
          <div class="camera-area">
            <div class="camera-frame" :class="{ 'camera-frame--locked': stableFrames >= STABLE_FRAME_TARGET }">
              <video ref="videoRef" class="camera-video" autoplay muted playsinline></video>
              <canvas ref="overlayRef" class="camera-overlay"></canvas>
              <div class="camera-corners" aria-hidden="true">
                <span class="corner corner-tl"></span>
                <span class="corner corner-tr"></span>
                <span class="corner corner-bl"></span>
                <span class="corner corner-br"></span>
              </div>
            </div>

            <div class="camera-status">
              <span class="status-dot" :class="{ 'status-dot--ready': detectedQuad }"></span>
              <span>{{ cameraHint }}</span>
            </div>

            <label v-if="cameraDevices.length > 1" class="camera-picker">
              <span>镜头</span>
              <select v-model="selectedCameraId" :disabled="isSwitchingCamera" @change="switchCamera">
                <option
                  v-for="camera in cameraDevices"
                  :key="camera.deviceId"
                  :value="camera.deviceId"
                >
                  {{ camera.label }}
                </option>
              </select>
            </label>

            <div class="lock-meter" aria-hidden="true">
              <span :style="{ width: `${lockProgress}%` }"></span>
            </div>

            <div class="camera-actions">
              <button class="secondary-btn" type="button" @click="reset">取消</button>
              <button class="primary-btn" type="button" @click="captureFromCamera(false)" :disabled="isAutoCapturing">
                拍摄识别
              </button>
            </div>

            <label class="album-inline">
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

        <template v-else-if="phase === 'scanning'">
          <div class="scanning-area">
            <div class="preview-wrap">
              <img :src="previewUrl" class="preview-img" alt="地契预览" />
              <div class="scan-line"></div>
            </div>
            <p class="scanning-tip">小米 Mimo AI 正在识别地契信息…</p>
          </div>
        </template>

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

        <template v-else-if="phase === 'result'">
          <div class="result-area">
            <div class="preview-thumb-wrap">
              <img :src="previewUrl" class="preview-thumb" alt="地契" />
            </div>

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
              <div class="deed-row">
                <span class="deed-label">卡片类型</span>
                <select v-model="deed.cardType" class="deed-input deed-select" @change="onCardTypeChanged">
                  <option value="deed">普通地契</option>
                  <option value="special">特殊资产</option>
                </select>
              </div>
              <template v-if="deed.cardType === 'special'">
                <div class="deed-row">
                  <span class="deed-label">同类分组</span>
                  <input v-model.trim="deed.groupKey" class="deed-input" placeholder="如：铁路 / 车站 / 港口" maxlength="30" />
                </div>
                <div class="deed-row">
                  <span class="deed-label">计费规则</span>
                  <select v-model="deed.ruleKind" class="deed-input deed-select" @change="onRuleKindChanged">
                    <option value="count_tier">同类越多越贵</option>
                    <option value="pair_bonus">两张成套高额</option>
                    <option value="dice_multiplier">骰点乘倍数</option>
                  </select>
                </div>
                <template v-if="deed.ruleKind === 'count_tier'">
                  <div class="deed-divider"></div>
                  <div class="deed-row" v-for="(_, i) in deed.ruleData.rentsByOwned" :key="`tier-${i}`">
                    <span class="deed-label">持有 {{ i + 1 }} 张</span>
                    <div class="deed-price-wrap">
                      <span class="deed-currency">¥</span>
                      <input v-model.number="deed.ruleData.rentsByOwned[i]" class="deed-input deed-input-num" type="number" placeholder="—" min="0" />
                    </div>
                  </div>
                </template>
                <template v-else-if="deed.ruleKind === 'pair_bonus'">
                  <div class="deed-divider"></div>
                  <div class="deed-row">
                    <span class="deed-label">单张过路费</span>
                    <div class="deed-price-wrap">
                      <span class="deed-currency">¥</span>
                      <input v-model.number="deed.ruleData.singleRent" class="deed-input deed-input-num" type="number" placeholder="—" min="0" />
                    </div>
                  </div>
                  <div class="deed-row">
                    <span class="deed-label">成套过路费</span>
                    <div class="deed-price-wrap">
                      <span class="deed-currency">¥</span>
                      <input v-model.number="deed.ruleData.pairRent" class="deed-input deed-input-num" type="number" placeholder="—" min="0" />
                    </div>
                  </div>
                </template>
                <template v-else-if="deed.ruleKind === 'dice_multiplier'">
                  <div class="deed-divider"></div>
                  <div class="deed-row" v-for="(_, i) in deed.ruleData.multipliersByOwned" :key="`mult-${i}`">
                    <span class="deed-label">持有 {{ i + 1 }} 张倍数</span>
                    <input v-model.number="deed.ruleData.multipliersByOwned[i]" class="deed-input deed-input-num" type="number" placeholder="—" min="0" />
                  </div>
                </template>
              </template>
              <template v-else>
                <div class="deed-row">
                  <span class="deed-label">每层加盖费用</span>
                  <div class="deed-price-wrap">
                    <span class="deed-currency">¥</span>
                    <input
                      v-model.number="deed.buildUnitCost"
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
              </template>
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
import { computed, nextTick, onBeforeUnmount, reactive, ref } from 'vue'
import { buildDeedCameraConstraints, formatCameraLabel } from '../composables/cameraConstraints.js'
import { getFocusReadiness, measureImageSharpness } from '../composables/deedImageQuality.js'

const emit = defineEmits(['close', 'deed-confirmed'])

const OPEN_CV_URL = '/opencv.js'
const STABLE_FRAME_TARGET = 8
const DETECTION_INTERVAL = 90
const MIN_SCORE_TO_DRAW = 0.38
const MIN_SCORE_TO_LOCK = 0.52
const MISS_FRAME_TOLERANCE = 4
const CANDIDATE_EVALUATION_LIMIT = 6
const CARD_ASPECT_RATIO = 1.58
const FOCUS_SAMPLE_MAX_SIDE = 260

const phase = ref('idle')
const previewUrl = ref('')
const errorMsg = ref('')
const cameraHint = ref('正在打开摄像头…')
const detectedQuad = ref(null)
const stableFrames = ref(0)
const isAutoCapturing = ref(false)
const cameraDevices = ref([])
const selectedCameraId = ref('')
const isSwitchingCamera = ref(false)

const videoRef = ref(null)
const overlayRef = ref(null)

const workCanvas = document.createElement('canvas')
const fullCanvas = document.createElement('canvas')
const focusCanvas = document.createElement('canvas')
let stream = null
let rafId = 0
let lastDetectionAt = 0
let lastQuad = null
let lastCandidate = null
let missedFrames = 0
let cvReady = false

const rentLabels = ['空地过路费', '1 栋过路费', '2 栋过路费', '3 栋过路费', '4 栋过路费', '酒店过路费']

const deed = reactive({
  name: '',
  price: null,
  cardType: 'deed',
  groupKey: '',
  ruleKind: 'buildable',
  ruleData: {
    rentsByOwned: [null, null, null, null],
    singleRent: null,
    pairRent: null,
    pairSize: 2,
    multipliersByOwned: [null, null]
  },
  buildUnitCost: null,
  rents: [null, null, null, null, null, null]
})

const lockProgress = computed(() => Math.min(100, Math.round(stableFrames.value / STABLE_FRAME_TARGET * 100)))

async function startLiveScan() {
  clearError()
  resetDeed()
  phase.value = 'camera'
  isAutoCapturing.value = false
  resetCameraLock('正在打开摄像头…')

  await nextTick()
  await openCameraStream(selectedCameraId.value)
}

async function openCameraStream(deviceId = '') {
  stopCamera()
  resetCameraLock(isSwitchingCamera.value ? '正在切换镜头…' : '正在打开摄像头…')

  try {
    stream = await navigator.mediaDevices.getUserMedia(buildDeedCameraConstraints(deviceId))
    await tuneCameraTrack(stream)
  } catch (err) {
    if (!deviceId) {
      phase.value = 'error'
      errorMsg.value = '浏览器未允许实时摄像头。可以改用“拍照识别”，或在 HTTPS/localhost 环境下打开实时扫描。'
      return
    }

    try {
      selectedCameraId.value = ''
      stream = await navigator.mediaDevices.getUserMedia(buildDeedCameraConstraints())
      await tuneCameraTrack(stream)
    } catch {
      phase.value = 'error'
      errorMsg.value = '无法打开所选摄像头。可以改用“拍照识别”，或在 HTTPS/localhost 环境下打开实时扫描。'
      return
    }
  }

  const video = videoRef.value
  if (!video) return
  video.srcObject = stream
  await waitForVideo(video)
  syncSelectedCameraFromTrack(stream)
  await refreshCameraDevices()

  try {
    await loadOpenCv()
    cvReady = true
    cameraHint.value = '将地契放入画面'
  } catch (err) {
    cvReady = false
    cameraHint.value = '轮廓组件加载失败，可手动拍摄'
  }

  drawOverlay()
  startDetectionLoop()
}

function resetCameraLock(hint = '将地契放入画面') {
  cameraHint.value = hint
  detectedQuad.value = null
  stableFrames.value = 0
  lastQuad = null
  lastCandidate = null
  missedFrames = 0
}

async function refreshCameraDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    cameraDevices.value = devices
      .filter((device) => device.kind === 'videoinput')
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: formatCameraLabel(device, index)
      }))
  } catch {
    cameraDevices.value = []
  }
}

function syncSelectedCameraFromTrack(mediaStream) {
  const [track] = mediaStream.getVideoTracks()
  const deviceId = track?.getSettings?.().deviceId
  if (deviceId) selectedCameraId.value = deviceId
}

async function switchCamera() {
  if (phase.value !== 'camera' || isSwitchingCamera.value) return
  clearError()
  isSwitchingCamera.value = true
  try {
    await openCameraStream(selectedCameraId.value)
  } finally {
    isSwitchingCamera.value = false
  }
}

function waitForVideo(video) {
  return new Promise((resolve, reject) => {
    const done = () => {
      video.play().then(resolve).catch(resolve)
    }
    if (video.readyState >= 2 && video.videoWidth > 0) return done()
    video.onloadedmetadata = done
    video.onerror = () => reject(new Error('摄像头画面加载失败'))
  })
}

function loadOpenCv() {
  if (window.cv?.Mat) return Promise.resolve()
  if (window.__deedCvLoading) return window.__deedCvLoading

  window.__deedCvLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    const timeoutId = window.setTimeout(() => reject(new Error('OpenCV 加载超时')), 18000)

    script.src = OPEN_CV_URL
    script.async = true
    script.onload = () => {
      const finish = () => {
        window.clearTimeout(timeoutId)
        resolve()
      }
      if (window.cv?.Mat) return finish()
      if (window.cv) window.cv.onRuntimeInitialized = finish
      else reject(new Error('OpenCV 初始化失败'))
    }
    script.onerror = () => {
      window.clearTimeout(timeoutId)
      reject(new Error('OpenCV 加载失败'))
    }
    document.head.appendChild(script)
  })

  return window.__deedCvLoading
}

async function tuneCameraTrack(mediaStream) {
  const [track] = mediaStream.getVideoTracks()
  if (!track?.getCapabilities || !track.applyConstraints) return

  const capabilities = track.getCapabilities()
  const advanced = {}
  if (capabilities.focusMode?.includes('continuous')) advanced.focusMode = 'continuous'
  if (capabilities.exposureMode?.includes('continuous')) advanced.exposureMode = 'continuous'
  if (capabilities.whiteBalanceMode?.includes('continuous')) advanced.whiteBalanceMode = 'continuous'

  if (Object.keys(advanced).length === 0) return
  try {
    await track.applyConstraints({ advanced: [advanced] })
  } catch {
    // Some mobile browsers expose capabilities but reject advanced constraints.
  }
}

function startDetectionLoop() {
  cancelAnimationFrame(rafId)
  const tick = (now) => {
    if (phase.value !== 'camera') return
    if (cvReady && now - lastDetectionAt > DETECTION_INTERVAL) {
      lastDetectionAt = now
      runDetection()
    } else {
      drawOverlay(lastCandidate?.quad)
    }
    rafId = requestAnimationFrame(tick)
  }
  rafId = requestAnimationFrame(tick)
}

function runDetection() {
  const video = videoRef.value
  if (!video || video.videoWidth === 0 || video.videoHeight === 0 || isAutoCapturing.value) return

  const candidate = findBestQuad(video)
  if (!candidate || candidate.score < MIN_SCORE_TO_DRAW) {
    missedFrames += 1
    stableFrames.value = Math.max(0, stableFrames.value - 1)

    if (lastCandidate && missedFrames <= MISS_FRAME_TOLERANCE) {
      detectedQuad.value = lastCandidate.quad
      cameraHint.value = '边缘短暂丢失，请保持稳定'
      drawOverlay(lastCandidate.quad, lastCandidate.score)
      return
    }

    lastCandidate = null
    lastQuad = null
    detectedQuad.value = null
    stableFrames.value = 0
    cameraHint.value = '未找到清晰边缘'
    drawOverlay()
    return
  }

  missedFrames = 0
  const quad = smoothQuad(lastCandidate?.quad, candidate.quad, video)
  const smoothedCandidate = { ...candidate, quad }
  lastCandidate = smoothedCandidate
  detectedQuad.value = quad

  const focus = measureQuadFocus(video, quad)
  if (!focus.ready) {
    stableFrames.value = Math.max(0, stableFrames.value - 1)
    lastQuad = quad
    cameraHint.value = focus.score < 0.2
      ? '画面偏糊，稍微后退等待对焦'
      : '画面还不够清晰，请保持稳定'
    drawOverlay(quad, candidate.score)
    return
  }

  if (candidate.score >= MIN_SCORE_TO_LOCK && isSimilarQuad(quad, lastQuad, video, 0.055)) {
    stableFrames.value += 1
  } else if (candidate.score >= MIN_SCORE_TO_LOCK) {
    stableFrames.value = 1
  } else {
    stableFrames.value = 0
  }

  lastQuad = quad
  cameraHint.value = stableFrames.value >= STABLE_FRAME_TARGET
    ? '已锁定，正在识别…'
    : candidate.score >= MIN_SCORE_TO_LOCK ? '保持地契稳定' : '已找到轮廓，调整角度或光线'
  drawOverlay(quad, candidate.score)

  if (stableFrames.value >= STABLE_FRAME_TARGET) {
    captureFromCamera(true)
  }
}

function findBestQuad(video) {
  const cv = window.cv
  const maxSide = 720
  const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight))
  const width = Math.max(1, Math.round(video.videoWidth * scale))
  const height = Math.max(1, Math.round(video.videoHeight * scale))
  workCanvas.width = width
  workCanvas.height = height
  workCanvas.getContext('2d', { willReadFrequently: true }).drawImage(video, 0, 0, width, height)

  const src = cv.imread(workCanvas)
  const gray = new cv.Mat()
  const equalized = new cv.Mat()
  const blur = new cv.Mat()
  const edgesLow = new cv.Mat()
  const edgesHigh = new cv.Mat()
  const dilated = new cv.Mat()
  const thresh = new cv.Mat()
  const combined = new cv.Mat()
  const closed = new cv.Mat()
  const kernel = cv.Mat.ones(3, 3, cv.CV_8U)
  const closeKernel = cv.Mat.ones(5, 5, cv.CV_8U)
  const candidates = []

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    cv.equalizeHist(gray, equalized)
    cv.GaussianBlur(equalized, blur, new cv.Size(5, 5), 0)
    cv.Canny(blur, edgesLow, 18, 82)
    cv.Canny(blur, edgesHigh, 48, 150)
    cv.adaptiveThreshold(blur, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 37, 5)
    cv.bitwise_not(thresh, thresh)
    cv.bitwise_or(edgesLow, edgesHigh, combined)
    cv.bitwise_or(combined, thresh, combined)
    cv.morphologyEx(combined, closed, cv.MORPH_CLOSE, closeKernel)
    cv.dilate(closed, dilated, kernel)

    collectQuadCandidates(dilated, cv.RETR_LIST, scale, width, height, video, candidates)
    collectQuadCandidates(edgesHigh, cv.RETR_EXTERNAL, scale, width, height, video, candidates)
  } finally {
    src.delete()
    gray.delete()
    equalized.delete()
    blur.delete()
    edgesLow.delete()
    edgesHigh.delete()
    dilated.delete()
    thresh.delete()
    combined.delete()
    closed.delete()
    kernel.delete()
    closeKernel.delete()
  }

  const bestGeometry = dedupeCandidates(candidates)
    .sort((a, b) => b.geometryScore - a.geometryScore)
    .slice(0, CANDIDATE_EVALUATION_LIMIT)
    .map((candidate) => ({
      ...candidate,
      score: scoreQuad(candidate.quad, video, candidate.areaRatio) * candidate.sourceWeight
    }))
    .sort((a, b) => b.score - a.score)

  return bestGeometry[0] || null
}

function collectQuadCandidates(mask, retrievalMode, scale, width, height, video, candidates) {
  const cv = window.cv
  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()
  const frameArea = width * height

  try {
    cv.findContours(mask, contours, hierarchy, retrievalMode, cv.CHAIN_APPROX_SIMPLE)

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i)
      try {
        const area = Math.abs(cv.contourArea(contour))
        const areaRatio = area / frameArea
        if (areaRatio < 0.035 || areaRatio > 0.92) continue

        const perimeter = cv.arcLength(contour, true)
        if (perimeter < Math.min(width, height) * 0.55) continue

        addContourQuads(contour, areaRatio, scale, width, height, video, candidates)
      } finally {
        contour.delete()
      }
    }
  } finally {
    contours.delete()
    hierarchy.delete()
  }
}

function addContourQuads(contour, areaRatio, scale, width, height, video, candidates) {
  const cv = window.cv
  const perimeter = cv.arcLength(contour, true)
  const frameArea = width * height
  const epsilons = [0.015, 0.025, 0.04, 0.065]

  const pushSmallQuad = (smallQuad, sourceWeight = 1) => {
    if (!smallQuad || !hasDistinctCorners(smallQuad)) return
    const ordered = orderQuad(smallQuad)
    const quadAreaRatio = Math.abs(polygonArea(ordered)) / frameArea
    if (quadAreaRatio < 0.045 || quadAreaRatio > 0.92) return

    const quad = ordered.map((p) => ({ x: p.x / scale, y: p.y / scale }))
    const geometryScore = scoreQuadGeometry(quad, video, quadAreaRatio || areaRatio)
    if (geometryScore >= 0.36) {
      candidates.push({ quad, geometryScore, areaRatio: quadAreaRatio || areaRatio, sourceWeight })
    }
  }

  for (const epsilon of epsilons) {
    const approx = new cv.Mat()
    try {
      cv.approxPolyDP(contour, approx, Math.max(5, perimeter * epsilon), true)
      if (approx.rows === 4 && cv.isContourConvex(approx)) {
        pushSmallQuad(pointsFromMat(approx), 1)
      } else if (approx.rows > 4 && approx.rows <= 14) {
        pushSmallQuad(extremeQuad(pointsFromMat(approx)), 0.9)
      }
    } finally {
      approx.delete()
    }
  }

  const hull = new cv.Mat()
  try {
    cv.convexHull(contour, hull, false, true)
    const hullPerimeter = cv.arcLength(hull, true)
    for (const epsilon of [0.018, 0.032, 0.055]) {
      const approxHull = new cv.Mat()
      try {
        cv.approxPolyDP(hull, approxHull, Math.max(5, hullPerimeter * epsilon), true)
        if (approxHull.rows === 4 && cv.isContourConvex(approxHull)) {
          pushSmallQuad(pointsFromMat(approxHull), 0.96)
        } else if (approxHull.rows > 4 && approxHull.rows <= 16) {
          pushSmallQuad(extremeQuad(pointsFromMat(approxHull)), 0.88)
        }
      } finally {
        approxHull.delete()
      }
    }
  } finally {
    hull.delete()
  }

  try {
    pushSmallQuad(pointsFromRotatedRect(cv.minAreaRect(contour)), 0.82)
  } catch {
    // minAreaRect can fail on a degenerate contour; the approximation paths above still cover normal cases.
  }
}

function pointsFromMat(mat) {
  const points = []
  for (let i = 0; i < mat.rows; i++) {
    points.push({ x: mat.intPtr(i, 0)[0], y: mat.intPtr(i, 0)[1] })
  }
  return orderQuad(points)
}

function pointsFromRotatedRect(rect) {
  return window.cv.RotatedRect.points(rect).map((p) => ({ x: p.x, y: p.y }))
}

function extremeQuad(points) {
  if (points.length < 4) return null
  const topLeft = points.reduce((best, p) => (p.x + p.y < best.x + best.y ? p : best), points[0])
  const bottomRight = points.reduce((best, p) => (p.x + p.y > best.x + best.y ? p : best), points[0])
  const topRight = points.reduce((best, p) => (p.x - p.y > best.x - best.y ? p : best), points[0])
  const bottomLeft = points.reduce((best, p) => (p.x - p.y < best.x - best.y ? p : best), points[0])
  return orderQuad([topLeft, topRight, bottomRight, bottomLeft])
}

function hasDistinctCorners(points) {
  if (points.length !== 4) return false
  const minDistance = Math.max(10, Math.sqrt(Math.abs(polygonArea(points))) * 0.08)
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (distance(points[i], points[j]) < minDistance) return false
    }
  }
  return true
}

function dedupeCandidates(candidates) {
  const unique = []
  for (const candidate of candidates) {
    const duplicate = unique.some((existing) => normalizedQuadDelta(candidate.quad, existing.quad) < 0.025)
    if (!duplicate) unique.push(candidate)
  }
  return unique
}

function normalizedQuadDelta(a, b) {
  const norm = Math.max(1, Math.sqrt(Math.abs(polygonArea(a))))
  return a.reduce((sum, p, i) => sum + distance(p, b[i]), 0) / 4 / norm
}

function scoreQuadGeometry(quad, video, areaRatio) {
  const ordered = orderQuad(quad)
  const w1 = distance(ordered[0], ordered[1])
  const w2 = distance(ordered[3], ordered[2])
  const h1 = distance(ordered[0], ordered[3])
  const h2 = distance(ordered[1], ordered[2])
  const width = (w1 + w2) / 2
  const height = (h1 + h2) / 2
  const longSide = Math.max(width, height)
  const shortSide = Math.max(1, Math.min(width, height))
  const aspect = longSide / shortSide
  const aspectScore = clamp01(1 - Math.abs(aspect - CARD_ASPECT_RATIO) / 0.82)
  const areaScore = areaRatio < 0.12 ? areaRatio / 0.12 : areaRatio > 0.78 ? (0.94 - areaRatio) / 0.16 : 1
  const angleScore = rectangleAngleScore(ordered)
  const centerScore = centerBiasScore(ordered, video)
  return clamp01(areaScore) * 0.24 + aspectScore * 0.28 + angleScore * 0.34 + centerScore * 0.14
}

function scoreQuad(quad, video, areaRatio) {
  const ordered = orderQuad(quad)
  const geometryScore = scoreQuadGeometry(ordered, video, areaRatio)
  const appearanceScore = scoreWarpedAppearance(video, ordered)
  return geometryScore * 0.7 + appearanceScore * 0.3
}

function scoreWarpedAppearance(video, quad) {
  const warped = warpVideoQuadCanvas(video, quad, 360)
  if (!warped) return 0.45

  const canvas = document.createElement('canvas')
  canvas.width = 180
  canvas.height = 112
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(warped, 0, 0, canvas.width, canvas.height)
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  let bright = 0
  let saturated = 0
  let edgeBandSaturated = 0
  const total = canvas.width * canvas.height

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const idx = (y * canvas.width + x) * 4
      const r = data[idx]
      const g = data[idx + 1]
      const b = data[idx + 2]
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      const sat = max - min
      if (r + g + b > 450) bright += 1
      if (sat > 42 && max > 90) saturated += 1
      if ((x < 34 || x > canvas.width - 35 || y < 24 || y > canvas.height - 25) && sat > 48 && max > 90) {
        edgeBandSaturated += 1
      }
    }
  }

  const brightScore = clamp01((bright / total - 0.28) / 0.42)
  const colorScore = clamp01(edgeBandSaturated / 260) * 0.7 + clamp01(saturated / 900) * 0.3
  return clamp01(brightScore * 0.58 + colorScore * 0.42)
}

function measureQuadFocus(video, quad) {
  const warped = warpVideoQuadCanvas(video, quad, 520)
  if (!warped) return getFocusReadiness(0)

  const scale = Math.min(1, FOCUS_SAMPLE_MAX_SIDE / Math.max(warped.width, warped.height))
  focusCanvas.width = Math.max(1, Math.round(warped.width * scale))
  focusCanvas.height = Math.max(1, Math.round(warped.height * scale))

  const ctx = focusCanvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(warped, 0, 0, focusCanvas.width, focusCanvas.height)
  const image = ctx.getImageData(0, 0, focusCanvas.width, focusCanvas.height)
  return getFocusReadiness(measureImageSharpness(image.data, image.width, image.height))
}

function warpVideoQuad(video, quad, maxSide = 1400, quality = 0.86) {
  const canvas = warpVideoQuadCanvas(video, quad, maxSide)
  return canvas ? canvas.toDataURL('image/jpeg', quality) : null
}

function warpVideoQuadCanvas(video, quad, maxSide = 1400) {
  if (!window.cv?.Mat || !quad) return null
  const cv = window.cv
  const ordered = orderQuad(quad)
  const topWidth = distance(ordered[0], ordered[1])
  const bottomWidth = distance(ordered[3], ordered[2])
  const leftHeight = distance(ordered[0], ordered[3])
  const rightHeight = distance(ordered[1], ordered[2])
  let targetWidth = Math.round(Math.max(topWidth, bottomWidth))
  let targetHeight = Math.round(Math.max(leftHeight, rightHeight))
  const ratio = Math.min(1, maxSide / Math.max(targetWidth, targetHeight))
  targetWidth = Math.max(1, Math.round(targetWidth * ratio))
  targetHeight = Math.max(1, Math.round(targetHeight * ratio))

  fullCanvas.width = video.videoWidth
  fullCanvas.height = video.videoHeight
  fullCanvas.getContext('2d').drawImage(video, 0, 0, fullCanvas.width, fullCanvas.height)

  const src = cv.imread(fullCanvas)
  const dst = new cv.Mat()
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    ordered[0].x, ordered[0].y,
    ordered[1].x, ordered[1].y,
    ordered[2].x, ordered[2].y,
    ordered[3].x, ordered[3].y
  ])
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    targetWidth - 1, 0,
    targetWidth - 1, targetHeight - 1,
    0, targetHeight - 1
  ])
  const matrix = cv.getPerspectiveTransform(srcTri, dstTri)
  const outCanvas = document.createElement('canvas')
  outCanvas.width = targetWidth
  outCanvas.height = targetHeight

  try {
    cv.warpPerspective(src, dst, matrix, new cv.Size(targetWidth, targetHeight), cv.INTER_LINEAR, cv.BORDER_REPLICATE)
    cv.imshow(outCanvas, dst)
    return outCanvas
  } catch {
    return null
  } finally {
    src.delete()
    dst.delete()
    srcTri.delete()
    dstTri.delete()
    matrix.delete()
  }
}

async function captureFromCamera(auto = false) {
  if (isAutoCapturing.value || phase.value !== 'camera') return
  isAutoCapturing.value = true

  const video = videoRef.value
  const quad = lastCandidate?.quad && lastCandidate.score >= MIN_SCORE_TO_DRAW ? lastCandidate.quad : null
  let dataUrl = quad ? warpVideoQuad(video, quad, 1600, 0.88) : null

  if (!dataUrl) {
    fullCanvas.width = video.videoWidth
    fullCanvas.height = video.videoHeight
    fullCanvas.getContext('2d').drawImage(video, 0, 0, fullCanvas.width, fullCanvas.height)
    dataUrl = fullCanvas.toDataURL('image/jpeg', 0.86)
  }

  stopCamera()
  previewUrl.value = dataUrl
  phase.value = 'scanning'

  const jpegDataUrl = await toJpeg(dataUrl)
  await recognizeDeed(jpegDataUrl)
  isAutoCapturing.value = false
}

function drawOverlay(quad = null, score = 0) {
  const canvas = overlayRef.value
  const video = videoRef.value
  if (!canvas || !video) return

  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.max(1, Math.round(rect.width * dpr))
  canvas.height = Math.max(1, Math.round(rect.height * dpr))

  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, rect.width, rect.height)

  if (!quad) return

  const mapped = mapVideoQuadToElement(quad, video, rect.width, rect.height)
  const locked = stableFrames.value >= STABLE_FRAME_TARGET - 2
  ctx.lineWidth = locked ? 4 : 3
  ctx.strokeStyle = locked ? '#34d399' : score >= MIN_SCORE_TO_LOCK ? '#fbbf24' : '#60a5fa'
  ctx.fillStyle = locked ? 'rgba(52, 211, 153, .12)' : 'rgba(96, 165, 250, .1)'
  ctx.shadowColor = ctx.strokeStyle
  ctx.shadowBlur = 12

  ctx.beginPath()
  ctx.moveTo(mapped[0].x, mapped[0].y)
  for (let i = 1; i < mapped.length; i++) ctx.lineTo(mapped[i].x, mapped[i].y)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  ctx.shadowBlur = 0
  mapped.forEach((p) => {
    ctx.beginPath()
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2)
    ctx.fillStyle = '#f8fafc'
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = locked ? '#10b981' : '#2563eb'
    ctx.stroke()
  })
}

function mapVideoQuadToElement(quad, video, width, height) {
  const videoRatio = video.videoWidth / video.videoHeight
  const elementRatio = width / height
  let drawWidth = width
  let drawHeight = height
  let offsetX = 0
  let offsetY = 0

  if (videoRatio > elementRatio) {
    drawHeight = height
    drawWidth = height * videoRatio
    offsetX = (width - drawWidth) / 2
  } else {
    drawWidth = width
    drawHeight = width / videoRatio
    offsetY = (height - drawHeight) / 2
  }

  return quad.map((p) => ({
    x: offsetX + (p.x / video.videoWidth) * drawWidth,
    y: offsetY + (p.y / video.videoHeight) * drawHeight
  }))
}

function isSimilarQuad(a, b, video, tolerance = 0.04) {
  if (!a || !b) return false
  const diag = Math.hypot(video.videoWidth, video.videoHeight)
  const avgDelta = a.reduce((sum, p, i) => sum + distance(p, b[i]), 0) / 4
  return avgDelta / diag < tolerance
}

function smoothQuad(previous, next, video) {
  if (!previous || !isSimilarQuad(next, previous, video, 0.085)) return next
  const keep = 0.62
  return next.map((point, index) => ({
    x: previous[index].x * keep + point.x * (1 - keep),
    y: previous[index].y * keep + point.y * (1 - keep)
  }))
}

function orderQuad(points) {
  const center = points.reduce((acc, p) => ({ x: acc.x + p.x / points.length, y: acc.y + p.y / points.length }), { x: 0, y: 0 })
  const sorted = [...points].sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x))
  const start = sorted.reduce((bestIdx, p, idx) => (p.x + p.y < sorted[bestIdx].x + sorted[bestIdx].y ? idx : bestIdx), 0)
  return [...sorted.slice(start), ...sorted.slice(0, start)]
}

function rectangleAngleScore(points) {
  const scores = []
  for (let i = 0; i < 4; i++) {
    const prev = points[(i + 3) % 4]
    const cur = points[i]
    const next = points[(i + 1) % 4]
    const v1 = { x: prev.x - cur.x, y: prev.y - cur.y }
    const v2 = { x: next.x - cur.x, y: next.y - cur.y }
    const denom = Math.max(1, Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y))
    scores.push(1 - Math.min(1, Math.abs((v1.x * v2.x + v1.y * v2.y) / denom) / 0.35))
  }
  return scores.reduce((sum, v) => sum + v, 0) / scores.length
}

function polygonArea(points) {
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const current = points[i]
    const next = points[(i + 1) % points.length]
    area += current.x * next.y - next.x * current.y
  }
  return area / 2
}

function centerBiasScore(points, video) {
  const center = points.reduce((acc, p) => ({ x: acc.x + p.x / 4, y: acc.y + p.y / 4 }), { x: 0, y: 0 })
  const dx = Math.abs(center.x / video.videoWidth - 0.5)
  const dy = Math.abs(center.y / video.videoHeight - 0.5)
  return clamp01(1 - Math.hypot(dx, dy) / 0.55)
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

function onFileSelected(e) {
  const file = e.target.files?.[0]
  if (!file) return
  e.target.value = ''
  stopCamera()

  const reader = new FileReader()
  reader.onload = async (ev) => {
    const dataUrl = ev.target.result
    previewUrl.value = dataUrl
    phase.value = 'scanning'
    const jpegDataUrl = await toJpeg(dataUrl)
    await recognizeDeed(jpegDataUrl)
  }
  reader.readAsDataURL(file)
}

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
    deed.name = d.name ?? ''
    deed.price = d.price ?? null
    deed.cardType = d.cardType === 'special' ? 'special' : 'deed'
    deed.ruleKind = deed.cardType === 'special' ? normalizeRuleKind(d.ruleKind) : 'buildable'
    deed.groupKey = d.groupKey ?? d.group_key ?? ''
    applyRuleData(d.ruleData ?? d.rule_data ?? {})
    deed.buildUnitCost = d.buildUnitCost ?? null
    deed.rents = Array.from({ length: 6 }, (_, i) => d.rents?.[i] ?? null)
    phase.value = 'result'
  } catch (err) {
    errorMsg.value = err.message
    phase.value = 'error'
  }
}

function reset() {
  stopCamera()
  if (previewUrl.value.startsWith('blob:')) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
  detectedQuad.value = null
  stableFrames.value = 0
  isAutoCapturing.value = false
  lastQuad = null
  lastCandidate = null
  missedFrames = 0
  clearError()
  resetDeed()
  phase.value = 'idle'
}

function resetDeed() {
  deed.name = ''
  deed.price = null
  deed.cardType = 'deed'
  deed.groupKey = ''
  deed.ruleKind = 'buildable'
  deed.ruleData = defaultRuleData()
  deed.buildUnitCost = null
  deed.rents = [null, null, null, null, null, null]
}

function clearError() {
  errorMsg.value = ''
}

function stopCamera() {
  cancelAnimationFrame(rafId)
  rafId = 0
  if (stream) {
    stream.getTracks().forEach((track) => track.stop())
    stream = null
  }
  if (videoRef.value) videoRef.value.srcObject = null
}

function closeModal() {
  stopCamera()
  emit('close')
}

function confirm() {
  emit('deed-confirmed', {
    name: deed.name,
    price: deed.price,
    cardType: deed.cardType,
    groupKey: deed.groupKey,
    ruleKind: deed.cardType === 'special' ? deed.ruleKind : 'buildable',
    ruleData: normalizedRuleData(),
    buildUnitCost: deed.buildUnitCost,
    rents: [...deed.rents]
  })
  closeModal()
}

function defaultRuleData() {
  return {
    rentsByOwned: [null, null, null, null],
    singleRent: null,
    pairRent: null,
    pairSize: 2,
    multipliersByOwned: [null, null]
  }
}

function normalizeRuleKind(value) {
  return ['count_tier', 'pair_bonus', 'dice_multiplier'].includes(value) ? value : 'count_tier'
}

function normalizeArray(values, length) {
  return Array.from({ length }, (_, i) => values?.[i] ?? null)
}

function applyRuleData(data) {
  const next = defaultRuleData()
  next.rentsByOwned = normalizeArray(data.rentsByOwned ?? data.rents ?? data.tiers ?? data.amounts, 4)
  next.singleRent = data.singleRent ?? data.single ?? data.rent ?? data.rents?.[0] ?? null
  next.pairRent = data.pairRent ?? data.bothRent ?? data.fullSetRent ?? data.rents?.[1] ?? null
  next.pairSize = data.pairSize ?? data.setSize ?? 2
  next.multipliersByOwned = normalizeArray(data.multipliersByOwned ?? data.multipliers ?? data.tiers, 2)
  deed.ruleData = next
}

function onCardTypeChanged() {
  if (deed.cardType === 'special') {
    deed.ruleKind = normalizeRuleKind(deed.ruleKind)
    if (!deed.groupKey) deed.groupKey = deed.name || ''
  } else {
    deed.ruleKind = 'buildable'
    deed.groupKey = ''
  }
}

function onRuleKindChanged() {
  deed.ruleKind = normalizeRuleKind(deed.ruleKind)
}

function cleanNumber(value) {
  const n = Math.floor(Number(value))
  return Number.isFinite(n) && n >= 0 ? n : null
}

function cleanArray(values) {
  return values.map(cleanNumber).filter(v => v != null)
}

function normalizedRuleData() {
  if (deed.cardType !== 'special') return {}
  if (deed.ruleKind === 'pair_bonus') {
    return {
      singleRent: cleanNumber(deed.ruleData.singleRent) ?? 0,
      pairRent: cleanNumber(deed.ruleData.pairRent) ?? 0,
      pairSize: Math.max(2, cleanNumber(deed.ruleData.pairSize) ?? 2)
    }
  }
  if (deed.ruleKind === 'dice_multiplier') {
    return { multipliersByOwned: cleanArray(deed.ruleData.multipliersByOwned) }
  }
  return { rentsByOwned: cleanArray(deed.ruleData.rentsByOwned) }
}

onBeforeUnmount(() => {
  stopCamera()
})
</script>

<style scoped>
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

.ocr-sheet {
  width: 100%;
  max-width: 480px;
  max-height: 96vh;
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

.ocr-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 20px 36px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

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
  transition: opacity .15s, transform .1s, background .15s;
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
.primary-btn:disabled {
  opacity: .65;
  cursor: wait;
}
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

.camera-area {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.camera-frame {
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 4;
  overflow: hidden;
  border-radius: 16px;
  background: #020617;
  border: 1px solid rgba(255,255,255,.12);
}
.camera-frame--locked {
  border-color: rgba(52, 211, 153, .85);
  box-shadow: 0 0 0 1px rgba(52, 211, 153, .25), 0 0 22px rgba(16, 185, 129, .25);
}
.camera-video,
.camera-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.camera-video {
  object-fit: cover;
  background: #020617;
}
.camera-overlay {
  pointer-events: none;
}
.camera-corners {
  position: absolute;
  inset: 16px;
  pointer-events: none;
}
.corner {
  position: absolute;
  width: 24px;
  height: 24px;
  border-color: rgba(226, 232, 240, .76);
  border-style: solid;
}
.corner-tl { top: 0; left: 0; border-width: 2px 0 0 2px; border-radius: 4px 0 0 0; }
.corner-tr { top: 0; right: 0; border-width: 2px 2px 0 0; border-radius: 0 4px 0 0; }
.corner-bl { bottom: 0; left: 0; border-width: 0 0 2px 2px; border-radius: 0 0 0 4px; }
.corner-br { bottom: 0; right: 0; border-width: 0 2px 2px 0; border-radius: 0 0 4px 0; }

.camera-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 22px;
  color: #cbd5e1;
  font-size: 13px;
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #64748b;
}
.status-dot--ready {
  background: #34d399;
  box-shadow: 0 0 10px rgba(52, 211, 153, .75);
}
.camera-picker {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  color: #cbd5e1;
  font-size: 13px;
  font-weight: 700;
}
.camera-picker span {
  color: #94a3b8;
}
.camera-picker select {
  width: 100%;
  min-width: 0;
  height: 38px;
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 10px;
  background: rgba(15,23,42,.92);
  color: #e2e8f0;
  font-size: 13px;
  font-weight: 700;
  padding: 0 34px 0 10px;
}
.camera-picker select:disabled {
  opacity: .65;
}
.lock-meter {
  width: 100%;
  height: 5px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255,255,255,.08);
}
.lock-meter span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #38bdf8, #34d399);
  transition: width .12s ease;
}
.camera-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.album-inline {
  position: relative;
  display: flex;
  justify-content: center;
  color: #a78bfa;
  font-size: 13px;
  font-weight: 700;
  padding: 6px 0 2px;
  cursor: pointer;
}

.scanning-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}
.preview-wrap {
  position: relative;
  width: 100%;
  max-height: 360px;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid rgba(124,58,237,.4);
}
.preview-img {
  width: 100%;
  max-height: 360px;
  object-fit: contain;
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
  color: #94a3b8;
  font-size: 12px;
  line-height: 1.55;
  margin: 0;
  word-break: break-word;
}

.result-area {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.preview-thumb-wrap {
  width: 100%;
  height: 140px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(124,58,237,.3);
}
.preview-thumb {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

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
.deed-select {
  text-align: left;
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
