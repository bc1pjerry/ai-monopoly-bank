import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'fs'
import path from 'path'

const certDir = path.join(__dirname, '..', 'certs')
const certFile = path.join(certDir, 'cert.pem')
const keyFile = path.join(certDir, 'key.pem')
const hasCerts = fs.existsSync(certFile) && fs.existsSync(keyFile)

export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: '../dist',
    emptyOutDir: true
  },
  server: {
    ...(hasCerts ? {
      https: {
        key: fs.readFileSync(keyFile),
        cert: fs.readFileSync(certFile)
      }
    } : {}),
    proxy: {
      '/api': {
        target: `${hasCerts ? 'https' : 'http'}://localhost:8765`,
        secure: false
      }
    }
  }
})
