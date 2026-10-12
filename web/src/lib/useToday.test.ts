import { describe, expect, it } from 'vitest'
import { msUntilNextLocalMidnight } from './useToday'

describe('msUntilNextLocalMidnight', () => {
  it('다음 로컬 자정까지 남은 시간을 돌려준다', () => {
    expect(msUntilNextLocalMidnight(new Date(2026, 9, 13, 23, 59, 58))).toBe(2000)
    expect(msUntilNextLocalMidnight(new Date(2026, 9, 13, 0, 0, 0))).toBe(24 * 60 * 60 * 1000)
  })

  it('월말과 연말도 다음 날 자정으로 넘어간다', () => {
    expect(msUntilNextLocalMidnight(new Date(2026, 9, 31, 23, 0, 0))).toBe(60 * 60 * 1000)
    expect(msUntilNextLocalMidnight(new Date(2026, 11, 31, 23, 59, 59, 500))).toBe(500)
  })
})
