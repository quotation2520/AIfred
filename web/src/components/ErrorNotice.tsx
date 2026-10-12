import type { ReactNode } from 'react'
import type { ErrorText } from '../lib/errorMessages'

interface ErrorNoticeProps {
  error: ErrorText
  /** 다시 시도 같은 다음 행동 버튼 */
  children?: ReactNode
  className?: string
}

/** 오류 상자: 짧은 제목, 다음 행동 안내, 작은 기술 정보 (UX U5). */
function ErrorNotice({ error, children, className }: ErrorNoticeProps) {
  return (
    <div className={['error-notice', className].filter(Boolean).join(' ')} role="alert">
      <p className="error-notice__title">{error.title}</p>
      <p className="error-notice__hint">{error.hint}</p>
      {error.detail && <p className="error-notice__detail">{error.detail}</p>}
      {children}
    </div>
  )
}

export default ErrorNotice
