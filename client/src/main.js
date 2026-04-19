import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

// 禁用双指缩放
document.addEventListener('touchstart', (event) => {
  if (event.touches.length > 1 && event.cancelable) {
    event.preventDefault()
  }
}, { passive: false })

// 禁用双击缩放
let lastTouchEnd = 0
document.addEventListener('touchend', (event) => {
  const now = (new Date()).getTime()
  if (now - lastTouchEnd <= 300 && event.cancelable) {
    event.preventDefault()
  }
  lastTouchEnd = now
}, { passive: false })

// 禁用 iOS 上的手势缩放
document.addEventListener('gesturestart', (event) => {
  if (event.cancelable) {
    event.preventDefault()
  }
})

createApp(App).mount('#app')
