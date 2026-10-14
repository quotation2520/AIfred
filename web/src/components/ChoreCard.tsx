import type { ChoreRecord } from '../api/chores'
import { computeStatus } from '../lib/choreStatus'

const DEFAULT_ICON = '🧹'

interface ChoreCardProps {
  chore: ChoreRecord
  today: string
  onOpen: (chore: ChoreRecord) => void
  onComplete: (chore: ChoreRecord) => void
  /** 이 카드의 완료·실행 취소 요청이 진행 중이면 true. 그동안 체크 버튼을 다시 누를 수 없다. */
  busy?: boolean
}

/**
 * PRD 6장 카드: 아이콘 · 이름 · 게이지 바 · 배지 · 완료 체크 버튼(F3).
 * 지연 카드는 색 말고도 배지의 경고 표시와 왼쪽 굵은 띠로 구분한다 (UX U4).
 * 카드 본문을 누르면 편집이고, 오른쪽 ">" 표시가 그 단서다 (UX U6).
 */
function ChoreCard({ chore, today, onOpen, onComplete, busy = false }: ChoreCardProps) {
  const status = computeStatus(chore.lastDoneAt, chore.intervalDays, today)
  const gauge = Math.round(status.gaugePercent)
  const icon = chore.icon?.trim() || DEFAULT_ICON
  const overdue = status.status === 'overdue'
  const spoken = overdue ? `${status.badge} (${-status.remainingDays}일 지남)` : status.badge
  const doneToday = chore.lastDoneAt === today

  return (
    <li className={`chore-card chore-card--${status.status}`} data-status={status.status}>
      <button
        type="button"
        className="chore-card__main"
        aria-label={`${chore.name} ${spoken} 편집`}
        onClick={() => onOpen(chore)}
      >
        <span className="chore-card__icon" aria-hidden="true">
          {icon}
        </span>
        <span className="chore-card__body">
          <span className="chore-card__header">
            <span className="chore-card__name">{chore.name}</span>
            <span className={`badge badge--${status.status}`}>
              {overdue && (
                <span className="badge__alert" aria-hidden="true">
                  !
                </span>
              )}
              <span className="badge__text">{status.badge}</span>
            </span>
          </span>
          <span
            className="gauge"
            role="progressbar"
            aria-label={`${chore.name} 남은 기간`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={gauge}
          >
            <span className="gauge__fill" style={{ width: `${gauge}%` }} />
          </span>
        </span>
        <span className="chore-card__chevron" aria-hidden="true">
          ›
        </span>
      </button>
      <button
        type="button"
        className={`chore-card__check${doneToday ? ' chore-card__check--done' : ''}`}
        disabled={doneToday || busy}
        aria-busy={busy || undefined}
        aria-label={doneToday ? `${chore.name} 오늘 완료함` : `${chore.name} 완료 체크`}
        onClick={() => onComplete(chore)}
      >
        ✓
      </button>
    </li>
  )
}

export default ChoreCard
