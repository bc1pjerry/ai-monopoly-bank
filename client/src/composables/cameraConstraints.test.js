import test from 'node:test'
import assert from 'node:assert/strict'

import { buildDeedCameraConstraints, formatCameraLabel } from './cameraConstraints.js'

test('default deed camera constraints prefer the rear camera', () => {
  const constraints = buildDeedCameraConstraints()

  assert.deepEqual(constraints.video.facingMode, { ideal: 'environment' })
  assert.deepEqual(constraints.video.width, { ideal: 1280 })
  assert.deepEqual(constraints.video.height, { ideal: 720 })
  assert.deepEqual(constraints.video.focusMode, { ideal: 'continuous' })
  assert.equal(constraints.audio, false)
})

test('selected camera constraints require the chosen device id', () => {
  const constraints = buildDeedCameraConstraints('camera-2')

  assert.deepEqual(constraints.video.deviceId, { exact: 'camera-2' })
  assert.equal('facingMode' in constraints.video, false)
  assert.equal(constraints.audio, false)
})

test('camera labels use browser names when available and fall back to numbered cameras', () => {
  assert.equal(formatCameraLabel({ label: 'Back Camera' }, 0), 'Back Camera')
  assert.equal(formatCameraLabel({ label: '' }, 2), '摄像头 3')
})
