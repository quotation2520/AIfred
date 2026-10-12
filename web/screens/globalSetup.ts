import { mkdirSync, rmSync } from 'node:fs'
import { SCREENSHOT_DIR } from './paths.ts'

/** 실행할 때마다 스크린샷 폴더를 비우고 새로 만든다. */
export default function globalSetup(): void {
  rmSync(SCREENSHOT_DIR, { recursive: true, force: true })
  mkdirSync(SCREENSHOT_DIR, { recursive: true })
}
