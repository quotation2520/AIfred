import { describe, expect, it } from 'vitest'
import { ADD_FORM_HASH, DASHBOARD_HASH, editHash, isSheetRoute, parseHash, PICK_HASH } from './routes'

describe('주소 해시', () => {
  it('화면마다 해시가 있다', () => {
    expect(parseHash('')).toEqual({ kind: 'dashboard' })
    expect(parseHash(DASHBOARD_HASH)).toEqual({ kind: 'dashboard' })
    expect(parseHash(PICK_HASH)).toEqual({ kind: 'pick' })
    expect(parseHash(ADD_FORM_HASH)).toEqual({ kind: 'add' })
    expect(parseHash('#/edit/abc-1')).toEqual({ kind: 'edit', id: 'abc-1' })
  })

  it('편집 id는 인코딩해서 넣고 풀어서 읽는다', () => {
    expect(editHash('a b/c')).toBe('#/edit/a%20b%2Fc')
    expect(parseHash(editHash('a b/c'))).toEqual({ kind: 'edit', id: 'a b/c' })
  })

  it('알 수 없거나 잘못된 주소는 대시보드다', () => {
    expect(parseHash('#/add/other')).toEqual({ kind: 'dashboard' })
    expect(parseHash('#/edit/')).toEqual({ kind: 'dashboard' })
    expect(parseHash('#/edit/a/b')).toEqual({ kind: 'dashboard' })
    expect(parseHash('#/edit/%E0%A4%A')).toEqual({ kind: 'dashboard' })
    expect(parseHash('#/history')).toEqual({ kind: 'dashboard' })
  })

  it('대시보드만 시트가 없다', () => {
    expect(isSheetRoute({ kind: 'dashboard' })).toBe(false)
    expect(isSheetRoute({ kind: 'pick' })).toBe(true)
    expect(isSheetRoute({ kind: 'edit', id: 'a' })).toBe(true)
  })
})
