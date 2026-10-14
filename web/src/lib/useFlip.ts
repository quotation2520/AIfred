/**
 * 카드 위치 이동 애니메이션 (FLIP: First, Last, Invert, Play). 라이브러리 없이 Web Animations API를 쓴다.
 *
 * 렌더가 끝날 때마다 카드 위치를 재고, 이전 렌더보다 자리가 바뀐 카드는 이전 자리에서 새 자리로 미끄러지게 한다.
 * 위치는 집안일 id로 기억하므로, 영역을 옮겨 가며 DOM 요소가 새로 만들어진 카드도 이어서 움직인다.
 * 처음 나타난 카드는 살짝 떠오르며 나타난다. transform과 opacity만 움직인다.
 * 움직임 줄이기 설정이 켜져 있거나 animate가 없는 환경(jsdom)에서는 아무것도 하지 않는다.
 */

import { useCallback, useLayoutEffect, useRef } from 'react'
import { ENTER_MS, MOVE_MS, prefersReducedMotion } from './motion'

/** 문서 기준 위치(스크롤과 무관)와 폭 */
export interface Box {
  x: number
  y: number
  width: number
}

/** getComputedStyle의 transform 값("matrix(a, b, c, d, e, f)" 또는 "none")에서 이동량을 읽는다. */
export function translateOf(transform: string): { x: number; y: number } {
  const match = /^matrix\(([^)]+)\)$/.exec(transform.trim())
  if (!match) return { x: 0, y: 0 }
  const parts = match[1].split(',').map(Number)
  return { x: parts[4] || 0, y: parts[5] || 0 }
}

/**
 * 이전 자리(before)에서 새 자리(after)로 가는 데 필요한 역방향 이동량.
 * 1px 미만이면 null이다. 폭이 바뀌었으면(화면 회전, 창 크기 변경) 순서가 바뀐 것이 아니므로 움직이지 않는다.
 */
export function flipOffset(before: Box, after: Box): { dx: number; dy: number } | null {
  if (Math.abs(before.width - after.width) >= 1) return null
  const dx = before.x - after.x
  const dy = before.y - after.y
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return null
  return { dx, dy }
}

const MOVE_EASING = 'cubic-bezier(0.2, 0, 0, 1)'

export interface Flip {
  /** 카드 li에 붙일 ref. id마다 같은 함수를 돌려준다. */
  register: (id: string) => (el: HTMLElement | null) => () => void
  /** 이 카드가 지금 자리를 옮기는 중이면 true. 그동안은 손가락 아래로 미끄러져 온 카드를 잘못 누르기 쉽다. */
  isMoving: (id: string) => boolean
}

export function useFlip(): Flip {
  const elements = useRef(new Map<string, HTMLElement>())
  const refs = useRef(new Map<string, (el: HTMLElement | null) => () => void>())
  // 지난 렌더에서 잰 자리(애니메이션 이동량을 뺀 레이아웃 위치)
  const boxes = useRef(new Map<string, Box>())
  const movingUntil = useRef(new Map<string, number>())

  const register = useCallback((id: string) => {
    let ref = refs.current.get(id)
    if (!ref) {
      ref = (el: HTMLElement | null) => {
        if (el) elements.current.set(id, el)
        return () => {
          if (el && elements.current.get(id) === el) elements.current.delete(id)
        }
      }
      refs.current.set(id, ref)
    }
    return ref
  }, [])

  const isMoving = useCallback((id: string) => (movingUntil.current.get(id) ?? 0) > performance.now(), [])

  // 의존성 없이 매 렌더 뒤에 돈다. 화면을 그리기 전에 실행되므로 카드가 새 자리에서 한 번 깜박이지 않는다.
  useLayoutEffect(() => {
    const reduce = prefersReducedMotion()
    const previous = boxes.current
    const next = new Map<string, Box>()
    const now = performance.now()

    for (const [id, el] of elements.current) {
      const rect = el.getBoundingClientRect()
      // 움직이는 중이면 rect에 애니메이션 이동량이 섞여 있으므로 빼서 레이아웃 위치를 구한다.
      const shift = translateOf(getComputedStyle(el).transform)
      const box = { x: rect.left + window.scrollX - shift.x, y: rect.top + window.scrollY - shift.y, width: rect.width }
      next.set(id, box)
      if (reduce || typeof el.animate !== 'function') continue

      const before = previous.get(id)
      if (!before) {
        el.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], {
          duration: ENTER_MS,
          easing: 'ease-out',
        })
        continue
      }
      // 레이아웃이 그대로면 진행 중인 애니메이션을 건드리지 않는다.
      if (before.x === box.x && before.y === box.y) continue
      // 지금 보이는 자리(이전 레이아웃 + 진행 중 이동량)에서 출발한다.
      const offset = flipOffset({ x: before.x + shift.x, y: before.y + shift.y, width: before.width }, box)
      if (!offset) continue
      for (const animation of el.getAnimations?.() ?? []) animation.cancel()
      el.animate([{ transform: `translate(${offset.dx}px, ${offset.dy}px)` }, { transform: 'none' }], {
        duration: MOVE_MS,
        easing: MOVE_EASING,
      })
      movingUntil.current.set(id, now + MOVE_MS)
    }
    boxes.current = next
  })

  return { register, isMoving }
}
