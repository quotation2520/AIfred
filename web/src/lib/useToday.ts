import { useEffect, useState } from 'react'
import { todayLocal } from './choreStatus'

/** 다음 로컬 자정까지 남은 밀리초. 자정 직후에 확실히 넘어가도록 호출하는 쪽에서 여유를 더한다. */
export function msUntilNextLocalMidnight(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0)
  return next.getTime() - now.getTime()
}

/** 자정 타이머가 자정보다 조금 일찍 깨어나는 경우를 피하기 위한 여유. */
const MIDNIGHT_MARGIN_MS = 1000

/**
 * 기기 로컬 기준 오늘 날짜("YYYY-MM-DD")를 돌려주고, 날짜가 바뀌면 다시 그린다 (UX U1).
 *
 * - 로컬 자정이 지나면 타이머로 갱신한다.
 * - 앱이 다시 앞으로 오면(visibilitychange → visible, window focus) 바로 다시 계산한다.
 *   휴대폰이 잠들어 있는 동안 타이머가 늦게 깨어나도 앞으로 올 때 바로잡힌다.
 *   그때 자정 타이머도 다시 잡는다.
 * 날짜가 그대로면 같은 문자열이므로 React가 다시 그리지 않는다.
 */
export function useToday(): string {
  const [today, setToday] = useState(() => todayLocal())

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined

    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        setToday(todayLocal())
        schedule()
      }, msUntilNextLocalMidnight(new Date()) + MIDNIGHT_MARGIN_MS)
    }

    const refresh = () => {
      if (document.visibilityState === 'hidden') return
      setToday(todayLocal())
      schedule()
    }

    schedule()
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  return today
}
