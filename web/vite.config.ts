import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/** 앱 바탕색(index.css --color-bg). 설치한 앱의 상태 표시줄과 시작 화면 색으로 쓴다. index.html theme-color와 맞춘다. */
const APP_BACKGROUND = '#f5f6f8'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 새 버전은 받아 두고 기다리게 한다. 언제 바꿀지는 앱이 정한다(src/registerAppUpdate.ts, lib/appUpdate.ts).
      registerType: 'prompt',
      // 등록은 src/registerAppUpdate.ts가 virtual:pwa-register로 한다(registerSW.js를 넣지 않는다).
      injectRegister: false,
      // 아이콘 PNG와 favicon은 icons-src/에서 만든다(npm run icons). manifest 아이콘은 자동으로 미리 캐시된다.
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png'],
      workbox: {
        // 서비스 워커는 주소창 이동(navigation)에 캐시한 index.html을 준다.
        // 같은 서버가 제공하는 /api 와 FastAPI 문서 화면은 그 대상에서 뺀다.
        // (/api fetch 요청은 런타임 캐시가 없어 서비스 워커가 손대지 않는다. 오프라인·동기화(F8) 전까지 캐시하지 않는다.)
        navigateFallbackDenylist: [/^\/api(\/|$)/, /^\/docs/, /^\/redoc/, /^\/openapi\.json/],
      },
      manifest: {
        name: 'AIFred',
        short_name: 'AIFred',
        description: '주기적인 집안일을 게이지와 D-day로 보여 주는 대시보드',
        lang: 'ko',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        theme_color: APP_BACKGROUND,
        background_color: APP_BACKGROUND,
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
})
