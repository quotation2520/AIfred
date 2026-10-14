import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type ChoreRecord,
  completeChore,
  listChores,
  newCompletionId,
  undoCompletion,
  updateChore,
} from '../api/chores'
import { badgeOf, lastDoneAtForRemaining, summarize } from '../lib/choreStatus'
import { computeSections } from '../lib/dashboardLayout'
import {
  type ErrorText,
  adjustErrorText,
  adjustUndoErrorText,
  completeErrorText,
  loadErrorText,
  undoErrorText,
} from '../lib/errorMessages'
import { formatKoreanDate } from '../lib/formatDate'
import { useFlip } from '../lib/useFlip'
import ChoreCard from './ChoreCard'
import ErrorNotice from './ErrorNotice'
import UndoToast from './UndoToast'

/** 실행 취소 알림이 떠 있는 시간(ms) */
export const UNDO_TOAST_MS = 5000

interface DashboardProps {
  today: string
  onAdd: () => void
  onEdit: (chore: ChoreRecord) => void
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; error: ErrorText }
  | { kind: 'ready'; chores: ChoreRecord[] }

/**
 * 실행 취소 알림. 연달아 완료·조절하면 마지막 것만 보여 준다(앞의 것도 서버에는 이미 저장돼 있다).
 * previous는 바꾸기 전의 집안일로, 실행 취소 때 화면을 바로 되돌리는 데 쓴다.
 */
type UndoAction =
  | { kind: 'complete'; key: string; completionId: string; choreId: string; name: string; previous: ChoreRecord }
  | { kind: 'adjust'; key: string; choreId: string; name: string; badge: string; previous: ChoreRecord }

function laterDate(a: string, b: string): string {
  return a >= b ? a : b
}

function toastText(action: UndoAction): string {
  return action.kind === 'complete' ? `${action.name} 완료` : `${action.name} → ${action.badge}`
}

/**
 * PRD 6장 대시보드: 상단 요약, 오늘 할 일(F5), 그 밖의 집안일(F2, F4), 완료 체크와 실행 취소(F3), 게이지로 잔여일 조절.
 * 화면이 열릴 때마다 목록을 불러온다. 날짜(today)가 바뀌면 같은 목록으로 다시 계산한다.
 *
 * 완료 체크와 잔여일 조절은 화면을 먼저 바꾸고(낙관적 갱신) 서버 응답의 집안일로 확정한다. 실패하면 원래대로 되돌린다.
 * 카드는 항상 남은 일수 순서의 제자리에 놓이고, 자리를 옮길 때는 위치 이동 애니메이션(useFlip)으로 보여 준다.
 * 옮겨 가는 동안에는 그 카드의 체크를 받지 않는다. 연달아 체크하다가 손가락 아래로 미끄러져 온 카드를 잘못 누르지 않게 하려는 것이다.
 */
function Dashboard({ today, onAdd, onEdit }: DashboardProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set())
  // 같은 렌더 안에서 두 번 눌러도 막을 수 있도록 진행 중 목록을 ref에도 둔다.
  const pendingRef = useRef<ReadonlySet<string>>(pending)
  const [toast, setToast] = useState<UndoAction | null>(null)
  const toastSeq = useRef(0)
  const [actionError, setActionError] = useState<ErrorText | null>(null)
  const flip = useFlip()

  useEffect(() => {
    let cancelled = false
    listChores().then(
      (chores) => {
        if (!cancelled) setState({ kind: 'ready', chores })
      },
      (error: unknown) => {
        if (!cancelled) setState({ kind: 'error', error: loadErrorText(error) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [attempt])

  // 실행 취소 알림은 UNDO_TOAST_MS 뒤에 닫힌다. 새 알림이 오면 시간을 다시 잰다.
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), UNDO_TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast])

  const retry = useCallback(() => {
    setState({ kind: 'loading' })
    setAttempt((n) => n + 1)
  }, [])

  const replaceChore = useCallback((id: string, change: (chore: ChoreRecord) => ChoreRecord) => {
    setState((current) =>
      current.kind === 'ready'
        ? { ...current, chores: current.chores.map((chore) => (chore.id === id ? change(chore) : chore)) }
        : current,
    )
  }, [])

  const markPending = useCallback((id: string, on: boolean) => {
    const next = new Set(pendingRef.current)
    if (on) next.add(id)
    else next.delete(id)
    pendingRef.current = next
    setPending(next)
  }, [])

  const nextToastKey = () => {
    toastSeq.current += 1
    return String(toastSeq.current)
  }

  const chores = state.kind === 'ready' ? state.chores : []
  const summary = summarize(chores, today)
  const sections = computeSections(chores, today)
  const hasChores = sections.today.length + sections.other.length > 0

  const handleComplete = (chore: ChoreRecord) => {
    if (pendingRef.current.has(chore.id) || chore.lastDoneAt === today) return
    if (flip.isMoving(chore.id)) return
    const previous = chore
    const completionId = newCompletionId()
    markPending(chore.id, true)
    setActionError(null)
    replaceChore(chore.id, (current) => ({ ...current, lastDoneAt: laterDate(current.lastDoneAt, today) }))

    // doneOn은 보내지 않고 서버의 오늘을 쓴다. 기기 시계가 서버보다 빠르면 자정 직후 미래 날짜로 422가 나기 때문이다.
    completeChore(chore.id, { id: completionId })
      .then(
        ({ chore: saved }) => {
          replaceChore(saved.id, () => saved)
          setToast({ kind: 'complete', key: nextToastKey(), completionId, choreId: saved.id, name: saved.name, previous })
        },
        (error: unknown) => {
          replaceChore(chore.id, () => previous)
          setActionError(completeErrorText(error))
        },
      )
      .finally(() => markPending(chore.id, false))
  }

  /**
   * 게이지로 남은 일수를 고친다. 새 마지막 수행일 = 오늘 − (주기 − 남은 일수).
   * 완료 기록은 만들지 않는 보정이다. 날짜가 그대로면 저장하지 않는다.
   */
  const handleAdjust = (chore: ChoreRecord, remaining: number) => {
    if (pendingRef.current.has(chore.id)) return
    const lastDoneAt = lastDoneAtForRemaining(today, chore.intervalDays, remaining)
    if (lastDoneAt === chore.lastDoneAt) return
    const previous = chore
    markPending(chore.id, true)
    setActionError(null)
    replaceChore(chore.id, (current) => ({ ...current, lastDoneAt }))

    updateChore(chore.id, { lastDoneAt })
      .then(
        (saved) => {
          replaceChore(saved.id, () => saved)
          setToast({
            kind: 'adjust',
            key: nextToastKey(),
            choreId: saved.id,
            name: saved.name,
            badge: badgeOf(remaining),
            previous,
          })
        },
        (error: unknown) => {
          replaceChore(chore.id, () => previous)
          setActionError(adjustErrorText(error))
        },
      )
      .finally(() => markPending(chore.id, false))
  }

  const handleUndo = () => {
    if (!toast || pendingRef.current.has(toast.choreId)) return
    const action = toast
    const { choreId, previous } = action
    const changed = chores.find((chore) => chore.id === choreId)
    setToast(null)
    markPending(choreId, true)
    setActionError(null)
    replaceChore(choreId, (current) => ({ ...current, lastDoneAt: previous.lastDoneAt }))

    const request =
      action.kind === 'complete'
        ? undoCompletion(action.completionId)
        : updateChore(choreId, { lastDoneAt: previous.lastDoneAt })
    request
      .then(
        (saved) => replaceChore(saved.id, () => saved),
        (error: unknown) => {
          if (changed) replaceChore(choreId, () => changed)
          setActionError(action.kind === 'complete' ? undoErrorText(error) : adjustUndoErrorText(error))
        },
      )
      .finally(() => markPending(choreId, false))
  }

  const renderCard = (chore: ChoreRecord) => (
    <ChoreCard
      key={chore.id}
      itemRef={flip.register(chore.id)}
      chore={chore}
      today={today}
      onOpen={onEdit}
      onComplete={handleComplete}
      onAdjust={handleAdjust}
      busy={pending.has(chore.id)}
    />
  )

  return (
    <>
      <main className="dashboard">
        <header className="summary">
          <h1 className="summary__date">{formatKoreanDate(today)}</h1>
          {state.kind === 'ready' && (
            <p className="summary__counts" data-testid="summary">
              오늘 할 일 {summary.todo}개
              {summary.overdue > 0 && (
                <>
                  {' '}
                  (<span className="summary__overdue">밀린 일 {summary.overdue}개</span> 포함)
                </>
              )}
            </p>
          )}
        </header>

        {state.kind === 'loading' && (
          <p className="status-message" role="status">
            불러오는 중…
          </p>
        )}

        {state.kind === 'error' && (
          <ErrorNotice error={state.error} className="dashboard__error">
            <button type="button" className="button button--primary button--large" onClick={retry}>
              다시 시도
            </button>
          </ErrorNotice>
        )}

        {state.kind === 'ready' && !hasChores && (
          <div className="onboarding">
            <p className="onboarding__title">첫 집안일을 등록해 보세요</p>
            <p className="onboarding__text">
              주기와 마지막으로 한 날을 적어 두면, 언제 다시 해야 하는지 알려 드려요.
            </p>
            <button type="button" className="button button--primary button--large" onClick={onAdd}>
              집안일 추가
            </button>
          </div>
        )}

        {state.kind === 'ready' && hasChores && (
          <>
            <section className="section" aria-labelledby="today-heading">
              <h2 id="today-heading" className="section__title">
                오늘 할 일
              </h2>
              {sections.today.length === 0 ? (
                <p className="empty">오늘 할 일이 없어요. 푹 쉬세요!</p>
              ) : (
                <ul className="card-list">{sections.today.map(renderCard)}</ul>
              )}
            </section>

            {/* 모든 집안일이 오늘 할 일에 들어가면 이 영역은 숨긴다. */}
            {sections.other.length > 0 && (
              <section className="section" aria-labelledby="other-heading">
                <h2 id="other-heading" className="section__title">
                  그 밖의 집안일
                </h2>
                <ul className="card-list">{sections.other.map(renderCard)}</ul>
              </section>
            )}
          </>
        )}
      </main>

      {actionError && (
        <div className="action-error">
          <ErrorNotice error={actionError}>
            <button type="button" className="button" onClick={() => setActionError(null)}>
              닫기
            </button>
          </ErrorNotice>
        </div>
      )}

      {/* 불투명한 하단 막대 안에 "+"를 두어, 어떤 스크롤 위치에서도 카드 위에 겹치지 않게 한다 (UX U2).
          실행 취소 알림은 같은 막대의 왼쪽에 나와 "+"와 겹치지 않는다 (UX U6). */}
      <div className="bottom-bar">
        <div className="bottom-bar__inner">
          <div className="bottom-bar__notice" aria-live="polite">
            <UndoToast message={toast && { key: toast.key, text: toastText(toast) }} onUndo={handleUndo} />
          </div>
          <button type="button" className="fab" onClick={onAdd} aria-label="집안일 추가">
            +
          </button>
        </div>
      </div>
    </>
  )
}

export default Dashboard
