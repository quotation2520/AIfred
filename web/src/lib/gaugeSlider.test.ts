import { describe, expect, it } from 'vitest'
import { computeStatus, lastDoneAtForRemaining, remainingDays } from './choreStatus'
import { DRAG_START_PX, clampRemaining, dragIntent, dragValue, remainingText } from './gaugeSlider'

describe('잔여일 → 마지막 수행일', () => {
  it('새 마지막 수행일 = 오늘 − (주기 − 잔여일). PRD 4장 예시(주기 7일, 10/5 수행 → 10/12 D-Day)와 맞다', () => {
    expect(lastDoneAtForRemaining('2026-10-12', 7, 0)).toBe('2026-10-05')
    expect(computeStatus(lastDoneAtForRemaining('2026-10-12', 7, 0), 7, '2026-10-12').badge).toBe('D-Day')
    // 10/14에 D-4로 조절 → 10/11에 한 것으로 본다.
    expect(lastDoneAtForRemaining('2026-10-14', 7, 4)).toBe('2026-10-11')
    // 주기만큼 남기면 오늘 한 것과 같다.
    expect(lastDoneAtForRemaining('2026-10-14', 7, 7)).toBe('2026-10-14')
  })

  it('월과 해를 넘겨 계산하고, remainingDays와 서로 역이다', () => {
    expect(lastDoneAtForRemaining('2027-01-02', 30, 10)).toBe('2026-12-13')
    expect(lastDoneAtForRemaining('2028-03-01', 2, 0)).toBe('2028-02-28')
    for (const remaining of [0, 1, 5, 14]) {
      expect(remainingDays(lastDoneAtForRemaining('2026-10-14', 14, remaining), 14, '2026-10-14')).toBe(remaining)
    }
  })

  it('잘못된 값은 거부한다', () => {
    expect(() => lastDoneAtForRemaining('2026-10-14', 0, 0)).toThrow(RangeError)
    expect(() => lastDoneAtForRemaining('2026-10-14', 7, 1.5)).toThrow(RangeError)
  })
})

describe('슬라이더 계산', () => {
  it('잔여일을 0~주기로 자른다: 지연은 0(D-Day), 미래 수행일은 주기', () => {
    expect(clampRemaining(-2, 7)).toBe(0)
    expect(clampRemaining(0, 7)).toBe(0)
    expect(clampRemaining(4, 7)).toBe(4)
    expect(clampRemaining(9, 7)).toBe(7)
  })

  it('끈 거리만큼 1일 단위로 바꾼다', () => {
    // 트랙 280px, 주기 7일 → 40px당 1일
    expect(dragValue(3, 0, 280, 7)).toBe(3)
    expect(dragValue(3, 39, 280, 7)).toBe(4)
    expect(dragValue(3, 19, 280, 7)).toBe(3)
    expect(dragValue(3, -80, 280, 7)).toBe(1)
    expect(dragValue(3, -1000, 280, 7)).toBe(0)
    expect(dragValue(3, 1000, 280, 7)).toBe(7)
    // 폭을 재지 못하면 그대로
    expect(dragValue(3, 100, 0, 7)).toBe(3)
  })

  it('가로로 기준 거리 이상, 세로보다 많이 움직여야 조절이고, 세로로 먼저 움직이면 스크롤이다', () => {
    expect(DRAG_START_PX).toBe(10)
    expect(dragIntent(9, 0)).toBe('undecided')
    expect(dragIntent(10, 3)).toBe('adjust')
    expect(dragIntent(-12, 5)).toBe('adjust')
    expect(dragIntent(12, 12)).toBe('scroll')
    expect(dragIntent(3, -15)).toBe('scroll')
    expect(dragIntent(5, 5)).toBe('undecided')
  })

  it('읽기용 값', () => {
    expect(remainingText(4)).toBe('4일 남음')
    expect(remainingText(0)).toBe('오늘 해야 함')
    expect(remainingText(-2)).toBe('2일 지남')
  })
})
