import { defineConfig } from '@playwright/test'

/**
 * 실행 화면 스크린샷(`npm run screens`) 설정. 테스트 러너가 아니라 캡처 도구로 쓴다.
 *
 * - 개발 서버는 5174(strictPort)에 따로 띄운다. 5173은 사용자의 개발 서버가 쓴다.
 * - 브라우저는 설치된 Chrome(channel: 'chrome')을 쓴다. `playwright install`이 필요 없다.
 * - /api 요청은 screens/screens.pw.ts에서 모두 가짜 응답으로 막는다. 실제 서버·DB를 쓰지 않는다.
 */
const PORT = 5174
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './screens',
  testMatch: '**/*.pw.ts',
  outputDir: './test-results',
  globalSetup: './screens/globalSetup.ts',
  globalTeardown: './screens/globalTeardown.ts',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    channel: 'chrome',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    serviceWorkers: 'block',
    trace: 'off',
  },
  projects: [
    {
      name: 'mobile',
      use: { viewport: { width: 360, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    },
    {
      name: 'desktop',
      use: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
    },
  ],
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
