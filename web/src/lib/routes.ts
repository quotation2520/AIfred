/**
 * 화면 주소(URL 해시). 라우터 라이브러리 없이 App이 이 값으로 시트를 연다.
 *
 * - `#/`             대시보드
 * - `#/add`          추가: 기본 목록 시트
 * - `#/add/form`     추가 폼(기본 목록 위). 새로고침하면 고른 항목은 남지 않아 빈 폼이 열린다.
 * - `#/edit/<id>`    편집 폼. 없는 id면 대시보드로 간다(App이 처리).
 *
 * 기본 목록의 편집 모드, 작은 입력 폼, 카드 "⋯" 메뉴는 주소를 바꾸지 않고 방문 기록에만 쌓인다(lib/historyStack.ts).
 */

import type { PresetItem } from '../api/presets'

export type Route =
  | { kind: 'dashboard' }
  | { kind: 'pick' }
  | { kind: 'add'; preset?: PresetItem }
  | { kind: 'edit'; id: string }

export const DASHBOARD_HASH = '#/'
export const PICK_HASH = '#/add'
export const ADD_FORM_HASH = '#/add/form'

const EDIT_PREFIX = '#/edit/'

export function editHash(id: string): string {
  return `${EDIT_PREFIX}${encodeURIComponent(id)}`
}

/** 알 수 없는 주소는 대시보드로 본다. */
export function parseHash(hash: string): Route {
  if (hash === PICK_HASH) return { kind: 'pick' }
  if (hash === ADD_FORM_HASH) return { kind: 'add' }
  if (hash.startsWith(EDIT_PREFIX)) {
    const raw = hash.slice(EDIT_PREFIX.length)
    if (raw && !raw.includes('/')) {
      try {
        return { kind: 'edit', id: decodeURIComponent(raw) }
      } catch {
        // 잘못된 % 인코딩
      }
    }
  }
  return { kind: 'dashboard' }
}

/** 시트가 열리는 화면이면 true */
export function isSheetRoute(route: Route): boolean {
  return route.kind !== 'dashboard'
}
