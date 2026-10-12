/**
 * 서버 /api/chores 클라이언트 (server/app/routers/chores.py, server/app/schemas.py).
 *
 * JSON 필드는 camelCase다. 날짜(lastDoneAt)는 "YYYY-MM-DD", 시각은 UTC ISO 8601 문자열이다.
 */

import type { Chore } from '../lib/choreStatus'

/** 서버 ChoreRead 응답. choreStatus의 Chore와 호환된다. */
export interface ChoreRecord extends Chore {
  id: string
  name: string
  intervalDays: number
  lastDoneAt: string
  icon: string | null
  note: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/** 서버 ChoreCreate 요청. */
export interface ChoreCreateInput {
  id: string
  name: string
  intervalDays: number
  lastDoneAt?: string
  icon?: string | null
  note?: string | null
}

/** 서버 ChoreUpdate 요청. 보낸 필드만 바뀐다. icon/note는 null로 지울 수 있다. */
export interface ChoreUpdateInput {
  name?: string
  intervalDays?: number
  lastDoneAt?: string
  icon?: string | null
  note?: string | null
}

const BASE = '/api/chores'

export class ApiError extends Error {
  readonly status: number
  readonly detail: unknown

  constructor(status: number, detail: unknown) {
    super(`API 오류 ${status}: ${formatDetail(detail)}`)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

/** FastAPI detail(문자열 또는 422 검증 오류 배열)을 사람이 읽을 문장으로 만든다. */
export function formatDetail(detail: unknown): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (item && typeof item === 'object' && 'msg' in item) {
          const loc = 'loc' in item && Array.isArray(item.loc) ? item.loc.filter((p: unknown) => p !== 'body') : []
          const field = loc.length > 0 ? `${loc.join('.')}: ` : ''
          return `${field}${String(item.msg)}`
        }
        return String(item)
      })
      .filter((m) => m.length > 0)
    if (messages.length > 0) return messages.join(', ')
  }
  if (detail == null) return '알 수 없는 오류'
  return JSON.stringify(detail)
}

async function readDetail(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => '')
  if (!text) return response.statusText || null
  try {
    const body: unknown = JSON.parse(text)
    if (body && typeof body === 'object' && 'detail' in body) return body.detail
    return body
  } catch {
    return text
  }
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body !== undefined ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
  })
  if (!response.ok) {
    throw new ApiError(response.status, await readDetail(response))
  }
  return response
}

export async function listChores(): Promise<ChoreRecord[]> {
  const response = await request(BASE)
  return (await response.json()) as ChoreRecord[]
}

export async function createChore(input: ChoreCreateInput): Promise<ChoreRecord> {
  const response = await request(BASE, { method: 'POST', body: JSON.stringify(input) })
  return (await response.json()) as ChoreRecord
}

export async function updateChore(id: string, changes: ChoreUpdateInput): Promise<ChoreRecord> {
  const response = await request(`${BASE}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  })
  return (await response.json()) as ChoreRecord
}

export async function deleteChore(id: string): Promise<void> {
  await request(`${BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** 새 집안일 id. 이후 오프라인 생성(F8)을 대비해 클라이언트에서 만든다. */
export function newChoreId(): string {
  return crypto.randomUUID()
}
