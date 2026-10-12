import { vi } from 'vitest'
import type { ChoreRecord } from '../api/chores'

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
