/**
 * 대시보드 두 영역(오늘 할 일 / 그 밖의 집안일)에 카드를 나누는 규칙.
 *
 * 완료 체크 직후 카드가 다른 영역으로 옮겨지면 목록이 갑자기 뛴다(UX U6). 그래서 체크하는 순간의
 * 배치를 고정(frozen)해 두고, 실행 취소 알림이 닫힐 때까지 그 순서로 보여 준다. 카드의 내용(게이지, 배지)은
 * 고정과 상관없이 최신 값으로 그린다.
 */

import { type Chore, selectTodayChores, sortByUrgency } from './choreStatus'

/** 영역별 카드 id 순서 */
export interface FrozenLayout {
  today: string[]
  other: string[]
}

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

export function freezeSections(sections: Sections<Chore>): FrozenLayout {
  return { today: sections.today.map((c) => c.id), other: sections.other.map((c) => c.id) }
}

/**
 * frozen이 있으면 그 순서를 따른다. 고정 뒤에 생긴(목록에 새로 들어온) 집안일은 원래 규칙의 영역 끝에 붙이고,
 * 사라진(삭제된) 집안일은 뺀다. frozen이 없으면 computeSections와 같다.
 */
export function layoutSections<T extends Chore>(
  chores: readonly T[],
  today: string,
  frozen: FrozenLayout | null,
): Sections<T> {
  const live = computeSections(chores, today)
  if (!frozen) return live

  const byId = new Map(live.today.concat(live.other).map((chore) => [chore.id, chore]))
  const placed = new Set<string>()
  const pick = (ids: string[]): T[] => {
    const result: T[] = []
    for (const id of ids) {
      const chore = byId.get(id)
      if (chore && !placed.has(id)) {
        placed.add(id)
        result.push(chore)
      }
    }
    return result
  }
  const todayCards = pick(frozen.today)
  const otherCards = pick(frozen.other)
  todayCards.push(...live.today.filter((chore) => !placed.has(chore.id)))
  otherCards.push(...live.other.filter((chore) => !placed.has(chore.id)))
  return { today: todayCards, other: otherCards }
}
