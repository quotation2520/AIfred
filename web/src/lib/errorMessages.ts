/**
 * 사용자에게 보여 줄 오류 문구 (UX U5).
 * 첫 줄(title)은 짧게, 둘째 줄(hint)은 다음 행동을 한국어로 안내하고,
 * 상태 코드와 서버 원문은 작은 보조 글씨(detail)로 내린다.
 */

import { ApiError, formatDetail } from '../api/chores'

export interface ErrorText {
  title: string
  hint: string
  detail: string
}

const CONNECTION_HINT = 'PC 서버가 켜져 있는지, 집 Wi-Fi에 연결돼 있는지 확인한 뒤'
const MISSING_HINT = '이미 삭제된 집안일일 수 있어요. 취소를 눌러 목록을 다시 확인해 주세요.'

/** 기술 정보: "오류 코드 500 · Internal Server Error" 또는 네트워크 오류 원문. */
export function technicalDetail(error: unknown): string {
  if (error instanceof ApiError) return `오류 코드 ${error.status} · ${formatDetail(error.detail)}`
  if (error instanceof Error) return error.message
  return String(error)
}

function statusOf(error: unknown): number | null {
  return error instanceof ApiError ? error.status : null
}

export function loadErrorText(error: unknown): ErrorText {
  return {
    title: '목록을 불러오지 못했어요.',
    hint: `${CONNECTION_HINT} 다시 시도해 주세요.`,
    detail: technicalDetail(error),
  }
}

export function saveErrorText(error: unknown): ErrorText {
  const status = statusOf(error)
  let hint = `${CONNECTION_HINT} 다시 저장해 주세요.`
  if (status === 422) hint = '입력한 값을 서버가 받지 않았어요. 입력 칸을 확인해 주세요.'
  else if (status === 404) hint = MISSING_HINT
  return { title: '저장하지 못했어요.', hint, detail: technicalDetail(error) }
}

/** 완료 체크 실패. 카드는 원래 상태로 돌아간다. */
export function completeErrorText(error: unknown): ErrorText {
  const status = statusOf(error)
  let hint = `${CONNECTION_HINT} 다시 체크해 주세요.`
  if (status === 404) hint = '이미 삭제된 집안일일 수 있어요. 화면을 새로고침해 목록을 다시 확인해 주세요.'
  return { title: '완료 체크를 저장하지 못했어요.', hint, detail: technicalDetail(error) }
}

/** 실행 취소 실패. 완료 기록은 서버에 그대로 남아 있다. */
export function undoErrorText(error: unknown): ErrorText {
  const status = statusOf(error)
  let hint = `완료 기록은 그대로 남아 있어요. ${CONNECTION_HINT} 카드를 눌러 마지막 수행일을 고쳐 주세요.`
  if (status === 404) hint = '이미 취소됐거나 삭제된 기록이에요. 화면을 새로고침해 목록을 다시 확인해 주세요.'
  return { title: '실행 취소하지 못했어요.', hint, detail: technicalDetail(error) }
}

/** 게이지로 잔여일을 조절했는데 저장하지 못함. 카드는 원래 상태로 돌아간다. */
export function adjustErrorText(error: unknown): ErrorText {
  const status = statusOf(error)
  let hint = `${CONNECTION_HINT} 게이지를 다시 조절해 주세요.`
  if (status === 404) hint = '이미 삭제된 집안일일 수 있어요. 화면을 새로고침해 목록을 다시 확인해 주세요.'
  else if (status === 422) hint = '서버가 받지 않는 날짜예요. 카드를 눌러 마지막 수행일을 직접 고쳐 주세요.'
  return { title: '남은 일수를 저장하지 못했어요.', hint, detail: technicalDetail(error) }
}

/** 잔여일 조절의 실행 취소 실패. 조절한 날짜가 서버에 그대로 남아 있다. */
export function adjustUndoErrorText(error: unknown): ErrorText {
  const status = statusOf(error)
  let hint = `조절한 날짜가 그대로 남아 있어요. ${CONNECTION_HINT} 카드를 눌러 마지막 수행일을 고쳐 주세요.`
  if (status === 404) hint = '이미 삭제된 집안일일 수 있어요. 화면을 새로고침해 목록을 다시 확인해 주세요.'
  return { title: '실행 취소하지 못했어요.', hint, detail: technicalDetail(error) }
}

/** 기본 목록(선택 화면)을 불러오지 못함. "직접 입력"은 그대로 쓸 수 있다. */
export function presetLoadErrorText(error: unknown): ErrorText {
  return {
    title: '기본 목록을 불러오지 못했어요.',
    hint: `${CONNECTION_HINT} 다시 시도해 주세요. 목록 없이 "직접 입력"으로 추가할 수도 있어요.`,
    detail: technicalDetail(error),
  }
}

const PRESET_MISSING_HINT = '이미 삭제됐을 수 있어요. 화면을 닫았다가 다시 열어 목록을 확인해 주세요.'

/** 기본 목록의 카테고리·항목 추가, 수정 실패. 409는 같은 이름이 이미 있을 때다. */
export function presetSaveErrorText(error: unknown): ErrorText {
  const status = statusOf(error)
  let title = '저장하지 못했어요.'
  let hint = `${CONNECTION_HINT} 다시 저장해 주세요.`
  if (status === 409) {
    title = '이미 같은 이름이 있어요.'
    hint = '다른 이름으로 바꿔 주세요.'
  } else if (status === 422) {
    hint = '입력한 값을 서버가 받지 않았어요. 입력 칸을 확인해 주세요.'
  } else if (status === 404) {
    hint = PRESET_MISSING_HINT
  }
  return { title, hint, detail: technicalDetail(error) }
}

/** 기본 목록의 카테고리·항목 삭제 실패 */
export function presetDeleteErrorText(error: unknown): ErrorText {
  const hint = statusOf(error) === 404 ? PRESET_MISSING_HINT : `${CONNECTION_HINT} 다시 삭제해 주세요.`
  return { title: '삭제하지 못했어요.', hint, detail: technicalDetail(error) }
}

export function deleteErrorText(error: unknown): ErrorText {
  const hint = statusOf(error) === 404 ? MISSING_HINT : `${CONNECTION_HINT} 다시 삭제해 주세요.`
  return { title: '삭제하지 못했어요.', hint, detail: technicalDetail(error) }
}
