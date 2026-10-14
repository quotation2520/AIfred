const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const

/** "YYYY-MM-DD"를 "10월 13일 (화)"처럼 표시한다. 시간대 영향을 받지 않도록 UTC로 요일을 구한다. */
export function formatKoreanDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
  return `${month}월 ${day}일 (${weekday})`
}

/**
 * 카드에 붙이는 주기 표시: 1일은 "매일", 나머지는 "N일마다".
 * 7의 배수도 주 단위로 바꾸지 않는다. 주기 입력과 배지(D-n)가 모두 일 단위라 같은 단위로 보여야 비교하기 쉽다.
 */
export function formatInterval(intervalDays: number): string {
  return intervalDays === 1 ? '매일' : `${intervalDays}일마다`
}
