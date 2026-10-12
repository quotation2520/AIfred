import { describe, expect, it } from 'vitest'
import sharedCases from '../../../shared/status-cases.json'
import {
  type Chore,
  computeStatus,
  selectTodayChores,
  sortByUrgency,
  summarize,
  todayLocal,
} from './choreStatus'

describe('computeStatus: shared/status-cases.json', () => {
  it('케이스가 비어 있지 않다', () => {
    expect(sharedCases.cases.length).toBeGreaterThan(0)
  })

  for (const c of sharedCases.cases) {
    it(c.name, () => {
      const result = computeStatus(c.lastDoneAt, c.intervalDays, c.today)
      expect(result.remainingDays).toBe(c.remainingDays)
      expect(result.gaugePercent).toBeCloseTo(c.gaugePercent, 9)
      expect(result.status).toBe(c.status)
      expect(result.badge).toBe(c.badge)
    })
  }
})

describe('computeStatus: 세부 값', () => {
  it('PRD 예시: 경과일과 예정일을 계산한다', () => {
    const result = computeStatus('2026-10-05', 7, '2026-10-14')
    expect(result.elapsedDays).toBe(9)
    expect(result.dueDate).toBe('2026-10-12')
  })

  it('연말을 넘는 예정일을 계산한다', () => {
    expect(computeStatus('2026-12-28', 7, '2026-12-30').dueDate).toBe('2027-01-04')
  })

  it('게이지는 반올림하지 않는다', () => {
    expect(computeStatus('2026-10-05', 7, '2026-10-06').gaugePercent).toBe((6 / 7) * 100)
  })

  it('잘못된 입력은 거부한다', () => {
    expect(() => computeStatus('2026-10-05', 0, '2026-10-06')).toThrow(RangeError)
    expect(() => computeStatus('2026-10-05', 1.5, '2026-10-06')).toThrow(RangeError)
    expect(() => computeStatus('2026-02-30', 7, '2026-10-06')).toThrow(RangeError)
    expect(() => computeStatus('2026/10/05', 7, '2026-10-06')).toThrow(RangeError)
  })
})

const TODAY = '2026-10-14'

function chore(id: string, name: string, intervalDays: number, lastDoneAt: string, deletedAt?: string): Chore {
  return { id, name, intervalDays, lastDoneAt, deletedAt }
}

// TODAY 기준 남은 일수를 주석에 적는다.
const chores: Chore[] = [
  chore('a', '화분 물주기', 7, '2026-10-05'), // -2
  chore('b', '걸레질', 3, '2026-10-11'), // 0
  chore('c', '냉장고 청소', 30, '2026-10-01'), // 17
  chore('d', '빨래', 2, '2026-10-12'), // 0
  chore('e', '분리수거', 7, '2026-10-01'), // -6
  chore('f', '이불 빨래', 14, '2026-10-01'), // 1
  chore('g', '욕실 청소', 7, '2026-09-01', '2026-10-10T09:00:00Z'), // 삭제됨 (-36)
]

describe('sortByUrgency', () => {
  it('남은 일수 오름차순, 같으면 이름 오름차순이고 삭제된 일은 뺀다', () => {
    expect(sortByUrgency(chores, TODAY).map((c) => c.id)).toEqual(['e', 'a', 'b', 'd', 'f', 'c'])
  })

  it('원본 배열을 바꾸지 않는다', () => {
    const before = chores.map((c) => c.id)
    sortByUrgency(chores, TODAY)
    expect(chores.map((c) => c.id)).toEqual(before)
  })
})

describe('selectTodayChores', () => {
  it('남은 일수 ≤ 0인 일만 밀린 일 먼저 반환한다', () => {
    expect(selectTodayChores(chores, TODAY).map((c) => c.id)).toEqual(['e', 'a', 'b', 'd'])
  })

  it('삭제된 집안일은 밀렸어도 포함하지 않는다', () => {
    expect(selectTodayChores(chores, TODAY).some((c) => c.id === 'g')).toBe(false)
  })

  it('할 일이 없으면 빈 배열', () => {
    expect(selectTodayChores([chore('x', '물', 7, TODAY)], TODAY)).toEqual([])
  })
})

describe('summarize', () => {
  it('오늘 할 일 N은 밀린 일 M을 포함하고 삭제된 일은 세지 않는다', () => {
    expect(summarize(chores, TODAY)).toEqual({ todo: 4, overdue: 2 })
  })

  it('빈 목록은 0개', () => {
    expect(summarize([], TODAY)).toEqual({ todo: 0, overdue: 0 })
  })
})

describe('todayLocal', () => {
  it('기기 로컬 날짜를 YYYY-MM-DD로 만든다', () => {
    expect(todayLocal(new Date(2026, 9, 13, 0, 0, 0))).toBe('2026-10-13')
    expect(todayLocal(new Date(2026, 0, 5, 12, 0, 0))).toBe('2026-01-05')
  })

  it('로컬 자정 직전은 전날이다', () => {
    expect(todayLocal(new Date(2026, 9, 12, 23, 59, 59, 999))).toBe('2026-10-12')
  })

  it('인자가 없으면 현재 시각을 쓴다', () => {
    expect(todayLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
