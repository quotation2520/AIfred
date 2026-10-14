import { describe, expect, it } from 'vitest'
import type { Chore } from './choreStatus'
import { computeSections, freezeSections, layoutSections } from './dashboardLayout'

const TODAY = '2026-10-14'

function chore(id: string, name: string, intervalDays: number, lastDoneAt: string): Chore {
  return { id, name, intervalDays, lastDoneAt, deletedAt: null }
}

const CHORES = [
  chore('a', '화분 물주기', 7, '2026-10-05'), // D+2
  chore('b', '걸레질', 3, '2026-10-11'), // D-Day
  chore('c', '냉장고 청소', 30, '2026-10-01'), // D-17
]

const ids = (list: Chore[]) => list.map((c) => c.id)

describe('대시보드 배치', () => {
  it('고정하지 않으면 오늘 할 일과 나머지로 나눈다 (PRD 4장 예시: 10/05 + 7일 → 10/14 D+2)', () => {
    const sections = computeSections(CHORES, TODAY)
    expect(ids(sections.today)).toEqual(['a', 'b'])
    expect(ids(sections.other)).toEqual(['c'])
    expect(layoutSections(CHORES, TODAY, null)).toEqual(sections)
  })

  it('고정하면 완료해서 남은 일수가 바뀌어도 원래 영역과 순서를 지킨다', () => {
    const frozen = freezeSections(computeSections(CHORES, TODAY))
    const done = CHORES.map((c) => (c.id === 'a' ? { ...c, lastDoneAt: TODAY } : c))

    const held = layoutSections(done, TODAY, frozen)
    expect(ids(held.today)).toEqual(['a', 'b'])
    expect(ids(held.other)).toEqual(['c'])
    // 카드 내용은 최신 값이다.
    expect(held.today[0].lastDoneAt).toBe(TODAY)

    expect(ids(layoutSections(done, TODAY, null).other)).toEqual(['a', 'c'])
  })

  it('고정 뒤에 생긴 집안일은 원래 영역 끝에 붙이고, 사라진 집안일은 뺀다', () => {
    const frozen = freezeSections(computeSections(CHORES, TODAY))
    const changed = [...CHORES.filter((c) => c.id !== 'b'), chore('d', '빨래', 2, '2026-10-01')]

    const held = layoutSections(changed, TODAY, frozen)
    expect(ids(held.today)).toEqual(['a', 'd'])
    expect(ids(held.other)).toEqual(['c'])
  })
})
