import { describe, expect, it } from 'vitest'
import { flipOffset, translateOf } from './useFlip'

describe('위치 이동 계산', () => {
  it('computed transform에서 이동량을 읽는다', () => {
    expect(translateOf('none')).toEqual({ x: 0, y: 0 })
    expect(translateOf('')).toEqual({ x: 0, y: 0 })
    expect(translateOf('matrix(1, 0, 0, 1, 12.5, -40)')).toEqual({ x: 12.5, y: -40 })
  })

  it('이전 자리에서 새 자리로 가는 역방향 이동량을 구한다', () => {
    expect(flipOffset({ x: 0, y: 300, width: 320 }, { x: 0, y: 100, width: 320 })).toEqual({ dx: 0, dy: 200 })
    expect(flipOffset({ x: 0, y: 100, width: 320 }, { x: 0, y: 500, width: 320 })).toEqual({ dx: 0, dy: -400 })
  })

  it('1px 미만으로 움직였거나 폭이 바뀌었으면(화면 회전) 움직이지 않는다', () => {
    expect(flipOffset({ x: 0, y: 100.4, width: 320 }, { x: 0, y: 100, width: 320 })).toBeNull()
    expect(flipOffset({ x: 0, y: 100, width: 320 }, { x: 0, y: 400, width: 600 })).toBeNull()
  })
})
