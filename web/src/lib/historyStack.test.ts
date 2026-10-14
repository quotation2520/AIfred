// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { depthOf, type HistoryLayer, HistoryStack } from './historyStack'

/** jsdom의 history.go는 setImmediate 두 번 뒤에 popstate를 낸다. 그 뒤의 기록 맞추기까지 기다린다. */
function settle() {
  return new Promise((resolve) => setTimeout(resolve, 20))
}

function layer(hash?: string, onBack: HistoryLayer['onBack'] = () => {}): HistoryLayer {
  return { hash, onBack: vi.fn(onBack) }
}

const depth = () => depthOf(window.history.state)

let stop: (() => void) | undefined

beforeEach(() => {
  window.history.replaceState(null, '', '/')
})

afterEach(async () => {
  stop?.()
  stop = undefined
  await settle()
})

function start(): HistoryStack {
  const stack = new HistoryStack(window, '#/')
  stop = stack.start()
  return stack
}

describe('HistoryStack', () => {
  it('시작하면 지금 기록을 바닥(깊이 0, #/)으로 맞춘다. 주소 밖의 경로와 쿼리는 그대로다', () => {
    window.history.replaceState(null, '', '/app?x=1#/edit/a')
    start()
    expect(depth()).toBe(0)
    expect(window.location.pathname + window.location.search + window.location.hash).toBe('/app?x=1#/')
  })

  it('층을 열면 기록을 쌓는다. 해시가 없는 층은 아래 층의 해시를 쓴다', async () => {
    const stack = start()
    stack.open(layer('#/add'))
    stack.open(layer())
    await settle()
    expect(depth()).toBe(2)
    expect(window.location.hash).toBe('#/add')
    expect(stack.depth).toBe(2)
  })

  it('화면에서 닫은 층은 기록에서 걷어 낸다. 한 번에 여러 층을 닫아도 history.go 한 번으로 돌아간다', async () => {
    const stack = start()
    const pick = layer('#/add')
    const form = layer('#/add/form')
    stack.open(pick)
    stack.open(form)
    await settle()
    expect(window.location.hash).toBe('#/add/form')

    const go = vi.spyOn(window.history, 'go')
    stack.close(form)
    stack.close(pick)
    await settle()
    expect(go).toHaveBeenCalledTimes(1)
    expect(go).toHaveBeenCalledWith(-2)
    expect(depth()).toBe(0)
    expect(window.location.hash).toBe('#/')
    // 걷어 낸 층의 onBack은 부르지 않는다.
    expect(pick.onBack).not.toHaveBeenCalled()
    expect(form.onBack).not.toHaveBeenCalled()
  })

  it('닫은 직후 새 층을 열면, 되돌아가기가 끝난 뒤에 쌓는다', async () => {
    const stack = start()
    const menu = layer()
    stack.open(menu)
    await settle()
    stack.close(menu)
    stack.open(layer('#/edit/a'))
    await settle()
    expect(depth()).toBe(1)
    expect(window.location.hash).toBe('#/edit/a')
  })

  it('뒤로 가기(popstate)는 맨 위 층의 onBack만 부른다', async () => {
    const stack = start()
    const bottom = layer('#/add')
    const top = layer()
    stack.open(bottom)
    stack.open(top)
    await settle()

    window.history.back()
    await settle()
    expect(top.onBack).toHaveBeenCalledTimes(1)
    expect(bottom.onBack).not.toHaveBeenCalled()
    expect(stack.depth).toBe(1)
    expect(depth()).toBe(1)
    // onBack을 부른 뒤 주인이 close를 불러도(이미 빠진 층) 아무 일도 없다.
    stack.close(top)
    await settle()
    expect(depth()).toBe(1)
  })

  it('onBack이 false를 돌려주면 층을 그대로 두고 기록을 다시 쌓는다', async () => {
    const stack = start()
    const form = layer('#/edit/a', () => false)
    stack.open(form)
    await settle()

    window.history.back()
    await settle()
    expect(form.onBack).toHaveBeenCalledTimes(1)
    expect(stack.depth).toBe(1)
    expect(depth()).toBe(1)
    expect(window.location.hash).toBe('#/edit/a')
  })

  it('back()(Esc)도 맨 위 층의 onBack을 부르고, 닫히면 기록을 걷어 낸다', async () => {
    const stack = start()
    const refusing = layer('#/edit/a', () => false)
    stack.open(refusing)
    await settle()
    stack.back()
    await settle()
    expect(stack.depth).toBe(1)
    expect(depth()).toBe(1)

    const closing = layer()
    stack.open(closing)
    await settle()
    stack.back()
    await settle()
    expect(closing.onBack).toHaveBeenCalledTimes(1)
    expect(stack.depth).toBe(1)
    expect(depth()).toBe(1)
  })

  it('앞으로 가기로 걷어 낸 기록에 들어가면 원래 자리로 돌아간다', async () => {
    const stack = start()
    const form = layer('#/add/form')
    stack.open(form)
    await settle()
    stack.close(form)
    await settle()
    expect(depth()).toBe(0)

    window.history.forward()
    await settle()
    expect(depth()).toBe(0)
    expect(window.location.hash).toBe('#/')
    expect(form.onBack).not.toHaveBeenCalled()
  })

  it('우리 것이 아닌 기록(state 없음)으로 가는 popstate는 무시한다', async () => {
    window.history.replaceState(null, '', '/outside')
    window.history.pushState(null, '', '/')
    const stack = start()
    const onBack = vi.fn()
    stack.open({ hash: '#/add', onBack })
    await settle()
    window.history.go(-2)
    await settle()
    expect(window.location.pathname).toBe('/outside')
    expect(onBack).not.toHaveBeenCalled()
  })

  it('지난번 층 위에서(새로고침) 시작하면 바닥까지 돌아간 뒤 지금 층을 다시 쌓는다', async () => {
    window.history.replaceState({ aifredDepth: 0 }, '', '/#/')
    window.history.pushState({ aifredDepth: 1 }, '', '/#/add')
    window.history.pushState({ aifredDepth: 2 }, '', '/#/add/form')
    const stack = start()
    const pick = layer('#/add')
    stack.open(pick)
    await settle()
    expect(depth()).toBe(1)
    expect(window.location.hash).toBe('#/add')
    // 예전 #/add/form 기록은 사라졌다(앞으로 가기로 갈 곳이 없다).
    window.history.forward()
    await settle()
    expect(depth()).toBe(1)

    window.history.back()
    await settle()
    expect(pick.onBack).toHaveBeenCalledTimes(1)
    expect(window.location.hash).toBe('#/')
  })

  it('depthOf는 우리 state의 깊이만 읽는다', () => {
    expect(depthOf({ aifredDepth: 2 })).toBe(2)
    expect(depthOf({ aifredDepth: -1 })).toBeNull()
    expect(depthOf({ aifredDepth: '1' })).toBeNull()
    expect(depthOf(null)).toBeNull()
    expect(depthOf({ other: 1 })).toBeNull()
  })
})
