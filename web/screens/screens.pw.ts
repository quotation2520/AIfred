/**
 * 실행 화면 캡처(`npm run screens`). vitest가 아니라 Playwright로 실행된다.
 * 시나리오는 scenarios.ts에, 샘플 데이터는 sampleData.ts에 있다.
 */
import { expect, type Page, test } from '@playwright/test'
import path from 'node:path'
import type { ChoreRecord } from '../src/api/chores'
import type { PresetCategory, PresetItem } from '../src/api/presets'
import { SCREENSHOT_DIR } from './paths.ts'
import { FIXED_NOW, SAMPLE_CHORES, samplePresets } from './sampleData.ts'
import { type Scenario, SCENARIOS } from './scenarios.ts'

function json(body: unknown, status = 200) {
  return { status, contentType: 'application/json', body: JSON.stringify(body) }
}

/**
 * /api/ 아래 모든 요청을 가짜 응답으로 처리한다. 실제 서버(→ 사용자 DB)로는 한 건도 나가지 않는다.
 * 추가·수정·삭제는 메모리 목록에 반영되어, 저장 후 대시보드로 돌아가는 흐름도 찍을 수 있다.
 */
async function mockApi(page: Page, scenario: Scenario): Promise<void> {
  let chores: ChoreRecord[] = structuredClone(scenario.chores ?? SAMPLE_CHORES)
  let presets: PresetCategory[] = samplePresets()
  const now = new Date(FIXED_NOW).toISOString()

  /** 기본 목록 API(/api/presets, /api/preset-categories, /api/preset-items). 해당 경로가 아니면 null. */
  function handlePresets(method: string, pathname: string, readBody: () => unknown) {
    if (pathname === '/api/presets' && method === 'GET') {
      if (scenario.presetsResponse) {
        const { status, body, contentType = 'application/json' } = scenario.presetsResponse
        return { status, body, contentType }
      }
      return json(presets)
    }
    if (pathname === '/api/preset-categories' && method === 'POST') {
      const input = readBody() as { id: string; name: string; emoji?: string }
      const created: PresetCategory = { emoji: '📁', ...input, isBuiltin: false, items: [] }
      presets = [...presets, created]
      return json(created, 201)
    }
    const itemsMatch = /^\/api\/preset-categories\/([^/]+)\/items$/.exec(pathname)
    if (itemsMatch && method === 'POST') {
      const categoryId = decodeURIComponent(itemsMatch[1])
      const input = readBody() as Omit<PresetItem, 'isBuiltin' | 'icon' | 'note'> & Partial<PresetItem>
      const created: PresetItem = { icon: '🧹', note: null, ...input, isBuiltin: false }
      presets = presets.map((c) => (c.id === categoryId ? { ...c, items: [...c.items, created] } : c))
      return json(created, 201)
    }
    const categoryMatch = /^\/api\/preset-categories\/([^/]+)$/.exec(pathname)
    if (categoryMatch) {
      const categoryId = decodeURIComponent(categoryMatch[1])
      const category = presets.find((c) => c.id === categoryId)
      if (category && method === 'PATCH') {
        const updated = { ...category, ...(readBody() as Partial<PresetCategory>) }
        presets = presets.map((c) => (c.id === categoryId ? updated : c))
        return json(updated)
      }
      if (category && method === 'DELETE') {
        presets = presets.filter((c) => c.id !== categoryId)
        return { status: 204, body: '' }
      }
    }
    const itemMatch = /^\/api\/preset-items\/([^/]+)$/.exec(pathname)
    if (itemMatch) {
      const itemId = decodeURIComponent(itemMatch[1])
      const item = presets.flatMap((c) => c.items).find((i) => i.id === itemId)
      if (item && method === 'PATCH') {
        const updated = { ...item, ...(readBody() as Partial<PresetItem>) }
        presets = presets.map((c) => ({ ...c, items: c.items.map((i) => (i.id === itemId ? updated : i)) }))
        return json(updated)
      }
      if (item && method === 'DELETE') {
        presets = presets.map((c) => ({ ...c, items: c.items.filter((i) => i.id !== itemId) }))
        return { status: 204, body: '' }
      }
    }
    return null
  }

  await page.route(
    (url) => url.pathname === '/api' || url.pathname.startsWith('/api/'),
    async (route) => {
      const request = route.request()
      const method = request.method()
      const { pathname } = new URL(request.url())
      const id = pathname.startsWith('/api/chores/') ? decodeURIComponent(pathname.slice('/api/chores/'.length)) : null

      if (pathname === '/api/chores' && method === 'GET') {
        if (scenario.listResponse) {
          const { status, body, contentType = 'application/json' } = scenario.listResponse
          return route.fulfill({ status, body, contentType })
        }
        return route.fulfill(json(chores))
      }
      if (pathname === '/api/chores' && method === 'POST') {
        if (scenario.createResponse) {
          const { status, body, contentType = 'application/json' } = scenario.createResponse
          return route.fulfill({ status, body, contentType })
        }
        const input = request.postDataJSON() as Partial<ChoreRecord>
        const created: ChoreRecord = {
          icon: null,
          note: null,
          lastDoneAt: FIXED_NOW.slice(0, 10),
          ...input,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        } as ChoreRecord
        chores = [...chores, created]
        return route.fulfill(json(created, 201))
      }
      const presetResult = handlePresets(method, pathname, request.postDataJSON.bind(request))
      if (presetResult) return route.fulfill(presetResult)
      const existing = id !== null ? chores.find((c) => c.id === id) : undefined
      if (existing && method === 'PATCH') {
        const updated: ChoreRecord = { ...existing, ...(request.postDataJSON() as Partial<ChoreRecord>), updatedAt: now }
        chores = chores.map((c) => (c.id === id ? updated : c))
        return route.fulfill(json(updated))
      }
      if (existing && method === 'DELETE') {
        chores = chores.filter((c) => c.id !== id)
        return route.fulfill({ status: 204, body: '' })
      }
      return route.fulfill(json({ detail: `가짜 API에 없는 요청: ${method} ${pathname}` }, 404))
    },
  )
}

for (const scenario of SCENARIOS) {
  test(`${scenario.name}: ${scenario.description}`, async ({ page }, testInfo) => {
    await page.clock.setFixedTime(new Date(FIXED_NOW))
    await mockApi(page, scenario)

    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText('불러오는 중…')).toHaveCount(0)

    await scenario.steps?.(page)

    const file = path.join(SCREENSHOT_DIR, `${scenario.name}-${testInfo.project.name}.png`)
    await page.screenshot({ path: file, fullPage: scenario.fullPage ?? true, animations: 'disabled', caret: 'hide' })
  })
}
