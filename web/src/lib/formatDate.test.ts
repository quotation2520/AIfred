import { describe, expect, it } from 'vitest'
import { formatInterval, formatKoreanDate } from './formatDate'

describe('formatKoreanDate', () => {
  it('월, 일, 요일을 표시한다', () => {
    expect(formatKoreanDate('2026-10-13')).toBe('10월 13일 (화)')
    expect(formatKoreanDate('2026-10-14')).toBe('10월 14일 (수)')
    expect(formatKoreanDate('2026-01-04')).toBe('1월 4일 (일)')
  })
})

describe('formatInterval', () => {
  it('1일은 "매일", 나머지는 7의 배수도 일 단위 "N일마다"로 표시한다', () => {
    expect(formatInterval(1)).toBe('매일')
    expect(formatInterval(2)).toBe('2일마다')
    expect(formatInterval(7)).toBe('7일마다')
    expect(formatInterval(14)).toBe('14일마다')
    expect(formatInterval(30)).toBe('30일마다')
    expect(formatInterval(36500)).toBe('36500일마다')
  })
})
