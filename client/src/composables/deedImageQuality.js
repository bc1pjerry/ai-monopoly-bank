const DEFAULT_FOCUS_READY_SCORE = 0.42
const FOCUS_SOFT_VARIANCE = 24
const FOCUS_SHARP_VARIANCE = 180

export function measureImageSharpness(data, width, height) {
  if (!data || width < 3 || height < 3) return 0

  let count = 0
  let sum = 0
  let sumSquares = 0

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const center = luminanceAt(data, width, x, y)
      const laplacian =
        4 * center -
        luminanceAt(data, width, x - 1, y) -
        luminanceAt(data, width, x + 1, y) -
        luminanceAt(data, width, x, y - 1) -
        luminanceAt(data, width, x, y + 1)

      sum += laplacian
      sumSquares += laplacian * laplacian
      count += 1
    }
  }

  if (count === 0) return 0
  const mean = sum / count
  return Math.max(0, sumSquares / count - mean * mean)
}

export function getFocusReadiness(sharpness, readyScore = DEFAULT_FOCUS_READY_SCORE) {
  const score = clamp01((sharpness - FOCUS_SOFT_VARIANCE) / (FOCUS_SHARP_VARIANCE - FOCUS_SOFT_VARIANCE))
  return {
    score,
    ready: score >= readyScore
  }
}

function luminanceAt(data, width, x, y) {
  const idx = (y * width + x) * 4
  return data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}
