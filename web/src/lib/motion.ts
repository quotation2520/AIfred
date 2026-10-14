/**
 * 화면 움직임의 공통 값. CSS(index.css)의 전환 시간도 같은 값을 쓴다.
 * 움직임은 transform과 opacity만 바꿔서 폰에서도 레이아웃 계산 없이 부드럽게 돌게 한다.
 */

/** 카드가 순서를 바꾸거나 영역을 옮길 때 위치 이동 시간(ms) */
export const MOVE_MS = 250
/** 카드가 나타날 때 시간(ms) */
export const ENTER_MS = 200
/** 실행 취소 알림이 사라질 때 시간(ms). index.css의 toast-out과 같다. */
export const TOAST_EXIT_MS = 200

/** 시트(추가·편집, 카드 메뉴)가 올라올 때 시간(ms). index.css의 --motion-sheet와 같다. */
export const SHEET_ENTER_MS = 250
/** 시트가 내려가며 닫힐 때 시간(ms) */
export const SHEET_EXIT_MS = 200

/** 사용자가 기기 설정에서 움직임 줄이기를 켰으면 true */
export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** 스크립트로 닫히는 움직임을 보여 줄 수 있으면 true. 움직임 줄이기 설정이나 animate가 없는 환경(jsdom)에서는 false다. */
export function canAnimateExit(): boolean {
  return !prefersReducedMotion() && typeof HTMLElement !== 'undefined' && typeof HTMLElement.prototype.animate === 'function'
}
