import { type Ref, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import {
  type ChoreRecord,
  completeChore,
  deleteChore,
  newCompletionId,
  restoreChore,
  undoCompletion,
  undoTodayCompletion,
  updateChore,
} from '../api/chores'
import { badgeOf, lastDoneAtForRemaining, summarize } from '../lib/choreStatus'
import { computeSections, isLater, loadLaterOpen, saveLaterOpen } from '../lib/dashboardLayout'
import {
  type ErrorText,
  adjustErrorText,
  adjustUndoErrorText,
  completeErrorText,
  deleteErrorText,
  restoreErrorText,
  uncompleteErrorText,
  undoErrorText,
} from '../lib/errorMessages'
import { formatKoreanDate } from '../lib/formatDate'
import { canAnimateExit } from '../lib/motion'
import { useBackLayer } from '../lib/useBackLayer'
import type { ChoreStore } from '../lib/useChores'
import { useFlip } from '../lib/useFlip'
import ChoreCard from './ChoreCard'
import ChoreMenu from './ChoreMenu'
import ErrorNotice from './ErrorNotice'
import UndoToast from './UndoToast'

/** 실행 취소 알림이 떠 있는 시간(ms) */
export const UNDO_TOAST_MS = 5000

/** 접힌 "나중에 할 일"로 들어간 카드를 알리는 문구. 실행 취소 알림의 둘째 줄에 붙는다. */
export const MOVED_LATER_TEXT = '나중에 할 일로 이동'

/** 펼치기/접기 버튼의 위치 이동 애니메이션용 id. 집안일 id(UUID)와 겹치지 않는다. */
const LATER_TOGGLE_FLIP_ID = 'later-toggle'

/** App이 편집 시트의 "삭제"를 대시보드의 삭제(실행 취소 알림 포함)로 넘길 때 쓴다. */
export interface DashboardHandle {
  deleteChore: (chore: ChoreRecord) => void
}

interface DashboardProps {
  today: string
  /** 집안일 목록(App이 갖는다). 시트가 열려 있어도 대시보드는 그대로 있으므로 다시 불러오지 않는다. */
  store: ChoreStore
  /** "+"나 "집안일 추가"를 눌렀을 때 */
  onAdd: () => void
  onEdit: (chore: ChoreRecord) => void
  ref?: Ref<DashboardHandle>
}

/**
 * 실행 취소 알림. 연달아 조작하면 마지막 것만 보여 준다(앞의 것도 서버에는 이미 저장돼 있다).
 * previous는 바꾸기 전의 집안일로, 실행 취소 때 화면을 바로 되돌리는 데 쓴다.
 */
type UndoAction = (
  | { kind: 'complete'; completionId: string }
  | { kind: 'adjust'; badge: string }
  | { kind: 'uncomplete' }
  | { kind: 'delete' }
) & {
  key: string
  choreId: string
  name: string
  previous: ChoreRecord
  /** 이 조작으로 카드가 접힌 "나중에 할 일"로 들어가 화면에서 사라졌으면 true */
  movedLater: boolean
}

function laterDate(a: string, b: string): string {
  return a >= b ? a : b
}

function toastText(action: UndoAction): string {
  switch (action.kind) {
    case 'complete':
      return `${action.name} 완료`
    case 'adjust':
      return `${action.name} → ${action.badge}`
    case 'uncomplete':
      return `${action.name} 완료 취소`
    case 'delete':
      return `${action.name} 삭제됨`
  }
}

function undoErrorFor(kind: UndoAction['kind'], error: unknown): ErrorText {
  switch (kind) {
    case 'complete':
      return undoErrorText(error)
    case 'adjust':
      return adjustUndoErrorText(error)
    case 'uncomplete':
      return completeErrorText(error)
    case 'delete':
      return restoreErrorText(error)
  }
}

/** 열린 카드 메뉴. closing이면 닫히는 움직임 중이다. */
interface MenuState {
  chore: ChoreRecord
  closing: boolean
}

/**
 * PRD 6장 대시보드: 상단 요약, 오늘 할 일(F5), 그 밖의 집안일(F2, F4), 완료 체크와 실행 취소(F3), 게이지로 잔여일 조절.
 * 날짜(today)가 바뀌면 같은 목록으로 다시 계산한다.
 *
 * 완료 체크, 완료 취소, 잔여일 조절, 삭제는 화면을 먼저 바꾸고(낙관적 갱신) 서버 응답으로 확정한다. 실패하면 원래대로 되돌린다.
 * 모두 실행 취소 알림을 띄운다. 오늘 완료한 카드의 초록 체크를 다시 누르면 오늘 완료를 취소한다(UX U6).
 * 카드 "⋯" 메뉴에서 편집·삭제를 고른다(UX U2). 삭제는 확인 창 없이 하고 실행 취소로 되살린다.
 * 카드는 항상 남은 일수 순서의 제자리에 놓이고, 자리를 옮길 때는 위치 이동 애니메이션(useFlip)으로 보여 준다.
 * 옮겨 가는 동안에는 그 카드의 체크를 받지 않는다. 연달아 체크하다가 손가락 아래로 미끄러져 온 카드를 잘못 누르지 않게 하려는 것이다.
 *
 * 그 밖의 집안일 중 남은 일수 7일 이상(나중에 할 일)은 기본으로 접어 두고, 펼침 상태는 기기에 기억한다.
 * 완료나 조절로 카드가 접힌 영역에 들어가 사라지면, 실행 취소 알림에 "나중에 할 일로 이동"을 덧붙이고 펼치기 버튼을 한 번 반짝인다.
 */
function Dashboard({ today, store, onAdd, onEdit, ref }: DashboardProps) {
  const { state, retry, replace: replaceChore } = store
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set())
  // 같은 렌더 안에서 두 번 눌러도 막을 수 있도록 진행 중 목록을 ref에도 둔다.
  const pendingRef = useRef<ReadonlySet<string>>(pending)
  // 오늘 완료를 취소하는 중인 카드. 응답 전에도 체크를 완료 전 모양으로 보여 준다.
  const [uncompleting, setUncompleting] = useState<ReadonlySet<string>>(() => new Set())
  const [toast, setToast] = useState<UndoAction | null>(null)
  const toastSeq = useRef(0)
  const [actionError, setActionError] = useState<ErrorText | null>(null)
  // 남은 일수 7일 이상(나중에 할 일)을 펼쳐 둘지. 기기에 기억하고, 읽지 못하면 접힌 상태로 시작한다.
  const [laterOpen, setLaterOpen] = useState(loadLaterOpen)
  // 카드가 접힌 영역으로 들어갈 때마다 늘려서 펼치기 버튼을 한 번 반짝이게 한다.
  const [laterArrivals, setLaterArrivals] = useState(0)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const flip = useFlip()

  // 실행 취소 알림은 UNDO_TOAST_MS 뒤에 닫힌다. 새 알림이 오면 시간을 다시 잰다.
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), UNDO_TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast])

  /** 메뉴를 닫는다. 바깥 탭·닫기·뒤로 가기는 내려가는 움직임을 보여 주고, 편집·삭제를 고르면 바로 닫는다. */
  const closeMenu = useCallback((animated: boolean) => {
    setMenu((current) => {
      if (!current || current.closing) return animated ? current : null
      return animated && canAnimateExit() ? { ...current, closing: true } : null
    })
  }, [])

  // 메뉴도 뒤로 가기로 닫힌다(가장 위에 열린 것 하나 닫기, UX U3).
  useBackLayer(menu !== null && !menu.closing, () => closeMenu(true))

  const markPending = useCallback((id: string, on: boolean) => {
    const next = new Set(pendingRef.current)
    if (on) next.add(id)
    else next.delete(id)
    pendingRef.current = next
    setPending(next)
  }, [])

  const markUncompleting = (id: string, on: boolean) => {
    setUncompleting((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const nextToastKey = () => {
    toastSeq.current += 1
    return String(toastSeq.current)
  }

  const chores = state.kind === 'ready' ? state.chores : []
  const summary = summarize(chores, today)
  const sections = computeSections(chores, today)
  const restCount = sections.other.length + sections.later.length
  const hasChores = sections.today.length + restCount > 0

  /** 접힌 상태에서 이 변경으로 카드가 나중에 할 일로 들어가(화면에서 사라지)면 true */
  const hidesIntoLater = (before: ChoreRecord, after: ChoreRecord) =>
    !laterOpen && !isLater(before, today) && isLater(after, today)

  const toggleLater = () => {
    const next = !laterOpen
    setLaterOpen(next)
    saveLaterOpen(next)
  }

  /** 오늘 완료를 취소한다 (UX U6). 서버가 마지막 수행일을 되돌리므로 배지와 위치는 응답으로 바뀐다. */
  const handleUncomplete = (chore: ChoreRecord) => {
    const previous = chore
    markPending(chore.id, true)
    markUncompleting(chore.id, true)
    setActionError(null)
    undoTodayCompletion(chore.id)
      .then(
        (saved) => {
          replaceChore(saved.id, () => saved)
          setToast({
            kind: 'uncomplete',
            key: nextToastKey(),
            choreId: saved.id,
            name: saved.name,
            previous,
            movedLater: hidesIntoLater(previous, saved),
          })
        },
        (error: unknown) => setActionError(uncompleteErrorText(error)),
      )
      .finally(() => {
        markPending(chore.id, false)
        markUncompleting(chore.id, false)
      })
  }

  const handleComplete = (chore: ChoreRecord) => {
    if (pendingRef.current.has(chore.id)) return
    if (flip.isMoving(chore.id)) return
    if (chore.lastDoneAt === today) {
      handleUncomplete(chore)
      return
    }
    const previous = chore
    const completionId = newCompletionId()
    markPending(chore.id, true)
    setActionError(null)
    const optimistic = { ...chore, lastDoneAt: laterDate(chore.lastDoneAt, today) }
    if (hidesIntoLater(previous, optimistic)) setLaterArrivals((n) => n + 1)
    replaceChore(chore.id, (current) => ({ ...current, lastDoneAt: laterDate(current.lastDoneAt, today) }))

    // doneOn은 보내지 않고 서버의 오늘을 쓴다. 기기 시계가 서버보다 빠르면 자정 직후 미래 날짜로 422가 나기 때문이다.
    completeChore(chore.id, { id: completionId })
      .then(
        ({ chore: saved }) => {
          replaceChore(saved.id, () => saved)
          setToast({
            kind: 'complete',
            key: nextToastKey(),
            completionId,
            choreId: saved.id,
            name: saved.name,
            previous,
            movedLater: hidesIntoLater(previous, saved),
          })
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
    if (hidesIntoLater(previous, { ...chore, lastDoneAt })) setLaterArrivals((n) => n + 1)
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
            movedLater: hidesIntoLater(previous, saved),
          })
        },
        (error: unknown) => {
          replaceChore(chore.id, () => previous)
          setActionError(adjustErrorText(error))
        },
      )
      .finally(() => markPending(chore.id, false))
  }

  /** 삭제(UX U2): 카드를 먼저 빼고 DELETE한다. 확인 창 대신 실행 취소 알림으로 되살릴 수 있다. */
  const handleDelete = (chore: ChoreRecord) => {
    if (pendingRef.current.has(chore.id)) return
    const previous = chore
    markPending(chore.id, true)
    setActionError(null)
    replaceChore(chore.id, (current) => ({ ...current, deletedAt: new Date().toISOString() }))

    deleteChore(chore.id)
      .then(
        () =>
          setToast({
            kind: 'delete',
            key: nextToastKey(),
            choreId: previous.id,
            name: previous.name,
            previous,
            movedLater: false,
          }),
        (error: unknown) => {
          replaceChore(chore.id, () => previous)
          setActionError(deleteErrorText(error))
        },
      )
      .finally(() => markPending(chore.id, false))
  }

  useImperativeHandle(ref, () => ({ deleteChore: handleDelete }))

  const handleUndo = () => {
    if (!toast || pendingRef.current.has(toast.choreId)) return
    const action = toast
    const { choreId, previous } = action
    // 실패하면 이 상태(실행 취소하기 전)로 되돌린다.
    const changed = chores.find((chore) => chore.id === choreId)
    setToast(null)
    markPending(choreId, true)
    setActionError(null)

    let request: Promise<ChoreRecord>
    switch (action.kind) {
      case 'complete':
        replaceChore(choreId, (current) => ({ ...current, lastDoneAt: previous.lastDoneAt }))
        request = undoCompletion(action.completionId)
        break
      case 'adjust':
        replaceChore(choreId, (current) => ({ ...current, lastDoneAt: previous.lastDoneAt }))
        request = updateChore(choreId, { lastDoneAt: previous.lastDoneAt })
        break
      case 'uncomplete':
        // 완료 취소의 실행 취소 = 다시 완료(새 완료 기록)
        replaceChore(choreId, (current) => ({ ...current, lastDoneAt: laterDate(current.lastDoneAt, today) }))
        request = completeChore(choreId, { id: newCompletionId() }).then((result) => result.chore)
        break
      case 'delete':
        replaceChore(choreId, () => ({ ...previous, deletedAt: null }))
        request = restoreChore(choreId)
        break
    }
    request
      .then(
        (saved) => replaceChore(saved.id, () => saved),
        (error: unknown) => {
          if (changed) replaceChore(choreId, () => changed)
          setActionError(undoErrorFor(action.kind, error))
        },
      )
      .finally(() => markPending(choreId, false))
  }

  const openMenu = (chore: ChoreRecord) => setMenu({ chore, closing: false })

  const renderCard = (chore: ChoreRecord) => (
    <ChoreCard
      key={chore.id}
      itemRef={flip.register(chore.id)}
      chore={chore}
      today={today}
      onOpen={onEdit}
      onMenu={openMenu}
      onComplete={handleComplete}
      onAdjust={handleAdjust}
      busy={pending.has(chore.id)}
      uncompleting={uncompleting.has(chore.id)}
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

            {/* 모든 집안일이 오늘 할 일에 들어가면 이 영역은 숨긴다.
                남은 일수 7일 이상(나중에 할 일)은 기본으로 접고, 맨 아래 버튼으로 펼친다. 순서는 그대로 이어진다. */}
            {restCount > 0 && (
              <section className="section" aria-labelledby="other-heading">
                <h2 id="other-heading" className="section__title">
                  그 밖의 집안일
                </h2>
                {(sections.other.length > 0 || laterOpen) && (
                  <ul className="card-list">
                    {sections.other.map(renderCard)}
                    {laterOpen && sections.later.map(renderCard)}
                  </ul>
                )}
                {sections.later.length > 0 && (
                  <button
                    type="button"
                    ref={flip.register(LATER_TOGGLE_FLIP_ID)}
                    className="later-toggle"
                    aria-expanded={laterOpen}
                    onClick={toggleLater}
                  >
                    <span
                      key={laterArrivals}
                      className={`later-toggle__label${laterArrivals > 0 ? ' later-toggle__label--arrived' : ''}`}
                    >
                      {laterOpen ? '접기' : `나중에 할 일 ${sections.later.length}개 더 보기`}
                    </span>
                  </button>
                )}
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
            <UndoToast
              message={
                toast && {
                  key: toast.key,
                  text: toastText(toast),
                  ...(toast.movedLater && { detail: MOVED_LATER_TEXT }),
                }
              }
              onUndo={handleUndo}
            />
          </div>
          <button type="button" className="fab" onClick={onAdd} aria-label="집안일 추가">
            +
          </button>
        </div>
      </div>

      {menu && (
        <ChoreMenu
          chore={menu.chore}
          closing={menu.closing}
          onExited={() => setMenu(null)}
          onClose={() => closeMenu(true)}
          onEdit={(chore) => {
            closeMenu(false)
            onEdit(chore)
          }}
          onDelete={(chore) => {
            closeMenu(false)
            // 메뉴를 연 뒤 바뀌었을 수 있으니 지금 목록의 값을 실행 취소용으로 남긴다.
            handleDelete(chores.find((c) => c.id === chore.id) ?? chore)
          }}
        />
      )}
    </>
  )
}

export default Dashboard
