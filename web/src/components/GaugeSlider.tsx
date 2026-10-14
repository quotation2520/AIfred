import { type KeyboardEvent, type PointerEvent, useRef, useState } from 'react'
import { type DragIntent, clampRemaining, dragIntent, dragValue } from '../lib/gaugeSlider'

interface GaugeSliderProps {
  /** 읽기용 이름 */
  label: string
  /** 저장된 남은 일수를 0~주기로 자른 값 */
  value: number
  /** 조절 중인 값. 조절 중이 아니면 null */
  draft: number | null
  intervalDays: number
  /** 게이지 채움(0~100). 미리 보기 값 기준 */
  percent: number
  /** 읽기용 값. 예: "4일 남음" */
  valueText: string
  disabled?: boolean
  onDraft: (value: number) => void
  onCommit: (value: number) => void
  onCancel: () => void
}

interface Gesture {
  pointerId: number
  startX: number
  startY: number
  startValue: number
  trackWidth: number
  intent: DragIntent
}

/**
 * 게이지 바이면서 잔여일을 고치는 슬라이더(0~주기, 1일 단위).
 *
 * 오조작 방지:
 * - 카드의 편집 버튼 밖에 있어 게이지를 누르거나 끌어도 편집 화면으로 가지 않는다.
 * - 누르기만 하면 아무 일도 없다. 가로로 DRAG_START_PX 이상, 세로보다 많이 움직여야 조절을 시작한다.
 *   세로로 먼저 움직이면 스크롤로 보고 놓아 준다(touch-action: pan-y로 세로 스크롤은 브라우저가 맡는다).
 * - 손잡이는 처음 누른 곳으로 튀지 않고 손가락이 움직인 만큼만 움직인다.
 * 손을 떼면 저장(onCommit)한다. 키보드는 좌우 화살표로 1일씩, Enter나 포커스가 빠질 때 저장, Esc로 취소한다.
 */
function GaugeSlider({
  label,
  value,
  draft,
  intervalDays,
  percent,
  valueText,
  disabled = false,
  onDraft,
  onCommit,
  onCancel,
}: GaugeSliderProps) {
  const trackRef = useRef<HTMLSpanElement>(null)
  const gesture = useRef<Gesture | null>(null)
  // 이벤트가 렌더보다 먼저 이어서 올 수 있으므로 조절 중인 값을 ref에도 둔다.
  const draftRef = useRef<number | null>(null)
  const [dragging, setDragging] = useState(false)

  const setDraftValue = (next: number) => {
    draftRef.current = next
    onDraft(next)
  }

  const commit = () => {
    const current = draftRef.current
    draftRef.current = null
    if (current !== null) onCommit(current)
  }

  const cancel = () => {
    if (draftRef.current === null) return
    draftRef.current = null
    onCancel()
  }

  const endGesture = () => {
    gesture.current = null
    setDragging(false)
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startValue: draftRef.current ?? value,
      trackWidth: trackRef.current?.getBoundingClientRect().width ?? 0,
      intent: 'undecided',
    }
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current
    if (!current || event.pointerId !== current.pointerId) return
    const dx = event.clientX - current.startX
    const dy = event.clientY - current.startY
    if (current.intent === 'undecided') {
      current.intent = dragIntent(dx, dy)
      if (current.intent === 'scroll') {
        gesture.current = null
        return
      }
      if (current.intent !== 'adjust') return
      // 손가락이 슬라이더 밖으로 나가도 계속 따라오게 한다. 이미 떨어진 포인터면 브라우저가 예외를 던진다.
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // 캡처 없이도 슬라이더 위에서는 조절된다.
      }
      setDragging(true)
    }
    event.preventDefault()
    setDraftValue(dragValue(current.startValue, dx, current.trackWidth, intervalDays))
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current
    if (!current || event.pointerId !== current.pointerId) return
    endGesture()
    if (current.intent === 'adjust') commit()
  }

  // 브라우저가 스크롤 등으로 제스처를 가져가면 조절을 취소한다.
  const handlePointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current
    if (!current || event.pointerId !== current.pointerId) return
    endGesture()
    if (current.intent === 'adjust') cancel()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    const base = draftRef.current ?? value
    let next: number
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = base + 1
        break
      case 'ArrowLeft':
      case 'ArrowDown':
        next = base - 1
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = intervalDays
        break
      case 'Enter':
        if (draftRef.current !== null) {
          event.preventDefault()
          commit()
        }
        return
      case 'Escape':
        cancel()
        return
      default:
        return
    }
    event.preventDefault()
    setDraftValue(clampRemaining(next, intervalDays))
  }

  const shown = draft ?? value

  return (
    <div
      className={`gauge-slider${dragging ? ' gauge-slider--dragging' : ''}${draft !== null ? ' gauge-slider--active' : ''}`}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={intervalDays}
      aria-valuenow={shown}
      aria-valuetext={valueText}
      aria-disabled={disabled || undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onKeyDown={handleKeyDown}
      onBlur={commit}
    >
      <span className="gauge" ref={trackRef}>
        <span className="gauge__fill" style={{ transform: `translateX(${percent - 100}%)` }} />
      </span>
      <span className="gauge__thumb-rail" style={{ transform: `translateX(${percent}%)` }} aria-hidden="true">
        <span className="gauge__thumb" />
      </span>
    </div>
  )
}

export default GaugeSlider
