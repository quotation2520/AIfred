import { describe, expect, it } from 'vitest'
import type { Chore } from './choreStatus'
import { computeSections } from './dashboardLayout'

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
  it('오늘 할 일과 나머지로 나눈다 (PRD 4장 예시: 10/05 + 7일 → 10/14 D+2)', () => {
    const sections = computeSections(CHORES, TODAY)
    expect(ids(sections.today)).toEqual(['a', 'b'])
    expect(ids(sections.other)).toEqual(['c'])
  })

  it('완료해서 남은 일수가 바뀌면 바로 새 영역과 순서로 옮긴다', () => {
    const done = CHORES.map((c) => (c.id === 'a' ? { ...c, lastDoneAt: TODAY } : c))
    const sections = computeSections(done, TODAY)
    expect(ids(sections.today)).toEqual(['b'])
    // 화분 물주기 D-7, 냉장고 청소 D-17
    expect(ids(sections.other)).toEqual(['a', 'c'])
  })

  it('남은 일수가 같으면 이름순이고, 삭제된 집안일은 뺀다', () => {
    const list = [
      chore('x', '빨래', 7, '2026-10-10'), // D-3
      chore('y', '걸레질', 7, '2026-10-10'), // D-3
      { ...chore('z', '가습기', 7, '2026-10-10'), deletedAt: '2026-10-13T00:00:00Z' },
    ]
    const sections = computeSections(list, TODAY)
    expect(ids(sections.today)).toEqual([])
    expect(ids(sections.other)).toEqual(['y', 'x'])
  })
})
