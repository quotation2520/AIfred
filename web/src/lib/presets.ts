/**
 * 기본 집안일 목록. 원본은 docs/chore_presets.md이고, 데이터는 shared/presets.json에 있다.
 * 집안일을 추가할 때 이 목록에서 고르면 이름, 아이콘, 주기가 채워진 추가 폼이 열린다.
 */

import presetData from '../../../shared/presets.json'

export interface Preset {
  name: string
  icon: string
  intervalDays: number
  /** 문서의 비고. 화면에는 아직 쓰지 않는다. */
  note?: string
}

export interface PresetCategory {
  id: string
  name: string
  emoji: string
  /** 선택 분류(반려동물). 선택 화면에서 접힌 채로 맨 아래에 둔다. */
  optional: boolean
  items: Preset[]
}

export const PRESET_CATEGORIES: readonly PresetCategory[] = presetData.categories

/** 이미 등록된 집안일과 같은 이름인지 비교할 때 쓰는 키. 앞뒤 공백만 무시한다. */
export function presetNameKey(name: string): string {
  return name.trim()
}
