import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Chore } from './choreStatus'
import {
  LATER_OPEN_STORAGE_KEY,
  LATER_THRESHOLD_DAYS,
  computeSections,
  isLater,
  loadLaterOpen,
  saveLaterOpen,
} from './dashboardLayout'

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
    expect(ids(sections.other)).toEqual([])
    expect(ids(sections.later)).toEqual(['c'])
  })

  it('완료해서 남은 일수가 바뀌면 바로 새 영역과 순서로 옮긴다', () => {
    const done = CHORES.map((c) => (c.id === 'a' ? { ...c, lastDoneAt: TODAY } : c))
    const sections = computeSections(done, TODAY)
    expect(ids(sections.today)).toEqual(['b'])
    // 화분 물주기 D-7, 냉장고 청소 D-17: 둘 다 나중에 할 일
    expect(ids(sections.other)).toEqual([])
    expect(ids(sections.later)).toEqual(['a', 'c'])
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
    expect(ids(sections.later)).toEqual([])
  })

  it('남은 일수 7일 이상은 나중에 할 일이다: 6은 그 밖의 집안일, 7은 나중에 할 일', () => {
    expect(LATER_THRESHOLD_DAYS).toBe(7)
    const six = chore('s', '먼지 털기', 7, '2026-10-13') // D-6
    const seven = chore('v', '물걸레질', 10, '2026-10-11') // D-7
    expect(isLater(six, TODAY)).toBe(false)
    expect(isLater(seven, TODAY)).toBe(true)
    const sections = computeSections([seven, six, ...CHORES], TODAY)
    expect(ids(sections.other)).toEqual(['s'])
    // 정렬은 그대로 이어진다: other 뒤에 later
    expect(ids(sections.later)).toEqual(['v', 'c'])
  })
})

describe('나중에 할 일 펼침 상태 저장', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubStorage(storage: Partial<Storage>) {
    vi.stubGlobal('window', { localStorage: storage })
  }

  it('"1"이면 펼침, 없거나 다른 값이면 접힘', () => {
    const values = new Map<string, string>()
    stubStorage({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => void values.set(key, value),
    })
    expect(loadLaterOpen()).toBe(false)
    saveLaterOpen(true)
    expect(values.get(LATER_OPEN_STORAGE_KEY)).toBe('1')
    expect(loadLaterOpen()).toBe(true)
    saveLaterOpen(false)
    expect(values.get(LATER_OPEN_STORAGE_KEY)).toBe('0')
    expect(loadLaterOpen()).toBe(false)
  })

  it('저장소 접근이 실패하면 접힌 상태를 돌려주고, 저장 실패는 조용히 넘어간다', () => {
    stubStorage({
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    })
    expect(loadLaterOpen()).toBe(false)
    expect(() => saveLaterOpen(true)).not.toThrow()
  })
})
