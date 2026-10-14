import { useState } from 'react'
import type { ChoreRecord } from '../api/chores'
import { computeStatus, lastDoneAtForRemaining } from '../lib/choreStatus'
import { formatInterval } from '../lib/formatDate'
import { clampRemaining, remainingText } from '../lib/gaugeSlider'
import GaugeSlider from './GaugeSlider'

const DEFAULT_ICON = '🧹'

interface ChoreCardProps {
  chore: ChoreRecord
  today: string
  onOpen: (chore: ChoreRecord) => void
  onComplete: (chore: ChoreRecord) => void
  /** 게이지를 끌어 남은 일수를 remaining으로 고쳤을 때. 값이 그대로인지는 받는 쪽이 판단한다. */
  onAdjust: (chore: ChoreRecord, remaining: number) => void
  /** 이 카드의 완료·조절·실행 취소 요청이 진행 중이면 true. 그동안 체크 버튼과 게이지를 쓸 수 없다. */
  busy?: boolean
  /** 위치 이동 애니메이션(useFlip)용 ref */
  itemRef?: (el: HTMLLIElement | null) => void | (() => void)
}

/**
 * PRD 6장 카드: 아이콘 · 이름 · 주기 · 게이지 바 · 배지 · 완료 체크 버튼(F3).
 * 지연 카드는 색 말고도 배지의 경고 표시와 왼쪽 굵은 띠로 구분한다 (UX U4).
 * 카드 윗줄(아이콘, 이름, 배지)을 누르면 편집이고, 오른쪽 ">" 표시가 그 단서다 (UX U6).
 * 게이지는 편집 버튼 밖에 있는 슬라이더다. 끄는 동안 배지와 게이지가 미리 보기로 바뀌고, 손을 떼면 저장한다.
 */
function ChoreCard({ chore, today, onOpen, onComplete, onAdjust, busy = false, itemRef }: ChoreCardProps) {
  const [draft, setDraft] = useState<number | null>(null)
  const saved = computeStatus(chore.lastDoneAt, chore.intervalDays, today)
  // 끄는 동안에는 미리 보기 값으로 배지, 게이지, 카드 색을 그린다. 카드의 영역과 순서는 저장한 뒤에 바뀐다.
  const status =
    draft === null
      ? saved
      : computeStatus(lastDoneAtForRemaining(today, chore.intervalDays, draft), chore.intervalDays, today)
  const icon = chore.icon?.trim() || DEFAULT_ICON
  const overdue = status.status === 'overdue'
  const spoken = overdue ? `${status.badge} (${-status.remainingDays}일 지남)` : status.badge
  const interval = formatInterval(chore.intervalDays)
  const doneToday = chore.lastDoneAt === today

  return (
    <li
      ref={itemRef}
      className={`chore-card chore-card--${status.status}`}
      data-status={status.status}
    >
      <button
        type="button"
        className="chore-card__main"
        aria-label={`${chore.name} ${interval} ${spoken} 편집`}
        onClick={() => onOpen(chore)}
      >
        <span className="chore-card__icon" aria-hidden="true">
          {icon}
        </span>
        <span className="chore-card__header">
          <span className="chore-card__title">
            <span className="chore-card__name">{chore.name}</span>
            <span className="chore-card__interval">· {interval}</span>
          </span>
          <span className={`badge badge--${status.status}`}>
            {overdue && (
              <span className="badge__alert" aria-hidden="true">
                !
              </span>
            )}
            <span className="badge__text">{status.badge}</span>
          </span>
        </span>
        <span className="chore-card__chevron" aria-hidden="true">
          ›
        </span>
      </button>
      <div className="chore-card__gauge">
        <GaugeSlider
          label={`${chore.name} 남은 일수`}
          value={clampRemaining(saved.remainingDays, chore.intervalDays)}
          draft={draft}
          intervalDays={chore.intervalDays}
          percent={status.gaugePercent}
          valueText={remainingText(status.remainingDays)}
          disabled={busy}
          onDraft={setDraft}
          onCommit={(remaining) => {
            setDraft(null)
            onAdjust(chore, remaining)
          }}
          onCancel={() => setDraft(null)}
        />
      </div>
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
