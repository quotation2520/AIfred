import { describe, expect, it } from 'vitest'
import { formatKoreanDate } from './formatDate'

describe('formatKoreanDate', () => {
  it('월, 일, 요일을 표시한다', () => {
    expect(formatKoreanDate('2026-10-13')).toBe('10월 13일 (화)')
    expect(formatKoreanDate('2026-10-14')).toBe('10월 14일 (수)')
    expect(formatKoreanDate('2026-01-04')).toBe('1월 4일 (일)')
  })
})
