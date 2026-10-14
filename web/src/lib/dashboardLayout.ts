/**
 * 대시보드 두 영역(오늘 할 일 / 그 밖의 집안일)에 카드를 나누는 규칙.
 *
 * 배치는 항상 지금 값으로 계산한다. 완료 체크나 잔여일 조절로 순서가 바뀌면 카드는 바로 제자리로 가고,
 * 화면에서는 위치 이동 애니메이션(lib/useFlip.ts)으로 어디로 갔는지 보여 준다.
 */

import { type Chore, selectTodayChores, sortByUrgency } from './choreStatus'

export interface Sections<T> {
  today: T[]
  other: T[]
}

/** 지금 날짜 기준의 배치. 오늘 할 일에 나온 집안일은 아래 영역에서 뺀다 (UX U9). */
export function computeSections<T extends Chore>(chores: readonly T[], today: string): Sections<T> {
  const todayChores = selectTodayChores(chores, today)
  const todayIds = new Set(todayChores.map((chore) => chore.id))
  const other = sortByUrgency(chores, today).filter((chore) => !todayIds.has(chore.id))
  return { today: todayChores, other }
}
