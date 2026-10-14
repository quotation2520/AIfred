// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TOAST_EXIT_MS } from '../lib/motion'
import UndoToast from './UndoToast'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('실행 취소 알림', () => {
  it('닫히면 잠깐 흐려지며 사라지고, 그동안은 읽기 도구와 버튼에서 빠진다', () => {
    vi.useFakeTimers()
    const onUndo = vi.fn()
    const { rerender, container } = render(<UndoToast message={{ key: '1', text: '걸레질 완료' }} onUndo={onUndo} />)
    expect(screen.getByTestId('undo-toast').className).toBe('toast')

    // 새 알림은 바로 바꿔 보여 준다.
    rerender(<UndoToast message={{ key: '2', text: '분리수거 → D-4' }} onUndo={onUndo} />)
    expect(screen.getByTestId('undo-toast').textContent).toContain('분리수거 → D-4')
    expect(screen.queryByText('걸레질 완료')).toBeNull()

    rerender(<UndoToast message={null} onUndo={onUndo} />)
    expect(screen.queryByTestId('undo-toast')).toBeNull()
    const leaving = container.querySelector('.toast')
    expect(leaving?.className).toBe('toast toast--leaving')
    expect(leaving?.getAttribute('aria-hidden')).toBe('true')
    expect(screen.queryByRole('button', { name: '실행 취소' })).toBeNull()

    act(() => {
      vi.advanceTimersByTime(TOAST_EXIT_MS)
    })
    expect(container.querySelector('.toast')).toBeNull()
  })

  it('움직임 줄이기 설정이면 바로 사라진다', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query }))
    const { rerender, container } = render(<UndoToast message={{ key: '1', text: '걸레질 완료' }} onUndo={() => {}} />)
    rerender(<UndoToast message={null} onUndo={() => {}} />)
    expect(container.querySelector('.toast')).toBeNull()
  })
})
