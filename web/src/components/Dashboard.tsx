import { useCallback, useEffect, useState } from 'react'
import { type ChoreRecord, formatDetail, ApiError, listChores } from '../api/chores'
import { selectTodayChores, sortByUrgency, summarize } from '../lib/choreStatus'
import { formatKoreanDate } from '../lib/formatDate'
import ChoreCard from './ChoreCard'

interface DashboardProps {
  today: string
  onAdd: () => void
  onEdit: (chore: ChoreRecord) => void
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; chores: ChoreRecord[] }

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return `서버 오류 (${error.status}): ${formatDetail(error.detail)}`
  if (error instanceof Error) return error.message
  return String(error)
}

/** PRD 6장 대시보드: 상단 요약, 오늘 할 일(F5), 전체 집안일(F2, F4). 화면이 열릴 때마다 목록을 불러온다. */
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
        if (!cancelled) setState({ kind: 'error', message: errorMessage(error) })
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
  const allChores = sortByUrgency(chores, today)

  return (
    <main className="dashboard">
      <header className="summary">
        <h1 className="summary__date">{formatKoreanDate(today)}</h1>
        {state.kind === 'ready' && (
          <p className="summary__counts" data-testid="summary">
            오늘 할 일 {summary.todo}개 · <span className={summary.overdue > 0 ? 'summary__overdue' : undefined}>밀린 일 {summary.overdue}개</span>
          </p>
        )}
      </header>

      {state.kind === 'loading' && (
        <p className="status-message" role="status">
          불러오는 중…
        </p>
      )}

      {state.kind === 'error' && (
        <div className="status-message status-message--error" role="alert">
          <p>목록을 불러오지 못했어요.</p>
          <p className="status-message__detail">{state.message}</p>
          <button type="button" className="button" onClick={retry}>
            다시 시도
          </button>
        </div>
      )}

      {state.kind === 'ready' && (
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

          <section className="section" aria-labelledby="all-heading">
            <h2 id="all-heading" className="section__title">
              전체 집안일
            </h2>
            {allChores.length === 0 ? (
              <p className="empty">아직 등록한 집안일이 없어요. 오른쪽 아래 + 버튼으로 첫 집안일을 등록해 보세요.</p>
            ) : (
              <ul className="card-list">
                {allChores.map((chore) => (
                  <ChoreCard key={chore.id} chore={chore} today={today} onOpen={onEdit} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <button type="button" className="fab" onClick={onAdd} aria-label="집안일 추가">
        +
      </button>
    </main>
  )
}

export default Dashboard
