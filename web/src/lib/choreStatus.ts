/**
 * PRD 4장 게이지 및 상태 계산 규칙, F5 오늘 할 일 정렬.
 *
 * 날짜는 모두 "YYYY-MM-DD" 문자열이며 날짜(일) 단위로만 계산한다.
 * "오늘"은 항상 인자로 받는다. 이 모듈의 계산 함수는 현재 시각을 읽지 않는다.
 * 서버(server/app/status.py)와 같은 규칙이며, shared/status-cases.json으로 양쪽을 함께 검증한다.
 */

/** PRD 5장 Chore 중 상태 계산에 필요한 필드. */
export interface Chore {
  id: string
  name: string
  intervalDays: number
  lastDoneAt: string
  deletedAt?: string | null
}

export type ChoreStatusKind = 'ok' | 'soon' | 'today' | 'overdue'

export interface ChoreStatus {
  elapsedDays: number
  dueDate: string
  remainingDays: number
  /** 0~100, 반올림하지 않은 값 */
  gaugePercent: number
  status: ChoreStatusKind
  badge: string
}

export interface TodoSummary {
  /** 오늘 할 일 개수 (밀린 일 포함) */
  todo: number
  /** 밀린 일 개수 */
  overdue: number
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** "YYYY-MM-DD"를 UTC 자정 기준 일 번호(1970-01-01부터 경과 일수)로 바꾼다. */
function toDayNumber(value: string): number {
  const match = DATE_RE.exec(value)
  if (!match) {
    throw new RangeError(`잘못된 날짜 형식: ${value}`)
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const ms = Date.UTC(year, month - 1, day)
  const check = new Date(ms)
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new RangeError(`존재하지 않는 날짜: ${value}`)
  }
  return Math.round(ms / MS_PER_DAY)
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function fromDayNumber(dayNumber: number): string {
  const d = new Date(dayNumber * MS_PER_DAY)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

function assertInterval(intervalDays: number): void {
  if (!Number.isInteger(intervalDays) || intervalDays < 1) {
    throw new RangeError(`주기는 1 이상의 정수여야 한다: ${intervalDays}`)
  }
}

/** 남은 일수 = (마지막 수행일 + 주기) − 오늘 */
export function remainingDays(lastDoneAt: string, intervalDays: number, today: string): number {
  assertInterval(intervalDays)
  return toDayNumber(lastDoneAt) + intervalDays - toDayNumber(today)
}

export function statusOf(remaining: number): ChoreStatusKind {
  if (remaining >= 2) return 'ok'
  if (remaining === 1) return 'soon'
  if (remaining === 0) return 'today'
  return 'overdue'
}

export function badgeOf(remaining: number): string {
  if (remaining === 0) return 'D-Day'
  if (remaining > 0) return `D-${remaining}`
  return `D+${-remaining}`
}

export function computeStatus(
  lastDoneAt: string,
  intervalDays: number,
  today: string,
): ChoreStatus {
  assertInterval(intervalDays)
  const lastDay = toDayNumber(lastDoneAt)
  const todayDay = toDayNumber(today)
  const dueDay = lastDay + intervalDays
  const remaining = dueDay - todayDay
  // 마지막 수행일이 미래이면 남은 일수가 주기보다 커지므로 100으로 제한한다.
  const ratio = Math.min(1, Math.max(0, remaining / intervalDays))
  return {
    elapsedDays: todayDay - lastDay,
    dueDate: fromDayNumber(dueDay),
    remainingDays: remaining,
    gaugePercent: ratio * 100,
    status: statusOf(remaining),
    badge: badgeOf(remaining),
  }
}

/**
 * 남은 일수가 remaining이 되는 마지막 수행일 = 오늘 − (주기 − 남은 일수).
 * remainingDays의 역산이다: remainingDays(lastDoneAtForRemaining(t, n, r), n, t) === r.
 */
export function lastDoneAtForRemaining(today: string, intervalDays: number, remaining: number): string {
  assertInterval(intervalDays)
  if (!Number.isInteger(remaining)) {
    throw new RangeError(`남은 일수는 정수여야 한다: ${remaining}`)
  }
  return fromDayNumber(toDayNumber(today) - (intervalDays - remaining))
}

/** 이름 비교. 서버(Python 문자열 비교)와 결과를 맞추기 위해 로캘 비교 대신 코드 단위 비교를 쓴다. */
function compareNames(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

function isActive(chore: Chore): boolean {
  return chore.deletedAt == null
}

/**
 * 삭제되지 않은 집안일을 남은 일수 오름차순(가장 많이 밀린 일이 먼저), 같으면 이름 오름차순으로 정렬한다.
 * 원본 배열은 바꾸지 않는다.
 */
export function sortByUrgency<T extends Chore>(chores: readonly T[], today: string): T[] {
  return chores
    .filter(isActive)
    .map((chore) => ({ chore, remaining: remainingDays(chore.lastDoneAt, chore.intervalDays, today) }))
    .sort((a, b) => a.remaining - b.remaining || compareNames(a.chore.name, b.chore.name))
    .map((entry) => entry.chore)
}

/** 오늘 할 일(남은 일수 ≤ 0, 밀린 일 포함)을 정렬 기준대로 반환한다. */
export function selectTodayChores<T extends Chore>(chores: readonly T[], today: string): T[] {
  return sortByUrgency(chores, today).filter(
    (chore) => remainingDays(chore.lastDoneAt, chore.intervalDays, today) <= 0,
  )
}

/** "오늘 할 일 N개 (밀린 일 M개 포함)"의 N(밀린 일 포함)과 M. */
export function summarize(chores: readonly Chore[], today: string): TodoSummary {
  let todo = 0
  let overdue = 0
  for (const chore of chores) {
    if (!isActive(chore)) continue
    const remaining = remainingDays(chore.lastDoneAt, chore.intervalDays, today)
    if (remaining <= 0) todo += 1
    if (remaining < 0) overdue += 1
  }
  return { todo, overdue }
}

/** 기기 로컬 시간대(PRD 8장, KST) 자정 기준의 오늘 날짜 "YYYY-MM-DD". */
export function todayLocal(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}
