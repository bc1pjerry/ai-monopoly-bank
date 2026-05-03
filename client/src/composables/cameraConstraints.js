export function buildDeedCameraConstraints(deviceId = '') {
  const video = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    focusMode: { ideal: 'continuous' }
  }

  if (deviceId) video.deviceId = { exact: deviceId }
  else video.facingMode = { ideal: 'environment' }

  return {
    video,
    audio: false
  }
}

export function formatCameraLabel(device, index) {
  return device?.label?.trim() || `摄像头 ${index + 1}`
}
