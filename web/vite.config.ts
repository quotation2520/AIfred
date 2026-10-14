import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // 서비스 워커는 주소창 이동(navigation)에 캐시한 index.html을 준다.
        // 같은 서버가 제공하는 /api 와 FastAPI 문서 화면은 그 대상에서 뺀다.
        // (/api fetch 요청은 런타임 캐시가 없어 서비스 워커가 손대지 않는다.)
        navigateFallbackDenylist: [/^\/api(\/|$)/, /^\/docs/, /^\/redoc/, /^\/openapi\.json/],
      },
      manifest: {
        name: 'AIFred',
        short_name: 'AIFred',
        description: '주기적인 집안일 대시보드',
        lang: 'ko',
        display: 'standalone',
        start_url: '/',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        // 아이콘은 이후 작업에서 추가한다.
        icons: [],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
})
