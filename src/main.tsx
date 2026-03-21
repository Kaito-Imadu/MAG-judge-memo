import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

// Service Worker 登録（自動更新）
registerSW({
  onNeedRefresh() {
    // 新しいバージョンがある場合、自動で更新
    // ユーザーに確認不要（審判中の操作を妨げない）
  },
  onOfflineReady() {
    console.log('オフライン準備完了');
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
