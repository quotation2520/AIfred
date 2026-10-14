/**
 * 뒤로 가기 = "지금 가장 위에 열린 것 하나를 닫는다" (UX U3, B3).
 *
 * 열린 층(시트, 기본 목록 편집 모드, 작은 입력 폼, 카드 메뉴)마다 브라우저 방문 기록을 하나씩 쌓는다.
 * 기록의 state에는 깊이(대시보드 = 0)만 적고, 주소 해시는 층마다 정한다(lib/routes.ts).
 *
 * - 화면에서 닫으면(취소, 저장, 바깥 탭) 그만큼 history.go(-n)으로 기록을 걷어 낸다. 그래서 저장한 폼은 기록에 남지 않는다.
 * - 뒤로 가기(popstate)를 누르면 맨 위 층의 onBack을 부른다. onBack이 false를 돌려주면(확인 창에서 취소)
 *   그 층을 그대로 두고 기록을 다시 쌓아 화면과 기록이 어긋나지 않게 한다.
 * - 앞으로 가기로 걷어 낸 기록에 들어가면 원래 자리로 되돌아간다.
 * - 열고 닫기가 한 번에 여러 번 일어나도 마이크로태스크에서 한 번에 맞춘다. history.go는 비동기라서
 *   그 결과(popstate)를 받을 때까지 다음 기록 조작을 미룬다.
 */

export interface HistoryLayer {
  /** 이 층의 주소 해시. 없으면 아래 층의 해시를 그대로 쓴다. */
  hash?: string
  /** 뒤로 가기(또는 Esc)로 이 층을 닫으려 할 때. false를 돌려주면 닫지 않는다. */
  onBack: () => boolean | void
}

/** 방문 기록 state에 넣는 키. 값은 깊이(대시보드 = 0)다. */
export const HISTORY_DEPTH_KEY = 'aifredDepth'

/** 새로고침 직후 이전 기록을 걷어 낼 때, popstate가 오지 않으면 이 시간 뒤에 포기하고 지금 자리를 바닥으로 삼는다. */
const START_TIMEOUT_MS = 1000

export function depthOf(state: unknown): number | null {
  if (state && typeof state === 'object' && HISTORY_DEPTH_KEY in state) {
    const depth = (state as Record<string, unknown>)[HISTORY_DEPTH_KEY]
    if (typeof depth === 'number' && Number.isInteger(depth) && depth >= 0) return depth
  }
  return null
}

function stateFor(depth: number) {
  return { [HISTORY_DEPTH_KEY]: depth }
}

export class HistoryStack {
  private readonly win: Window
  private readonly baseHash: string
  /** 지금 열린 층(아래부터) */
  private layers: HistoryLayer[] = []
  /** 방문 기록에 실제로 올라가 있는 층. entries[i]는 깊이 i + 1의 기록이다. */
  private entries: HistoryLayer[] = []
  /** 우리가 부른 history.go의 도착 깊이. 도착할 때까지 다른 기록 조작을 미룬다. */
  private waiting: number | null = null
  private syncScheduled = false
  private started = false
  private startTimer: ReturnType<typeof setTimeout> | undefined

  constructor(win: Window, baseHash: string) {
    this.win = win
    this.baseHash = baseHash
  }

  /**
   * popstate를 듣기 시작한다. 처음 한 번은 지금 기록을 바닥(깊이 0, 대시보드 해시)으로 맞춘다.
   * 새로고침해서 지난번 층의 기록 위에 있으면 바닥까지 돌아간 뒤 지금 층을 다시 쌓는다.
   * 정리 함수를 돌려준다(StrictMode에서 두 번 불려도 바닥 맞추기는 한 번만 한다).
   */
  start(): () => void {
    if (!this.started) {
      this.started = true
      const depth = depthOf(this.win.history.state)
      if (depth !== null && depth > 0) {
        this.waiting = 0
        this.win.history.go(-depth)
        this.startTimer = setTimeout(() => {
          if (this.waiting !== 0) return
          this.waiting = null
          this.win.history.replaceState(stateFor(0), '', this.baseHash)
          this.sync()
        }, START_TIMEOUT_MS)
      } else {
        this.win.history.replaceState(stateFor(0), '', this.baseHash)
      }
    }
    const onPop = (event: PopStateEvent) => this.handlePop(event.state)
    this.win.addEventListener('popstate', onPop)
    return () => this.win.removeEventListener('popstate', onPop)
  }

  /** 지금 열린 층 수 */
  get depth(): number {
    return this.layers.length
  }

  open(layer: HistoryLayer): void {
    this.layers.push(layer)
    this.scheduleSync()
  }

  /** 화면에서 닫았을 때. 이미 뒤로 가기로 닫힌 층이면 아무것도 하지 않는다. */
  close(layer: HistoryLayer): void {
    const index = this.layers.indexOf(layer)
    if (index < 0) return
    this.layers.splice(index, 1)
    this.scheduleSync()
  }

  /** 뒤로 가기와 같다(Esc 키). 맨 위 층의 onBack을 부른다. */
  back(): void {
    const top = this.layers.pop()
    if (!top) return
    if (top.onBack() === false) {
      this.layers.push(top)
      return
    }
    this.scheduleSync()
  }

  private hashAt(index: number): string {
    for (let i = index; i >= 0; i--) {
      const hash = this.layers[i]?.hash
      if (hash) return hash
    }
    return this.baseHash
  }

  private scheduleSync(): void {
    if (this.syncScheduled) return
    this.syncScheduled = true
    queueMicrotask(() => {
      this.syncScheduled = false
      this.sync()
    })
  }

  /** 방문 기록을 지금 층에 맞춘다: 달라진 곳까지 되돌아간 뒤 나머지를 쌓는다. */
  private sync(): void {
    if (this.waiting !== null) return
    let same = 0
    while (same < this.layers.length && same < this.entries.length && this.layers[same] === this.entries[same]) same++
    if (this.entries.length > same) {
      const delta = this.entries.length - same
      this.entries = this.entries.slice(0, same)
      this.waiting = same
      this.win.history.go(-delta)
      return
    }
    for (let i = same; i < this.layers.length; i++) {
      this.entries.push(this.layers[i])
      this.win.history.pushState(stateFor(i + 1), '', this.hashAt(i))
    }
  }

  private handlePop(state: unknown): void {
    const depth = depthOf(state)
    // 우리 것이 아닌 기록(주소창에 해시를 직접 친 경우 등)은 건드리지 않는다.
    if (depth === null) return
    if (this.waiting !== null) {
      const expected = this.waiting
      this.waiting = null
      clearTimeout(this.startTimer)
      if (depth === expected) {
        this.sync()
        return
      }
      // 기다리는 동안 사용자가 뒤로/앞으로 가기를 눌렀다. 도착한 깊이를 기준으로 이어 간다.
    }
    if (depth > this.entries.length) {
      // 앞으로 가기로 걷어 낸 기록에 들어왔다. 지금 자리로 되돌아간다.
      this.waiting = this.entries.length
      this.win.history.go(this.entries.length - depth)
      return
    }
    if (depth < this.entries.length) {
      this.entries = this.entries.slice(0, depth)
      while (this.layers.length > depth) {
        const top = this.layers.pop()
        if (!top) break
        if (top.onBack() === false) {
          this.layers.push(top)
          break
        }
      }
    }
    this.sync()
  }
}
