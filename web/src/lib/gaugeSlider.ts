/**
 * 게이지 슬라이더(잔여일 조절)의 계산. 화면 조작(포인터, 키보드)과 떼어 두어 단위 테스트한다.
 *
 * 슬라이더 값은 남은 일수이고 범위는 0(D-Day)~주기다. 지연(D+n)으로는 조절할 수 없다.
 */

/** 가로로 이만큼(px) 움직여야 조절을 시작한다. 그 전에 세로로 이만큼 움직이면 스크롤로 보고 놓아 준다. */
export const DRAG_START_PX = 10

/** 남은 일수를 슬라이더 범위(0~주기)로 자른다. 지연이면 0, 마지막 수행일이 미래라 주기를 넘으면 주기. */
export function clampRemaining(remaining: number, intervalDays: number): number {
  return Math.min(intervalDays, Math.max(0, Math.round(remaining)))
}

/**
 * 끈 거리로 새 값을 구한다. 손잡이는 손가락과 같은 거리만큼 움직인다(처음 누른 곳으로 값이 튀지 않는다).
 * trackWidth가 0 이하(측정 실패)면 시작 값을 그대로 돌려준다.
 */
export function dragValue(startValue: number, dx: number, trackWidth: number, intervalDays: number): number {
  if (!(trackWidth > 0)) return clampRemaining(startValue, intervalDays)
  return clampRemaining(startValue + (dx / trackWidth) * intervalDays, intervalDays)
}

export type DragIntent = 'undecided' | 'adjust' | 'scroll'

/** 눌러서 움직인 거리로 조절(가로)인지 스크롤(세로)인지 정한다. 둘 다 아직 작으면 'undecided'. */
export function dragIntent(dx: number, dy: number): DragIntent {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (ax >= DRAG_START_PX && ax > ay) return 'adjust'
  if (ay >= DRAG_START_PX) return 'scroll'
  return 'undecided'
}

/** 읽기용 값: "4일 남음", "오늘 해야 함", "2일 지남" */
export function remainingText(remaining: number): string {
  if (remaining > 0) return `${remaining}일 남음`
  if (remaining === 0) return '오늘 해야 함'
  return `${-remaining}일 지남`
}
