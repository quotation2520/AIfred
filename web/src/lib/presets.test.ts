// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
// 서버가 처음 설치할 때 채우는 기본값. 앱은 이 파일을 직접 읽지 않고 GET /api/presets를 쓴다. 여기서는 데이터만 검증한다.
import presetData from '../../../shared/presets.json'
import { MAX_INTERVAL_DAYS } from '../components/ChoreForm'
import {
  codePointLength,
  loadOpenCategories,
  PRESET_EMOJI_MAX_LENGTH,
  PRESET_NAME_MAX_LENGTH,
  PRESET_OPEN_STORAGE_KEY,
  presetNameKey,
  saveOpenCategories,
} from './presets'

interface SeedItem {
  name: string
  icon: string
  intervalDays: number
  note?: string
}

const categories: { id: string; name: string; emoji: string; items: SeedItem[] }[] = presetData.categories
const items = categories.flatMap((category) => category.items)

describe('shared/presets.json (처음 설치할 때 채우는 기본값)', () => {
  it('7개 분류, 40개 항목이다', () => {
    expect(categories).toHaveLength(7)
    expect(items).toHaveLength(40)
  })

  it('분류는 id, 이름, 이모지가 있고, 선택 분류 표시(optional)는 더 쓰지 않는다', () => {
    for (const category of categories) {
      expect(category.id).toMatch(/^[a-z]+$/)
      expect(category.name.trim()).not.toBe('')
      expect(codePointLength(category.name)).toBeLessThanOrEqual(PRESET_NAME_MAX_LENGTH)
      expect(category.emoji.trim()).not.toBe('')
      expect(category.items.length).toBeGreaterThan(0)
      expect('optional' in category).toBe(false)
    }
    expect(new Set(categories.map((c) => c.id)).size).toBe(categories.length)
  })

  it('이름은 공백이 아니고 겹치지 않는다', () => {
    for (const item of items) {
      expect(item.name.trim()).not.toBe('')
      expect(item.name).toBe(item.name.trim())
      expect(codePointLength(item.name)).toBeLessThanOrEqual(PRESET_NAME_MAX_LENGTH)
    }
    expect(new Set(items.map((item) => item.name)).size).toBe(items.length)
  })

  it('아이콘은 비어 있지 않고 겹치지 않는다', () => {
    for (const item of items) {
      expect(item.icon.trim()).not.toBe('')
      expect(codePointLength(item.icon)).toBeLessThanOrEqual(PRESET_EMOJI_MAX_LENGTH)
    }
    expect(new Set(items.map((item) => item.icon)).size).toBe(items.length)
  })

  it('주기는 1~36500일의 정수다', () => {
    expect(MAX_INTERVAL_DAYS).toBe(36500)
    for (const item of items) {
      expect(Number.isInteger(item.intervalDays)).toBe(true)
      expect(item.intervalDays).toBeGreaterThanOrEqual(1)
      expect(item.intervalDays).toBeLessThanOrEqual(MAX_INTERVAL_DAYS)
    }
  })

  it('비고는 있으면 공백이 아니다', () => {
    for (const item of items) {
      if (item.note !== undefined) expect(item.note.trim()).not.toBe('')
    }
    expect(items.find((item) => item.name === '음식물 쓰레기 버리기')?.note).toBe('여름에는 매일 권장')
  })
})

describe('presetNameKey / codePointLength', () => {
  it('앞뒤 공백만 무시한다', () => {
    expect(presetNameKey('  설거지 ')).toBe('설거지')
  })

  it('이모지는 코드 포인트로 센다', () => {
    expect(codePointLength('🧹')).toBe(1)
    expect('🧹'.length).toBe(2)
  })
})

describe('펼친 카테고리 기억', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('저장한 id 목록을 다시 읽는다', () => {
    saveOpenCategories(new Set(['a', 'b']))
    expect(localStorage.getItem(PRESET_OPEN_STORAGE_KEY)).toBe('["a","b"]')
    expect(loadOpenCategories()).toEqual(['a', 'b'])
  })

  it('값이 없거나 깨졌으면 모두 접힌 상태다', () => {
    expect(loadOpenCategories()).toEqual([])
    localStorage.setItem(PRESET_OPEN_STORAGE_KEY, '{oops')
    expect(loadOpenCategories()).toEqual([])
    localStorage.setItem(PRESET_OPEN_STORAGE_KEY, '{"a":1}')
    expect(loadOpenCategories()).toEqual([])
    localStorage.setItem(PRESET_OPEN_STORAGE_KEY, '["a",1,null]')
    expect(loadOpenCategories()).toEqual(['a'])
  })

  it('저장소를 쓸 수 없으면 오류 없이 접힌 상태다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(loadOpenCategories()).toEqual([])
    expect(() => saveOpenCategories(['a'])).not.toThrow()
  })
})
