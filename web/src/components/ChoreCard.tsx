import type { ChoreRecord } from '../api/chores'
import { computeStatus } from '../lib/choreStatus'

const DEFAULT_ICON = '🧹'

interface ChoreCardProps {
  chore: ChoreRecord
  today: string
  onOpen: (chore: ChoreRecord) => void
}

/** PRD 6장 카드: 아이콘 · 이름 · 게이지 바 · 배지 · 완료 체크 버튼(F3 전까지 비활성). */
function ChoreCard({ chore, today, onOpen }: ChoreCardProps) {
  const status = computeStatus(chore.lastDoneAt, chore.intervalDays, today)
  const gauge = Math.round(status.gaugePercent)
  const icon = chore.icon?.trim() || DEFAULT_ICON

  return (
    <li className={`chore-card chore-card--${status.status}`} data-status={status.status}>
      <button
        type="button"
        className="chore-card__main"
        aria-label={`${chore.name} ${status.badge} 편집`}
        onClick={() => onOpen(chore)}
      >
        <span className="chore-card__icon" aria-hidden="true">
          {icon}
        </span>
        <span className="chore-card__body">
          <span className="chore-card__header">
            <span className="chore-card__name">{chore.name}</span>
            <span className={`badge badge--${status.status}`}>{status.badge}</span>
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
      </button>
      <button
        type="button"
        className="chore-card__check"
        disabled
        aria-label={`${chore.name} 완료 체크 (준비 중)`}
        title="완료 체크는 준비 중이에요"
      >
        ✓
      </button>
    </li>
  )
}

export default ChoreCard
