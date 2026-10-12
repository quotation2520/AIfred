import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { SCREENSHOT_DIR } from './paths.ts'

/** 만든 스크린샷 목록을 출력한다. */
export default function globalTeardown(): void {
  const files = existsSync(SCREENSHOT_DIR)
    ? readdirSync(SCREENSHOT_DIR)
        .filter((f) => f.endsWith('.png'))
        .sort()
    : []
  const relDir = path.relative(process.cwd(), SCREENSHOT_DIR) || '.'
  console.log(`\n스크린샷 ${files.length}개 (${relDir}${path.sep}):`)
  for (const file of files) console.log(`  ${path.join(relDir, file)}`)
}
