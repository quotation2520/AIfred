import { vi } from 'vitest'
import type { ChoreRecord } from '../api/chores'
import type { PresetCategory, PresetItem } from '../api/presets'

export interface RecordedCall {
  method: string
  url: string
  body: unknown
}

type Handler = (call: RecordedCall) => Response | Promise<Response>

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** "METHOD url" 키로 응답을 정해 global fetch를 바꾼다. 호출 기록을 반환한다. */
export function mockFetch(routes: Record<string, Handler>) {
  const calls: RecordedCall[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = (init?.method ?? 'GET').toUpperCase()
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined
    const call = { method, url, body }
    calls.push(call)
    const handler = routes[`${method} ${url}`]
    if (!handler) return jsonResponse({ detail: `no mock for ${method} ${url}` }, 500)
    return handler(call)
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock }
}

export function presetItem(
  id: string,
  name: string,
  icon: string,
  intervalDays: number,
  extra: Partial<PresetItem> = {},
): PresetItem {
  return { id, name, icon, intervalDays, note: null, isBuiltin: true, ...extra }
}

export function presetCategory(
  id: string,
  name: string,
  emoji: string,
  items: PresetItem[],
  extra: Partial<PresetCategory> = {},
): PresetCategory {
  return { id, name, emoji, isBuiltin: true, items, ...extra }
}

/** GET /api/presets가 돌려줄 작은 기본 목록 (서버 응답 형식) */
export const SAMPLE_PRESETS: PresetCategory[] = [
  presetCategory('cat-kitchen', '주방', '🍳', [
    presetItem('item-dishes', '설거지', '🍽️', 1),
    presetItem('item-fridge', '냉장고 정리', '🧊', 7, { note: '유통기한 확인' }),
  ]),
  presetCategory('cat-laundry', '세탁', '🧺', [
    presetItem('item-laundry', '빨래', '👕', 3),
    presetItem('item-bedding', '이불 빨래', '🛏️', 14),
  ]),
  presetCategory('cat-trash', '쓰레기', '♻️', [presetItem('item-recycle', '분리수거', '♻️', 3)]),
  presetCategory('cat-living', '생활·관리', '🏠', [
    presetItem('item-plant', '화분 물주기', '🪴', 7),
    presetItem('item-shopping', '장보기', '🛒', 7),
  ]),
]

/** 기본 목록 경로. mockFetch 경로에 펼쳐 넣는다. 응답은 JSON이라 매번 새 사본이다. */
export function presetRoutes(presets: PresetCategory[] = SAMPLE_PRESETS): Record<string, Handler> {
  return { 'GET /api/presets': () => jsonResponse(presets) }
}

export function record(
  id: string,
  name: string,
  intervalDays: number,
  lastDoneAt: string,
  extra: Partial<ChoreRecord> = {},
): ChoreRecord {
  return {
    id,
    name,
    intervalDays,
    lastDoneAt,
    icon: null,
    note: null,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    deletedAt: null,
    ...extra,
  }
}
