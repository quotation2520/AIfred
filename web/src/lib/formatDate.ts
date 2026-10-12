const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const

/** "YYYY-MM-DD"를 "10월 13일 (화)"처럼 표시한다. 시간대 영향을 받지 않도록 UTC로 요일을 구한다. */
export function formatKoreanDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
  return `${month}월 ${day}일 (${weekday})`
}
