import { useState } from 'react'
import type { ChoreRecord } from '../api/chores'
import { computeStatus, lastDoneAtForRemaining } from '../lib/choreStatus'
import { formatInterval } from '../lib/formatDate'
import { clampRemaining, remainingText } from '../lib/gaugeSlider'
import BreakableText from './BreakableText'
import GaugeSlider from './GaugeSlider'

const DEFAULT_ICON = '🧹'

interface ChoreCardProps {
  chore: ChoreRecord
  today: string
  onOpen: (chore: ChoreRecord) => void
  /** "⋯" 버튼: 편집·삭제 메뉴를 연다. */
  onMenu: (chore: ChoreRecord) => void
  /** 체크 버튼. 오늘 완료한 카드에서 누르면 완료 취소다(받는 쪽이 판단한다). */
  onComplete: (chore: ChoreRecord) => void
  /** 게이지를 끌어 남은 일수를 remaining으로 고쳤을 때. 값이 그대로인지는 받는 쪽이 판단한다. */
  onAdjust: (chore: ChoreRecord, remaining: number) => void
  /** 이 카드의 완료·조절·실행 취소 요청이 진행 중이면 true. 그동안 체크 버튼과 게이지를 쓸 수 없다. */
  busy?: boolean
  /** 오늘 완료를 취소하는 중이면 true. 서버 응답 전에도 체크를 완료 전 모양으로 보여 준다. */
  uncompleting?: boolean
  /** 위치 이동 애니메이션(useFlip)용 ref */
  itemRef?: (el: HTMLLIElement | null) => void | (() => void)
}

/**
 * PRD 6장 카드: 아이콘 · 이름 · 배지 · 주기 · 게이지 바 · 완료 체크 버튼(F3).
 *
 * 폰(360px)에서도 이름이 먼저 자리를 차지한다 (UX U1). 이름은 윗줄을 혼자 쓰고 단어 단위로 두 줄까지 보인 뒤 말줄임한다.
 * 배지와 주기는 이름 아래 둘째 줄로 내렸다. 지연 카드는 색 말고도 배지의 "!"와 왼쪽 굵은 띠로 구분한다 (UX U4).
 * 이름 줄을 누르면 편집이고, 오른쪽 위 "⋯"는 편집·삭제 메뉴다 (UX U2). 게이지는 편집 버튼 밖의 슬라이더다.
 * 오늘 완료한 카드의 초록 체크는 다시 누르면 오늘 완료를 취소한다 (UX U6). 작은 "↺" 표시가 그 단서다.
 */
function ChoreCard({
  chore,
  today,
  onOpen,
  onMenu,
  onComplete,
  onAdjust,
  busy = false,
  uncompleting = false,
  itemRef,
}: ChoreCardProps) {
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
  const doneToday = chore.lastDoneAt === today && !uncompleting

  return (
    <li ref={itemRef} className={`chore-card chore-card--${status.status}`} data-status={status.status}>
      <button
        type="button"
        className="chore-card__main"
        aria-label={`${chore.name} ${interval} ${spoken} 편집`}
        onClick={() => onOpen(chore)}
      >
        <span className="chore-card__icon" aria-hidden="true">
          {icon}
        </span>
        <span className="chore-card__text">
          <span className="chore-card__name">
            <BreakableText text={chore.name} />
          </span>
          <span className="chore-card__meta">
            <span className={`badge badge--${status.status}`}>
              {overdue && (
                <span className="badge__alert" aria-hidden="true">
                  !
                </span>
              )}
              <span className="badge__text">{status.badge}</span>
            </span>
            <span className="chore-card__interval">{interval}</span>
          </span>
        </span>
      </button>
      <button
        type="button"
        className="chore-card__menu"
        aria-label={`${chore.name} 메뉴`}
        aria-haspopup="dialog"
        onClick={() => onMenu(chore)}
      >
        <span aria-hidden="true">⋯</span>
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
        disabled={busy}
        aria-busy={busy || undefined}
        aria-label={doneToday ? `${chore.name} 오늘 완료함, 누르면 완료 취소` : `${chore.name} 완료 체크`}
        onClick={() => onComplete(chore)}
      >
        <span aria-hidden="true">✓</span>
        {doneToday && (
          <span className="chore-card__check-undo" aria-hidden="true">
            ↺
          </span>
        )}
      </button>
    </li>
  )
}

export default ChoreCard
