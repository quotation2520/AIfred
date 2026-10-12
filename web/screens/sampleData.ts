import type { ChoreRecord } from '../src/api/chores'

/** 캡처 기준 시각: 2026-10-13(화) 오전 9시 KST. 실행 날짜와 상관없이 같은 화면이 나온다. */
export const FIXED_NOW = '2026-10-13T09:00:00+09:00'

/** 서버 ChoreRead 응답 형식(camelCase)의 샘플 레코드를 만든다. */
export function chore(
  id: string,
  name: string,
  intervalDays: number,
  lastDoneAt: string,
  extra: Partial<ChoreRecord> = {},
): ChoreRecord {
  return {
    id,
    name,
    intervalDays,
    lastDoneAt,
    icon: null,
    note: null,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    deletedAt: null,
    ...extra,
  }
}

/** 2026-10-13 기준 상태를 주석으로 적는다. 오늘 할 일 3개 · 밀린 일 2개. */
export const SAMPLE_CHORES: ChoreRecord[] = [
  chore('sample-bath', '욕실 청소', 7, '2026-10-04', { icon: '🛁' }), // D+2
  chore('sample-plant', '화분 물주기', 7, '2026-10-05', { icon: '🪴' }), // D+1
  chore('sample-mop', '걸레질', 3, '2026-10-10', { icon: '🧽' }), // D-Day
  chore('sample-recycle', '분리수거', 4, '2026-10-10', { icon: '♻️' }), // D-1
  chore('sample-bedding', '이불 빨래', 14, '2026-10-01', { icon: '🛏️' }), // D-2
  chore('sample-fridge', '냉장고 청소', 30, '2026-09-20', { icon: '🧊', note: '유통기한 지난 것 정리' }), // D-7
]

/** 오늘 할 일이 0개인 목록(D-1, D-2, D-7). */
export const ALL_CLEAR_CHORES: ChoreRecord[] = SAMPLE_CHORES.filter((c) =>
  ['sample-recycle', 'sample-bedding', 'sample-fridge'].includes(c.id),
)
