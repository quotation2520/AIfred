import { afterEach, describe, expect, it, vi } from 'vitest'
import { jsonResponse, mockFetch, record } from '../test/fetchMock'
import {
  ApiError,
  completeChore,
  createChore,
  deleteChore,
  formatDetail,
  listChores,
  newChoreId,
  newCompletionId,
  restoreChore,
  undoCompletion,
  undoTodayCompletion,
  updateChore,
  uuidV4,
} from './chores'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('chores API 클라이언트', () => {
  it('listChores는 GET /api/chores 응답을 그대로 돌려준다', async () => {
    const chores = [record('a', '화분 물주기', 7, '2026-10-05')]
    const { calls } = mockFetch({ 'GET /api/chores': () => jsonResponse(chores) })
    await expect(listChores()).resolves.toEqual(chores)
    expect(calls).toEqual([{ method: 'GET', url: '/api/chores', body: undefined }])
  })

  it('createChore는 camelCase JSON으로 POST한다', async () => {
    const { calls, fetchMock } = mockFetch({
      'POST /api/chores': (call) => jsonResponse({ ...(call.body as object) }, 201),
    })
    const input = { id: newChoreId(), name: '빨래', intervalDays: 2, lastDoneAt: '2026-10-12' }
    await createChore(input)
    expect(calls[0].body).toEqual(input)
    const init = fetchMock.mock.calls[0][1]
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json')
  })

  it('updateChore는 PATCH, deleteChore는 DELETE를 보낸다', async () => {
    const { calls } = mockFetch({
      'PATCH /api/chores/a': () => jsonResponse(record('a', '화분 물주기', 10, '2026-10-05')),
      'DELETE /api/chores/a': () => new Response(null, { status: 204 }),
    })
    await updateChore('a', { intervalDays: 10 })
    await deleteChore('a')
    expect(calls).toEqual([
      { method: 'PATCH', url: '/api/chores/a', body: { intervalDays: 10 } },
      { method: 'DELETE', url: '/api/chores/a', body: undefined },
    ])
  })

  it('2xx가 아니면 상태 코드와 detail을 담은 ApiError를 던진다', async () => {
    mockFetch({ 'DELETE /api/chores/x': () => jsonResponse({ detail: '집안일을 찾을 수 없다' }, 404) })
    const error = await deleteChore('x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(404)
    expect((error as ApiError).detail).toBe('집안일을 찾을 수 없다')
    expect((error as ApiError).message).toContain('404')
  })

  it('JSON이 아닌 오류 본문도 detail로 담는다', async () => {
    mockFetch({ 'GET /api/chores': () => new Response('Bad Gateway', { status: 502 }) })
    const error = (await listChores().catch((e: unknown) => e)) as ApiError
    expect(error.status).toBe(502)
    expect(error.detail).toBe('Bad Gateway')
  })

  it('newChoreId는 UUID를 만든다', () => {
    expect(newChoreId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('completeChore는 완료 기록을 POST하고, undoCompletion은 DELETE한 뒤 집안일을 돌려준다', async () => {
    const chore = record('a', '화분 물주기', 7, '2026-10-14')
    const completion = {
      id: 'x',
      choreId: 'a',
      doneAt: '2026-10-14T00:00:00Z',
      doneOn: '2026-10-14',
      dueOn: '2026-10-12',
      previousLastDoneAt: '2026-10-05',
      deletedAt: null,
    }
    const restored = record('a', '화분 물주기', 7, '2026-10-05')
    const { calls } = mockFetch({
      'POST /api/chores/a/completions': () => jsonResponse({ completion, chore }, 201),
      'DELETE /api/completions/x': () => jsonResponse(restored),
    })
    await expect(completeChore('a', { id: 'x', doneOn: '2026-10-14' })).resolves.toEqual({ completion, chore })
    await expect(undoCompletion('x')).resolves.toEqual(restored)
    expect(calls).toEqual([
      { method: 'POST', url: '/api/chores/a/completions', body: { id: 'x', doneOn: '2026-10-14' } },
      { method: 'DELETE', url: '/api/completions/x', body: undefined },
    ])
    expect(newCompletionId()).not.toBe(newCompletionId())
  })

  it('undoTodayCompletion은 오늘 완료를 DELETE하고, restoreChore는 되살리기를 POST한다. 둘 다 집안일을 돌려준다', async () => {
    const chore = record('a b', '화분 물주기', 7, '2026-10-05')
    const { calls } = mockFetch({
      'DELETE /api/chores/a%20b/completions/today': () => jsonResponse(chore),
      'POST /api/chores/a%20b/restore': () => jsonResponse(chore),
    })
    await expect(undoTodayCompletion('a b')).resolves.toEqual(chore)
    await expect(restoreChore('a b')).resolves.toEqual(chore)
    expect(calls).toEqual([
      { method: 'DELETE', url: '/api/chores/a%20b/completions/today', body: undefined },
      { method: 'POST', url: '/api/chores/a%20b/restore', body: undefined },
    ])
  })

  it('오늘 완료가 없으면(404), 삭제 상태가 아니면(409) ApiError를 던진다', async () => {
    mockFetch({
      'DELETE /api/chores/a/completions/today': () => jsonResponse({ detail: '오늘 완료한 기록이 없다' }, 404),
      'POST /api/chores/a/restore': () => jsonResponse({ detail: '삭제된 집안일이 아니다' }, 409),
    })
    expect(((await undoTodayCompletion('a').catch((e: unknown) => e)) as ApiError).status).toBe(404)
    expect(((await restoreChore('a').catch((e: unknown) => e)) as ApiError).status).toBe(409)
  })
})

describe('formatDetail', () => {
  it('422 검증 오류 배열을 필드와 메시지로 만든다', () => {
    expect(
      formatDetail([
        { loc: ['body', 'intervalDays'], msg: 'Input should be greater than or equal to 1' },
        { loc: ['body', 'name'], msg: 'Value error, 이름은 비어 있을 수 없다' },
      ]),
    ).toBe('intervalDays: Input should be greater than or equal to 1, name: Value error, 이름은 비어 있을 수 없다')
  })

  it('문자열은 그대로, 없으면 기본 문구', () => {
    expect(formatDetail('이미 있는 id다')).toBe('이미 있는 id다')
    expect(formatDetail(null)).toBe('알 수 없는 오류')
  })
})

describe('uuidV4', () => {
  const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

  it('randomUUID가 없는 HTTP 접속에서도 v4 형식을 만든다', () => {
    const real = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) })
    const ids = new Set(Array.from({ length: 50 }, () => uuidV4()))
    expect(ids.size).toBe(50)
    for (const id of ids) expect(id).toMatch(UUID_V4)
  })

  it('randomUUID가 있으면 그것을 쓴다', () => {
    expect(uuidV4()).toMatch(UUID_V4)
  })
})
