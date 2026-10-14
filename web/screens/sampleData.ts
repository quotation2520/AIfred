import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ChoreRecord } from '../src/api/chores'
import type { PresetCategory } from '../src/api/presets'

const PRESETS_JSON = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'shared', 'presets.json')

interface SeedCategory {
  id: string
  name: string
  emoji: string
  items: { name: string; icon: string; intervalDays: number; note?: string }[]
}

/**
 * 가짜 GET /api/presets 응답. 서버가 처음 설치할 때 채우는 shared/presets.json을 서버 응답 형식(camelCase, id, isBuiltin)으로 바꾼다.
 * 시나리오마다 새로 만들어 추가·수정·삭제가 다른 시나리오에 번지지 않게 한다.
 */
export function samplePresets(): PresetCategory[] {
  const data = JSON.parse(readFileSync(PRESETS_JSON, 'utf-8')) as { categories: SeedCategory[] }
  return data.categories.map((category) => ({
    id: `preset-${category.id}`,
    name: category.name,
    emoji: category.emoji,
    isBuiltin: true,
    items: category.items.map((item, index) => ({
      id: `preset-${category.id}-${index}`,
      name: item.name,
      icon: item.icon,
      intervalDays: item.intervalDays,
      note: item.note ?? null,
      isBuiltin: true,
    })),
  }))
}

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

/** 2026-10-13 기준 상태를 주석으로 적는다. 오늘 할 일 3개 (밀린 일 2개 포함). */
export const SAMPLE_CHORES: ChoreRecord[] = [
  chore('sample-bath', '욕실 청소', 7, '2026-10-04', { icon: '🛁' }), // D+2
  chore('sample-plant', '화분 물주기', 7, '2026-10-05', { icon: '🪴' }), // D+1
  chore('sample-mop', '걸레질', 3, '2026-10-10', { icon: '🧽' }), // D-Day
  chore('sample-recycle', '분리수거', 4, '2026-10-10', { icon: '♻️' }), // D-1
  chore('sample-bedding', '이불 빨래', 14, '2026-10-01', { icon: '🛏️' }), // D-2
  // 아주 긴 이름: 카드에서 두 줄까지 보인 뒤 말줄임되는 모습을 보여 준다(UX U1).
  chore('sample-window', '베란다 창틀과 방충망 먼지 털고 물걸레로 깨끗하게 닦기', 10, '2026-10-08', { icon: '🪟' }), // D-5
  chore('sample-fridge', '냉장고 청소', 30, '2026-09-20', { icon: '🧊', note: '유통기한 지난 것 정리' }), // D-7
]

/** 오늘 할 일이 0개인 목록(D-1, D-2, D-7). */
export const ALL_CLEAR_CHORES: ChoreRecord[] = SAMPLE_CHORES.filter((c) =>
  ['sample-recycle', 'sample-bedding', 'sample-fridge'].includes(c.id),
)

/** 스크롤이 생기도록 여유 상태 집안일 5개를 더한 목록(오늘 할 일은 SAMPLE_CHORES와 같다). */
export const LONG_CHORES: ChoreRecord[] = [
  ...SAMPLE_CHORES,
  chore('extra-towel', '수건 삶기', 14, '2026-10-05', { icon: '🧺' }), // D-6
  chore('extra-filter', '정수기 필터 확인', 60, '2026-09-01', { icon: '🚰' }), // D-18
  chore('extra-aircon', '에어컨 필터 청소', 30, '2026-10-01', { icon: '❄️' }), // D-18
  chore('extra-shoes', '신발장 정리', 30, '2026-10-10', { icon: '👟' }), // D-27
  chore('extra-drain', '배수구 청소', 14, '2026-10-11', { icon: '🚿' }), // D-12
]

/** 모든 집안일이 오늘 할 일인 목록(D+2, D+1, D-Day). */
export const ALL_TODAY_CHORES: ChoreRecord[] = SAMPLE_CHORES.filter((c) =>
  ['sample-bath', 'sample-plant', 'sample-mop'].includes(c.id),
)
