/**
 * 기본 집안일 목록(선택 화면)의 규칙과 상수.
 *
 * 목록 데이터는 서버 GET /api/presets(api/presets.ts)에서 받는다. shared/presets.json(원본 문서 docs/chore_presets.md)은
 * 서버가 처음 설치할 때 채우는 기본값이고, 이후 목록은 앱에서 편집한다.
 */

/** 카테고리·항목 이름 길이 상한. 서버 server/app/schemas.py의 PRESET_NAME_MAX_LENGTH와 같은 값이다. */
export const PRESET_NAME_MAX_LENGTH = 50
/** 이모지·아이콘 길이 상한(코드 포인트). 서버 PRESET_EMOJI_MAX_LENGTH와 같은 값이다. */
export const PRESET_EMOJI_MAX_LENGTH = 16
/** 메모 길이 상한. 서버 PRESET_NOTE_MAX_LENGTH와 같은 값이다. */
export const PRESET_NOTE_MAX_LENGTH = 200

/** 비워 두면 서버가 쓰는 기본값. 입력 칸 안내(placeholder)에 보여 준다. */
export const DEFAULT_CATEGORY_EMOJI = '📁'
export const DEFAULT_ITEM_ICON = '🧹'

/** 펼쳐 둔 카테고리 id 목록을 기억하는 localStorage 키 */
export const PRESET_OPEN_STORAGE_KEY = 'aifred.presetOpen'

/** 이미 등록된 집안일과 같은 이름인지 비교할 때 쓰는 키. 서버 name_key와 같게 앞뒤 공백, 유니코드 정규화(NFC), 대소문자를 무시한다. */
export function presetNameKey(name: string): string {
  return name.trim().normalize('NFC').toLowerCase()
}

/** 문자열 길이를 코드 포인트로 센다. 이모지 하나가 UTF-16으로 2칸 이상이어서 서버(파이썬 len)와 맞춘다. */
export function codePointLength(value: string): number {
  return Array.from(value).length
}

/** 기억해 둔 펼친 카테고리. 저장소를 못 쓰거나 값이 이상하면 모두 접힌 상태(빈 목록)다. */
export function loadOpenCategories(): string[] {
  try {
    const raw = window.localStorage.getItem(PRESET_OPEN_STORAGE_KEY)
    if (!raw) return []
    const value: unknown = JSON.parse(raw)
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

/** 펼친 카테고리를 기억한다. 저장소를 못 쓰면(사생활 보호 모드 등) 조용히 넘어간다. */
export function saveOpenCategories(ids: Iterable<string>): void {
  try {
    window.localStorage.setItem(PRESET_OPEN_STORAGE_KEY, JSON.stringify([...ids]))
  } catch {
    // 기억하지 못해도 이번 화면에서는 펼친 상태가 유지된다.
  }
}
