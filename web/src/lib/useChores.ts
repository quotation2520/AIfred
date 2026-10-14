import { useCallback, useEffect, useRef, useState } from 'react'
import { type ChoreRecord, listChores } from '../api/chores'
import { type ErrorText, loadErrorText } from './errorMessages'

export type ChoreListState =
  | { kind: 'loading' }
  | { kind: 'error'; error: ErrorText }
  | { kind: 'ready'; chores: ChoreRecord[] }

export interface ChoreStore {
  state: ChoreListState
  /** 불러오기에 실패했을 때 다시 불러온다. */
  retry: () => void
  /** 화면의 집안일 하나를 바꾼다(낙관적 갱신, 서버 응답 반영). 없는 id면 그대로다. */
  replace: (id: string, change: (chore: ChoreRecord) => ChoreRecord) => void
  /** 서버 응답으로 받은 집안일을 넣거나 바꾼다(추가·편집 저장). */
  upsert: (chore: ChoreRecord) => void
}

/** 앱이 다시 보일 때 조용히 다시 불러오는 최소 간격 */
export const REFRESH_MIN_INTERVAL_MS = 30_000

/**
 * 집안일 목록. 앱이 열릴 때 한 번 불러오고, 그 뒤로는 저장·완료·삭제 응답으로 고친다.
 * 앱이 다시 보이면(visibilitychange) 마지막으로 불러온 지 30초가 지났을 때 조용히 다시 불러온다.
 * 다른 기기에서 바꾼 내용을 반영하기 위해서다. 그 사이 화면에서 고친 것이 있으면 받은 목록은 버린다.
 * 대시보드는 시트가 열려 있는 동안에도 그대로 있으므로(다시 불러오지 않는다) App이 이 목록을 갖고,
 * 대시보드와 편집 시트(주소의 id로 집안일 찾기)가 함께 쓴다.
 */
export function useChores(): ChoreStore {
  const [state, setState] = useState<ChoreListState>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  /** replace·upsert마다 올린다. 조용한 새로고침 응답이 그 사이 고친 내용을 덮지 않게 한다. */
  const generation = useRef(0)
  const loadedAt = useRef(0)

  useEffect(() => {
    let cancelled = false
    listChores().then(
      (chores) => {
        loadedAt.current = Date.now()
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

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - loadedAt.current < REFRESH_MIN_INTERVAL_MS) return
      const startedAt = generation.current
      listChores().then(
        (chores) => {
          loadedAt.current = Date.now()
          if (generation.current !== startedAt) return
          setState((current) => (current.kind === 'ready' ? { kind: 'ready', chores } : current))
        },
        () => {
          // 집 밖이거나 서버가 꺼져 있을 수 있다. 조용한 새로고침이므로 지금 목록을 그대로 둔다.
        },
      )
    }
    document.addEventListener('visibilitychange', refresh)
    return () => document.removeEventListener('visibilitychange', refresh)
  }, [])

  const retry = useCallback(() => {
    setState({ kind: 'loading' })
    setAttempt((n) => n + 1)
  }, [])

  const replace = useCallback((id: string, change: (chore: ChoreRecord) => ChoreRecord) => {
    generation.current += 1
    setState((current) =>
      current.kind === 'ready'
        ? { ...current, chores: current.chores.map((chore) => (chore.id === id ? change(chore) : chore)) }
        : current,
    )
  }, [])

  const upsert = useCallback((saved: ChoreRecord) => {
    generation.current += 1
    setState((current) => {
      if (current.kind !== 'ready') return current
      const exists = current.chores.some((chore) => chore.id === saved.id)
      return {
        ...current,
        chores: exists
          ? current.chores.map((chore) => (chore.id === saved.id ? saved : chore))
          : [...current.chores, saved],
      }
    })
  }, [])

  return { state, retry, replace, upsert }
}
