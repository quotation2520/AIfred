// @vitest-environment jsdom
import { act, cleanup, render, renderHook } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { request } from '../api/chores'
import UndoToast from '../components/UndoToast'
import {
  holdUpdate,
  isUpdateHeld,
  UPDATE_CHECK_MIN_INTERVAL_MS,
  UPDATE_IDLE_MS,
  UPDATE_RECHECK_MS,
  UpdateScheduler,
  useUpdateHold,
  watchForUpdates,
} from './appUpdate'
import { useBackLayer } from './useBackLayer'

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

let schedulers: UpdateScheduler[] = []

function makeScheduler(apply = vi.fn()) {
  const scheduler = new UpdateScheduler({ apply })
  schedulers.push(scheduler)
  return { scheduler, apply }
}

beforeEach(() => {
  vi.useFakeTimers()
  setVisibility('visible')
})

afterEach(() => {
  cleanup()
  for (const scheduler of schedulers) scheduler.dispose()
  schedulers = []
  vi.useRealTimers()
  vi.unstubAllGlobals()
  expect(isUpdateHeld()).toBe(false)
})

describe('새 버전 반영 시점 (UpdateScheduler)', () => {
  it('준비되기 전에는 반영하지 않고, 준비됐을 때 안전하면 바로 한 번만 반영한다', () => {
    const { scheduler, apply } = makeScheduler()
    vi.advanceTimersByTime(UPDATE_RECHECK_MS * 5)
    expect(apply).not.toHaveBeenCalled()

    scheduler.markReady()
    expect(apply).toHaveBeenCalledTimes(1)

    scheduler.markReady()
    setVisibility('hidden')
    vi.advanceTimersByTime(UPDATE_RECHECK_MS * 5)
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('보류가 걸려 있으면(시트, 요청, 알림, 게이지) 풀릴 때까지 기다린다', () => {
    const { scheduler, apply } = makeScheduler()
    const releaseSheet = holdUpdate()
    const releaseRequest = holdUpdate()
    scheduler.markReady()
    expect(apply).not.toHaveBeenCalled()

    releaseSheet()
    releaseSheet() // 두 번 풀어도 한 번만 풀린다
    vi.advanceTimersByTime(UPDATE_RECHECK_MS)
    expect(isUpdateHeld()).toBe(true)
    expect(apply).not.toHaveBeenCalled()

    releaseRequest()
    vi.advanceTimersByTime(UPDATE_RECHECK_MS)
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('화면이 보이는 동안은 마지막 입력 뒤 잠깐 조용해야 반영한다', () => {
    const { scheduler, apply } = makeScheduler()
    window.dispatchEvent(new Event('pointerdown'))
    scheduler.markReady()
    expect(apply).not.toHaveBeenCalled()

    vi.advanceTimersByTime(UPDATE_IDLE_MS - UPDATE_RECHECK_MS)
    // 스크롤하는 중이면 다시 기다린다.
    window.dispatchEvent(new Event('scroll'))
    vi.advanceTimersByTime(UPDATE_IDLE_MS - UPDATE_RECHECK_MS)
    expect(apply).not.toHaveBeenCalled()

    vi.advanceTimersByTime(UPDATE_RECHECK_MS)
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('앱이 뒤로 가면(hidden) 방금 입력이 있었어도 바로 반영한다. 보류는 그대로 지킨다', () => {
    const { scheduler, apply } = makeScheduler()
    const release = holdUpdate()
    window.dispatchEvent(new Event('keydown'))
    scheduler.markReady()

    setVisibility('hidden')
    expect(apply).not.toHaveBeenCalled()

    release()
    setVisibility('visible')
    setVisibility('hidden')
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('반영한 뒤에는 이벤트와 타이머를 정리한다', () => {
    const { scheduler, apply } = makeScheduler()
    const release = holdUpdate()
    scheduler.markReady()
    release()
    vi.advanceTimersByTime(UPDATE_RECHECK_MS)
    expect(apply).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('새로고침 보류를 거는 곳', () => {
  it('useUpdateHold: active인 동안만 막는다', () => {
    const { rerender, unmount } = renderHook(({ active }) => useUpdateHold(active), { initialProps: { active: true } })
    expect(isUpdateHeld()).toBe(true)
    rerender({ active: false })
    expect(isUpdateHeld()).toBe(false)
    rerender({ active: true })
    unmount()
    expect(isUpdateHeld()).toBe(false)
  })

  it('시트·메뉴 같은 층(useBackLayer)이 열려 있는 동안 막는다', () => {
    const { rerender } = renderHook(({ open }) => useBackLayer(open, () => {}), { initialProps: { open: true } })
    expect(isUpdateHeld()).toBe(true)
    rerender({ open: false })
    expect(isUpdateHeld()).toBe(false)
  })

  it('실행 취소 알림이 떠 있는 동안 막고, 사라지기 시작하면 푼다', () => {
    const message = { key: '1', text: '걸레질 완료' }
    const { rerender } = render(createElement(UndoToast, { message, onUndo: () => {} }))
    expect(isUpdateHeld()).toBe(true)
    rerender(createElement(UndoToast, { message: null, onUndo: () => {} }))
    expect(isUpdateHeld()).toBe(false)
  })

  it('/api 요청이 끝날 때까지 막는다(실패해도 푼다)', async () => {
    let resolveFetch: (response: Response) => void = () => {}
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => (resolveFetch = resolve))))
    const pending = request('/api/chores')
    expect(isUpdateHeld()).toBe(true)
    resolveFetch(new Response('[]', { status: 200 }))
    await pending
    expect(isUpdateHeld()).toBe(false)

    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{"detail":"없음"}', { status: 404 }))))
    await expect(request('/api/chores/x')).rejects.toThrow('404')
    expect(isUpdateHeld()).toBe(false)

    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
    await expect(request('/api/chores')).rejects.toThrow('Failed to fetch')
    expect(isUpdateHeld()).toBe(false)
  })
})

describe('새 버전 확인 (watchForUpdates)', () => {
  it('앱이 다시 보일 때 확인하되, 1분에 한 번까지만 한다', () => {
    let now = 1_000_000
    const update = vi.fn(() => Promise.resolve(undefined as unknown as ServiceWorkerRegistration))
    const stop = watchForUpdates({ update }, { now: () => now })

    setVisibility('hidden')
    setVisibility('visible')
    expect(update).not.toHaveBeenCalled() // 방금 열었다(브라우저가 이미 확인한다)

    now += UPDATE_CHECK_MIN_INTERVAL_MS
    setVisibility('hidden')
    expect(update).not.toHaveBeenCalled()
    setVisibility('visible')
    expect(update).toHaveBeenCalledTimes(1)

    now += 1000
    setVisibility('visible')
    expect(update).toHaveBeenCalledTimes(1)

    stop()
    now += UPDATE_CHECK_MIN_INTERVAL_MS
    setVisibility('visible')
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('확인이 실패해도(서버 꺼짐) 조용히 넘긴다', async () => {
    let now = 0
    const update = vi.fn(() => Promise.reject(new Error('offline')))
    const stop = watchForUpdates({ update }, { now: () => now })
    now += UPDATE_CHECK_MIN_INTERVAL_MS
    setVisibility('visible')
    await act(async () => {})
    expect(update).toHaveBeenCalledTimes(1)
    stop()
  })
})
