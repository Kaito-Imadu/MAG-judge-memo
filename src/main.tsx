import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

// Service Worker 登録（自動更新）
// iOS PWAはSW更新チェックが不安定なため、60秒ごとに手動チェック
const updateSW = registerSW({
  onRegisteredSW(swUrl, registration) {
    if (registration) {
      setInterval(() => {
        registration.update()
      }, 60 * 1000)
    }
  },
  onNeedRefresh() {
    updateSW(true)
  },
  onOfflineReady() {
    console.log('オフライン準備完了')
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
