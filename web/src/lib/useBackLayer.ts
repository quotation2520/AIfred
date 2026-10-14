import { createContext, useContext, useEffect, useLayoutEffect, useRef } from 'react'
import type { HistoryLayer, HistoryStack } from './historyStack'

/** App이 만든 방문 기록 관리자. 없으면(컴포넌트만 따로 그린 테스트) 층을 쌓지 않는다. */
export const HistoryStackContext = createContext<HistoryStack | null>(null)

export function useHistoryStack(): HistoryStack | null {
  return useContext(HistoryStackContext)
}

interface BackLayerOptions {
  /** 이 층의 주소 해시. 없으면 아래 층의 해시를 그대로 쓴다. */
  hash?: string
  /** 컨텍스트 대신 쓸 관리자(컨텍스트를 제공하는 App 자신이 쓴다) */
  stack?: HistoryStack | null
}

/**
 * open인 동안 방문 기록에 층 하나를 쌓는다. 뒤로 가기를 누르면 onBack이 불린다.
 * onBack은 닫는 상태 변경을 하고, 닫지 않으려면(확인 창에서 취소) false를 돌려준다.
 * 화면에서 닫혀 open이 false가 되면 기록에서 이 층을 걷어 낸다.
 */
export function useBackLayer(open: boolean, onBack: () => boolean | void, options: BackLayerOptions = {}): void {
  const contextStack = useContext(HistoryStackContext)
  const stack = options.stack === undefined ? contextStack : options.stack
  const onBackRef = useRef(onBack)
  useLayoutEffect(() => {
    onBackRef.current = onBack
  })
  const { hash } = options

  useEffect(() => {
    if (!open || !stack) return
    const layer: HistoryLayer = { hash, onBack: () => onBackRef.current() }
    stack.open(layer)
    return () => stack.close(layer)
  }, [open, stack, hash])
}
