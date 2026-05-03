import test from 'node:test'
import assert from 'node:assert/strict'

import { getFocusReadiness, measureImageSharpness } from './deedImageQuality.js'

function makeImageData(width, height, pixelFor) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      const value = pixelFor(x, y)
      data[idx] = value
      data[idx + 1] = value
      data[idx + 2] = value
      data[idx + 3] = 255
    }
  }
  return { data, width, height }
}

test('sharp text-like edges are considered ready for auto capture', () => {
  const image = makeImageData(64, 40, (x, y) => {
    const inLine = y % 8 === 2 || y % 8 === 3
    const inStroke = x % 12 === 4 || x % 12 === 5
    return inLine || inStroke ? 24 : 232
  })

  const sharpness = measureImageSharpness(image.data, image.width, image.height)
  const readiness = getFocusReadiness(sharpness)

  assert.equal(readiness.ready, true)
  assert.ok(readiness.score >= 0.75)
})

test('soft unfocused frames are blocked from auto capture', () => {
  const image = makeImageData(64, 40, (x, y) => 118 + Math.round(Math.sin(x / 8) * 8 + Math.cos(y / 7) * 7))

  const sharpness = measureImageSharpness(image.data, image.width, image.height)
  const readiness = getFocusReadiness(sharpness)

  assert.equal(readiness.ready, false)
  assert.ok(readiness.score < 0.35)
})
