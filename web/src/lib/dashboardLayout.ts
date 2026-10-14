/**
 * 대시보드 두 영역(오늘 할 일 / 그 밖의 집안일)에 카드를 나누는 규칙.
 *
 * 배치는 항상 지금 값으로 계산한다. 완료 체크나 잔여일 조절로 순서가 바뀌면 카드는 바로 제자리로 가고,
 * 화면에서는 위치 이동 애니메이션(lib/useFlip.ts)으로 어디로 갔는지 보여 준다.
 */

import { type Chore, remainingDays, selectTodayChores, sortByUrgency } from './choreStatus'

/** 남은 일수가 이 값 이상이면 "나중에 할 일"로 보고 그 밖의 집안일 영역에서 기본으로 접어 둔다. */
export const LATER_THRESHOLD_DAYS = 7

/** "나중에 할 일"을 펼쳐 두었는지 기억하는 localStorage 키 */
export const LATER_OPEN_STORAGE_KEY = 'aifred.laterOpen'

export interface Sections<T> {
  today: T[]
  /** 그 밖의 집안일 중 남은 일수가 LATER_THRESHOLD_DAYS 미만인 것 */
  other: T[]
  /** 그 밖의 집안일 중 남은 일수가 LATER_THRESHOLD_DAYS 이상인 것(나중에 할 일). other 뒤에 이어지는 순서다. */
  later: T[]
}

export function isLater(chore: Chore, today: string): boolean {
  return remainingDays(chore.lastDoneAt, chore.intervalDays, today) >= LATER_THRESHOLD_DAYS
}

/** 지금 날짜 기준의 배치. 오늘 할 일에 나온 집안일은 아래 영역에서 뺀다 (UX U9). */
export function computeSections<T extends Chore>(chores: readonly T[], today: string): Sections<T> {
  const todayChores = selectTodayChores(chores, today)
  const todayIds = new Set(todayChores.map((chore) => chore.id))
  const rest = sortByUrgency(chores, today).filter((chore) => !todayIds.has(chore.id))
  return {
    today: todayChores,
    other: rest.filter((chore) => !isLater(chore, today)),
    later: rest.filter((chore) => isLater(chore, today)),
  }
}

/** 저장된 펼침 상태. 저장소를 못 쓰거나 값이 없으면 접힌 상태(false)다. */
export function loadLaterOpen(): boolean {
  try {
    return window.localStorage.getItem(LATER_OPEN_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/** 펼침 상태를 기억한다. 저장소를 못 쓰면(사생활 보호 모드 등) 조용히 넘어간다. */
export function saveLaterOpen(open: boolean): void {
  try {
    window.localStorage.setItem(LATER_OPEN_STORAGE_KEY, open ? '1' : '0')
  } catch {
    // 기억하지 못해도 이번 화면에서는 펼친 상태가 유지된다.
  }
}
