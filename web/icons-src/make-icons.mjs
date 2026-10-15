// 앱 아이콘 PNG와 favicon을 원본 SVG(icons-src/)에서 만든다. 결과는 public/에 쓰고 저장소에 넣는다.
// 사용: web/에서 npm run icons
// 설치된 Chrome을 Playwright로 띄워 SVG를 그린 뒤 저장한다(`playwright install`이 필요 없다).

import { readFile, writeFile, copyFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const srcDir = dirname(fileURLToPath(import.meta.url))
const publicDir = join(srcDir, '..', 'public')

/** [원본 SVG, 크기, 저장할 파일] */
const PNG_TARGETS = [
  ['icon.svg', 192, 'pwa-192x192.png'],
  ['icon.svg', 512, 'pwa-512x512.png'],
  ['icon-maskable.svg', 192, 'maskable-192x192.png'],
  ['icon-maskable.svg', 512, 'maskable-512x512.png'],
  // iOS는 투명한 곳을 검게 채우고 모서리를 직접 둥글게 자르므로 배경을 끝까지 채운 그림을 쓴다.
  ['icon-maskable.svg', 180, 'apple-touch-icon.png'],
]
const FAVICON_SIZES = [16, 32, 48]

async function render(page, svg, size) {
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<html><body style="margin:0;background:transparent">` +
      `<img src="${dataUrl}" width="${size}" height="${size}" style="display:block"></body></html>`,
  )
  await page.locator('img').evaluate((img) => img.decode())
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } })
}

/** PNG 여러 장을 담은 .ico (Vista 이후 Windows와 모든 브라우저가 PNG 항목을 읽는다) */
function buildIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  const entries = []
  let offset = 6 + 16 * images.length
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt8(0, 2)
    entry.writeUInt8(0, 3)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    offset += png.length
  }
  return Buffer.concat([header, ...entries, ...images.map((image) => image.png)])
}

const browser = await chromium.launch({ channel: 'chrome' })
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  const svgs = {
    'icon.svg': await readFile(join(srcDir, 'icon.svg'), 'utf8'),
    'icon-maskable.svg': await readFile(join(srcDir, 'icon-maskable.svg'), 'utf8'),
  }
  for (const [source, size, file] of PNG_TARGETS) {
    await writeFile(join(publicDir, file), await render(page, svgs[source], size))
    console.log(`public/${file} (${size}x${size})`)
  }
  const favicons = []
  for (const size of FAVICON_SIZES) favicons.push({ size, png: await render(page, svgs['icon.svg'], size) })
  await writeFile(join(publicDir, 'favicon.ico'), buildIco(favicons))
  console.log(`public/favicon.ico (${FAVICON_SIZES.join(', ')})`)
  await copyFile(join(srcDir, 'icon.svg'), join(publicDir, 'favicon.svg'))
  console.log('public/favicon.svg')
} finally {
  await browser.close()
}
