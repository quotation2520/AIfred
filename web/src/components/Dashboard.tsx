import { useCallback, useEffect, useState } from 'react'
import { type ChoreRecord, listChores } from '../api/chores'
import { selectTodayChores, sortByUrgency, summarize } from '../lib/choreStatus'
import { type ErrorText, loadErrorText } from '../lib/errorMessages'
import { formatKoreanDate } from '../lib/formatDate'
import ChoreCard from './ChoreCard'
import ErrorNotice from './ErrorNotice'

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
 * PRD 6장 대시보드: 상단 요약, 오늘 할 일(F5), 그 밖의 집안일(F2, F4).
 * 화면이 열릴 때마다 목록을 불러온다. 날짜(today)가 바뀌면 같은 목록으로 다시 계산한다.
 */
function Dashboard({ today, onAdd, onEdit }: DashboardProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

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

  const retry = useCallback(() => {
    setState({ kind: 'loading' })
    setAttempt((n) => n + 1)
  }, [])

  const chores = state.kind === 'ready' ? state.chores : []
  const summary = summarize(chores, today)
  const todayChores = selectTodayChores(chores, today)
  // 오늘 할 일에 나온 집안일은 아래 영역에서 뺀다 (UX U9). 정렬은 sortByUrgency 그대로.
  const todayIds = new Set(todayChores.map((chore) => chore.id))
  const otherChores = sortByUrgency(chores, today).filter((chore) => !todayIds.has(chore.id))
  const hasChores = todayChores.length + otherChores.length > 0

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
              {todayChores.length === 0 ? (
                <p className="empty">오늘 할 일이 없어요. 푹 쉬세요!</p>
              ) : (
                <ul className="card-list">
                  {todayChores.map((chore) => (
                    <ChoreCard key={chore.id} chore={chore} today={today} onOpen={onEdit} />
                  ))}
                </ul>
              )}
            </section>

            {/* 모든 집안일이 오늘 할 일에 들어가면 이 영역은 숨긴다. */}
            {otherChores.length > 0 && (
              <section className="section" aria-labelledby="other-heading">
                <h2 id="other-heading" className="section__title">
                  그 밖의 집안일
                </h2>
                <ul className="card-list">
                  {otherChores.map((chore) => (
                    <ChoreCard key={chore.id} chore={chore} today={today} onOpen={onEdit} />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>

      {/* 불투명한 하단 막대 안에 "+"를 두어, 어떤 스크롤 위치에서도 카드 위에 겹치지 않게 한다 (UX U2). */}
      <div className="bottom-bar">
        <div className="bottom-bar__inner">
          <button type="button" className="fab" onClick={onAdd} aria-label="집안일 추가">
            +
          </button>
        </div>
      </div>
    </>
  )
}

export default Dashboard
