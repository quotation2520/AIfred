import {
  createContext,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { canAnimateExit, SHEET_EXIT_MS } from '../lib/motion'

/** 이만큼(px) 넘게 아래로 끌어 놓으면 닫는다. 빠르게 튕기면 DRAG_FLICK_PX만 넘어도 닫는다. */
export const DRAG_CLOSE_PX = 96
const DRAG_FLICK_PX = 32
/** 튕김으로 보는 속도(px/ms) */
const DRAG_FLICK_SPEED = 0.6
/** 이 폭 이상이면 아래에서 올라오는 시트 대신 가운데 대화상자로 보인다. index.css의 미디어 쿼리와 같다. */
const DIALOG_MIN_WIDTH = 720

const SheetContext = createContext<{ titleId: string } | null>(null)

/** 시트가 열려 있는 수. 하나라도 있으면 뒤 화면(body)이 스크롤되지 않게 한다. 스크롤 위치는 그대로 남는다. */
let openSheets = 0

interface SheetProps {
  /** 바깥 탭, 아래로 끌기로 닫으려 할 때. 받는 쪽이 (필요하면 확인 창을 띄운 뒤) 실제로 닫는다. */
  onRequestClose: () => void
  /** Esc 키. 없으면 onRequestClose */
  onEscape?: () => void
  /** 닫히는 움직임 중이면 true. 움직임이 끝나면 onExited를 부른다. 그동안은 누를 수 없다. */
  closing?: boolean
  onExited?: () => void
  /** full: 추가·편집(화면 높이 가까이), menu: 내용만큼 낮은 선택 목록 */
  size?: 'full' | 'menu'
  /** 시트 테스트·스크린샷용 이름 */
  testId?: string
  children: ReactNode
}

/**
 * 아래에서 올라오는 시트(UX R5). 넓은 화면에서는 가운데 대화상자로 보인다.
 * 뒤 화면은 어둡게 덮이고, 바깥을 누르거나 손잡이·머리줄을 아래로 끌면 onRequestClose가 불린다.
 * 내용은 머리줄(SheetHeader), 스크롤되는 본문(.sheet__body), 아래 버튼 줄(.sheet__footer)로 채운다.
 * 카드의 위치 이동 애니메이션(transform)에 갇히지 않도록 body에 portal로 그린다.
 */
function Sheet({ onRequestClose, onEscape, closing = false, onExited, size = 'full', testId, children }: SheetProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ pointerId: number; startY: number; startTime: number; dy: number } | null>(null)
  const closingRef = useRef(closing)
  const onExitedRef = useRef(onExited)
  useLayoutEffect(() => {
    closingRef.current = closing
    onExitedRef.current = onExited
  })

  // 열기 전에 포커스가 있던 곳(카드의 버튼, "+" 등). 닫으면 그리로 돌려준다.
  const [previousFocus] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  )

  // 뒤 화면 스크롤 잠금, 열릴 때 시트로 포커스, 닫히면 원래 자리로 포커스
  useEffect(() => {
    openSheets += 1
    if (openSheets === 1) document.body.classList.add('sheet-open')
    const panel = panelRef.current
    if (panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true })
    return () => {
      openSheets -= 1
      if (openSheets === 0) document.body.classList.remove('sheet-open')
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [previousFocus])

  // 닫히는 움직임: 시트는 아래로(대화상자는 작아지며) 사라지고 뒤 덮개는 흐려진다.
  useEffect(() => {
    if (!closing) return
    const panel = panelRef.current
    const backdrop = backdropRef.current
    if (!panel || !backdrop || !canAnimateExit()) {
      onExitedRef.current?.()
      return
    }
    const dialog = typeof window.matchMedia === 'function' && window.matchMedia(`(min-width: ${DIALOG_MIN_WIDTH}px)`).matches
    const from = panel.style.transform || 'none'
    const options: KeyframeAnimationOptions = { duration: SHEET_EXIT_MS, easing: 'ease-in', fill: 'forwards' }
    const animation = panel.animate(
      dialog
        ? [
            { opacity: 1, transform: 'none' },
            { opacity: 0, transform: 'scale(0.96)' },
          ]
        : [{ transform: from }, { transform: 'translateY(100%)' }],
      options,
    )
    const fade = backdrop.animate([{ opacity: 1 }, { opacity: 0 }], options)
    animation.addEventListener('finish', () => onExitedRef.current?.())
    return () => {
      // 닫히는 중에 다시 열리면(새 시트) 끌던 자리도 지우고 제자리에 보인다.
      animation.cancel()
      fade.cancel()
      panel.style.transform = ''
    }
  }, [closing])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || closing) return
    event.stopPropagation()
    ;(onEscape ?? onRequestClose)()
  }

  // --- 아래로 끌어 닫기: 손잡이와 머리줄(data-sheet-drag)에서 시작한다. 버튼·입력 칸은 빼고. ---

  const setOffset = (dy: number, animate: boolean) => {
    const panel = panelRef.current
    if (!panel) return
    panel.style.transition = animate ? `transform ${SHEET_EXIT_MS}ms ease-out` : 'none'
    panel.style.transform = dy > 0 ? `translateY(${dy}px)` : ''
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (closing || !event.isPrimary) return
    const target = event.target as Element
    if (!target.closest('[data-sheet-drag]') || target.closest('button, input, textarea, select, a')) return
    drag.current = { pointerId: event.pointerId, startY: event.clientY, startTime: performance.now(), dy: 0 }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current
    if (!state || state.pointerId !== event.pointerId) return
    state.dy = Math.max(0, event.clientY - state.startY)
    setOffset(state.dy, false)
  }

  const endDrag = (event: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const state = drag.current
    if (!state || state.pointerId !== event.pointerId) return
    drag.current = null
    const speed = state.dy / Math.max(1, performance.now() - state.startTime)
    const shouldClose = !cancelled && (state.dy >= DRAG_CLOSE_PX || (state.dy >= DRAG_FLICK_PX && speed >= DRAG_FLICK_SPEED))
    if (shouldClose) onRequestClose()
    // 닫히면 닫히는 움직임이 지금 자리에서 이어서 내려간다. 닫지 않았으면(확인 창에서 취소 포함) 제자리로 돌아온다.
    setTimeout(() => {
      if (!closingRef.current) setOffset(0, true)
    }, 0)
  }

  return createPortal(
    <div className={`sheet-layer sheet-layer--${size}${closing ? ' sheet-layer--closing' : ''}`}>
      <div
        ref={backdropRef}
        className="sheet-backdrop"
        data-testid="sheet-backdrop"
        onClick={closing ? undefined : onRequestClose}
      />
      <div
        ref={panelRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => endDrag(event, false)}
        onPointerCancel={(event) => endDrag(event, true)}
      >
        <div className="sheet__handle" data-sheet-drag aria-hidden="true" />
        <SheetContext.Provider value={{ titleId }}>{children}</SheetContext.Provider>
      </div>
    </div>,
    document.body,
  )
}

interface SheetHeaderProps {
  title: string
  /** 제목 옆 버튼(편집 모드 켜기, 삭제 등) */
  actions?: ReactNode
  /** 닫기(✕). 시트 전체를 닫는다. */
  onClose: () => void
}

/** 시트 머리줄: 제목, 덧붙인 버튼, 닫기. 이 줄을 아래로 끌어도 닫힌다. */
export function SheetHeader({ title, actions, onClose }: SheetHeaderProps) {
  const context = useContext(SheetContext)
  return (
    <div className="sheet__header" data-sheet-drag>
      <h1 id={context?.titleId} className="sheet__title">
        {title}
      </h1>
      {actions && <div className="sheet__actions">{actions}</div>}
      <button type="button" className="sheet__close" aria-label="닫기" onClick={onClose}>
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  )
}

export default Sheet
