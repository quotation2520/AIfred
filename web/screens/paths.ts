import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** 스크린샷 저장 폴더: web/screenshots/ (git 제외). */
export const SCREENSHOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'screenshots')
