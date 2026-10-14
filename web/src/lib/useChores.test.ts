// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { jsonResponse, record } from '../test/fetchMock'
import { REFRESH_MIN_INTERVAL_MS, useChores } from './useChores'

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  setVisibility('visible')
})

describe('useChores 조용한 새로고침', () => {
  it('다시 보일 때 30초가 지났으면 목록을 새로 받는다', async () => {
    const first = [record('a', '설거지', 7, '2026-10-10')]
    const second = [record('a', '설거지', 7, '2026-10-10'), record('b', '빨래', 7, '2026-10-10')]
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(first))
      .mockResolvedValueOnce(jsonResponse(second))
    vi.stubGlobal('fetch', fetchMock)
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)

    const { result } = renderHook(() => useChores())
    await waitFor(() => expect(result.current.state.kind).toBe('ready'))

    // 30초가 안 지났으면 받지 않는다.
    now.mockReturnValue(1_000_000 + REFRESH_MIN_INTERVAL_MS - 1)
    act(() => setVisibility('visible'))
    expect(fetchMock).toHaveBeenCalledTimes(1)

    now.mockReturnValue(1_000_000 + REFRESH_MIN_INTERVAL_MS + 1)
    act(() => setVisibility('visible'))
    await waitFor(() => {
      const state = result.current.state
      expect(state.kind === 'ready' && state.chores.length).toBe(2)
    })
    now.mockRestore()
  })

  it('받는 동안 화면에서 고친 것이 있으면 받은 목록을 버린다', async () => {
    const first = [record('a', '설거지', 7, '2026-10-10')]
    let resolveSecond: (r: Response) => void = () => {}
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(first))
      .mockReturnValueOnce(new Promise<Response>((resolve) => (resolveSecond = resolve)))
    vi.stubGlobal('fetch', fetchMock)
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)

    const { result } = renderHook(() => useChores())
    await waitFor(() => expect(result.current.state.kind).toBe('ready'))

    now.mockReturnValue(1_000_000 + REFRESH_MIN_INTERVAL_MS + 1)
    act(() => setVisibility('visible'))
    act(() => result.current.replace('a', (c) => ({ ...c, name: '고친 이름' })))
    await act(async () => resolveSecond(jsonResponse([record('a', '서버 이름', 7, '2026-10-10')])))

    const state = result.current.state
    expect(state.kind === 'ready' && state.chores[0].name).toBe('고친 이름')
    now.mockRestore()
  })

  it('조용한 새로고침이 실패하면 지금 목록을 그대로 둔다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([record('a', '설거지', 7, '2026-10-10')]))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)

    const { result } = renderHook(() => useChores())
    await waitFor(() => expect(result.current.state.kind).toBe('ready'))
    now.mockReturnValue(1_000_000 + REFRESH_MIN_INTERVAL_MS + 1)
    await act(async () => setVisibility('visible'))

    expect(result.current.state.kind).toBe('ready')
    now.mockRestore()
  })
})
