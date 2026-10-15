import { useEffect } from 'react'

/**
 * 새 버전 반영 (서비스 워커 업데이트).
 *
 * 다시 빌드하면 서비스 워커가 새 버전을 받아 두고 기다린다(registerType: 'prompt').
 * 새 버전이 준비되면 "안전한 순간"에 저절로 새로고침한다. 알림을 띄우지 않는 이유:
 * 혼자 쓰는 앱이고, 대시보드는 서버 데이터로 다시 그려지므로 새로고침해도 잃는 것이 없다.
 * 다만 사용자가 무언가 하고 있을 때 화면이 바뀌면 안 되므로 아래가 모두 맞을 때만 한다.
 *
 * - 보류(hold)가 하나도 없다: 시트·메뉴 같은 층(useBackLayer), 실행 취소 알림, 게이지 조절,
 *   진행 중인 /api 요청이 각각 보류를 건다.
 * - 화면이 보이는 중이면 마지막 입력(누르기, 키, 스크롤) 뒤 UPDATE_IDLE_MS가 지났다.
 *   앱이 뒤로 가 있으면(hidden) 이 조건은 보지 않는다. 다음에 열 때 이미 새 화면이다.
 *
 * 연결(registerSW)은 registerAppUpdate.ts가 한다. 이 파일은 테스트할 수 있게 그 밖의 규칙만 갖는다.
 */

/** 화면이 보일 때, 마지막 입력 뒤 이만큼 조용해야 새로고침한다. */
export const UPDATE_IDLE_MS = 3000
/** 새 버전이 준비된 뒤 안전한 순간인지 다시 보는 간격 */
export const UPDATE_RECHECK_MS = 1000
/** 앱이 다시 보일 때 서버에 새 버전을 확인하는 최소 간격 */
export const UPDATE_CHECK_MIN_INTERVAL_MS = 60_000

let holds = 0

/** 새로고침을 막는다. 돌려준 함수를 부르면 풀린다(여러 번 불러도 한 번만 풀린다). */
export function holdUpdate(): () => void {
  holds += 1
  let released = false
  return () => {
    if (released) return
    released = true
    holds -= 1
  }
}

/** 보류가 하나라도 걸려 있으면 true */
export function isUpdateHeld(): boolean {
  return holds > 0
}

/** active인 동안 새로고침을 막는다. */
export function useUpdateHold(active: boolean): void {
  useEffect(() => {
    if (!active) return
    return holdUpdate()
  }, [active])
}

const INPUT_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const

export interface UpdateSchedulerOptions {
  /** 새 버전을 반영한다(서비스 워커 교체 후 새로고침). 한 번만 불린다. */
  apply: () => void
  win?: Window
  doc?: Document
  now?: () => number
}

/** 새 버전이 준비되면(markReady) 안전한 순간을 기다렸다가 apply를 한 번 부른다. */
export class UpdateScheduler {
  private readonly apply: () => void
  private readonly win: Window
  private readonly doc: Document
  private readonly now: () => number
  private ready = false
  private applied = false
  private lastInputAt = Number.NEGATIVE_INFINITY
  private timer: ReturnType<typeof setInterval> | undefined

  constructor({ apply, win = window, doc = document, now = Date.now }: UpdateSchedulerOptions) {
    this.apply = apply
    this.win = win
    this.doc = doc
    this.now = now
    for (const type of INPUT_EVENTS) this.win.addEventListener(type, this.handleInput, { capture: true, passive: true })
    this.doc.addEventListener('visibilitychange', this.tryApply)
  }

  /** 새 버전이 준비됐다. 지금 안전하면 바로, 아니면 안전해질 때 반영한다. */
  markReady(): void {
    if (this.ready || this.applied) return
    this.ready = true
    if (this.tryApply()) return
    this.timer = setInterval(this.tryApply, UPDATE_RECHECK_MS)
  }

  /** 지금 새로고침해도 되는지 */
  isSafe(): boolean {
    if (isUpdateHeld()) return false
    if (this.doc.visibilityState === 'hidden') return true
    return this.now() - this.lastInputAt >= UPDATE_IDLE_MS
  }

  dispose(): void {
    clearInterval(this.timer)
    this.timer = undefined
    for (const type of INPUT_EVENTS) this.win.removeEventListener(type, this.handleInput, { capture: true })
    this.doc.removeEventListener('visibilitychange', this.tryApply)
  }

  private readonly handleInput = () => {
    this.lastInputAt = this.now()
  }

  private readonly tryApply = (): boolean => {
    if (!this.ready || this.applied || !this.isSafe()) return false
    this.applied = true
    this.dispose()
    this.apply()
    return true
  }
}

/**
 * 앱이 다시 보일 때 서버에 새 버전이 있는지 확인한다(registration.update()).
 * 설치한 앱은 며칠씩 뒤에 두었다 다시 꺼내 쓰므로, 페이지를 새로 열 때만 하는 브라우저의 확인으로는 늦다.
 * 확인은 UPDATE_CHECK_MIN_INTERVAL_MS에 한 번까지만 한다. 실패(서버 꺼짐, 집 밖)는 조용히 넘긴다.
 * 돌려준 함수를 부르면 멈춘다.
 */
export function watchForUpdates(
  registration: Pick<ServiceWorkerRegistration, 'update'>,
  { doc = document, now = Date.now }: { doc?: Document; now?: () => number } = {},
): () => void {
  let checkedAt = now()
  const check = () => {
    if (doc.visibilityState !== 'visible') return
    if (now() - checkedAt < UPDATE_CHECK_MIN_INTERVAL_MS) return
    checkedAt = now()
    registration.update().catch(() => {})
  }
  doc.addEventListener('visibilitychange', check)
  return () => doc.removeEventListener('visibilitychange', check)
}
