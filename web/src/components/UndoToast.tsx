import { useEffect, useState } from 'react'
import { TOAST_EXIT_MS, prefersReducedMotion } from '../lib/motion'

/** 알림 하나. key가 바뀌면 새 알림으로 보고 나타나는 효과를 다시 보여 준다. */
export interface ToastMessage {
  key: string
  text: string
  /** 둘째 줄에 작게 붙는 설명(예: "나중에 할 일로 이동") */
  detail?: string
}

interface UndoToastProps {
  message: ToastMessage | null
  onUndo: () => void
}

/**
 * 실행 취소 알림 (완료 체크와 잔여일 조절이 함께 쓴다). 아래에서 떠오르며 나타나고, 닫히면 잠깐 흐려지며 사라진다.
 * 사라지는 동안의 알림은 읽기 도구와 터치에서 빠진다(aria-hidden, pointer-events: none).
 */
function UndoToast({ message, onUndo }: UndoToastProps) {
  const [shown, setShown] = useState<ToastMessage | null>(message)
  const [leaving, setLeaving] = useState(false)

  // 렌더 중에 props 변화를 반영한다(React의 "이전 props 저장" 방식).
  if (message && (message.key !== shown?.key || leaving)) {
    setShown(message)
    setLeaving(false)
  } else if (!message && shown && !leaving) {
    if (prefersReducedMotion()) setShown(null)
    else setLeaving(true)
  }

  useEffect(() => {
    if (!leaving) return
    const timer = setTimeout(() => {
      setShown(null)
      setLeaving(false)
    }, TOAST_EXIT_MS)
    return () => clearTimeout(timer)
  }, [leaving])

  if (!shown) return null
  return (
    <div
      key={shown.key}
      className={`toast${leaving ? ' toast--leaving' : ''}`}
      data-testid={leaving ? undefined : 'undo-toast'}
      aria-hidden={leaving || undefined}
    >
      <span className="toast__body">
        <span className="toast__text">{shown.text}</span>
        {shown.detail && <span className="toast__detail">{shown.detail}</span>}
      </span>
      <button type="button" className="toast__action" onClick={onUndo} disabled={leaving} tabIndex={leaving ? -1 : undefined}>
        실행 취소
      </button>
    </div>
  )
}

export default UndoToast
