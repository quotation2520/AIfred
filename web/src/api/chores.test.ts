import { afterEach, describe, expect, it, vi } from 'vitest'
import { jsonResponse, mockFetch, record } from '../test/fetchMock'
import { ApiError, createChore, deleteChore, formatDetail, listChores, newChoreId, updateChore } from './chores'

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
