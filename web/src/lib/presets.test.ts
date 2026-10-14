import { describe, expect, it } from 'vitest'
import { MAX_INTERVAL_DAYS } from '../components/ChoreForm'
import { PRESET_CATEGORIES } from './presets'

const items = PRESET_CATEGORIES.flatMap((category) => category.items)

describe('shared/presets.json', () => {
  it('7개 분류, 40개 항목이다', () => {
    expect(PRESET_CATEGORIES).toHaveLength(7)
    expect(items).toHaveLength(40)
  })

  it('분류는 id, 이름, 이모지가 있고, 선택 분류는 반려동물 하나다', () => {
    for (const category of PRESET_CATEGORIES) {
      expect(category.id).toMatch(/^[a-z]+$/)
      expect(category.name.trim()).not.toBe('')
      expect(category.emoji.trim()).not.toBe('')
      expect(category.items.length).toBeGreaterThan(0)
    }
    expect(new Set(PRESET_CATEGORIES.map((c) => c.id)).size).toBe(PRESET_CATEGORIES.length)
    expect(PRESET_CATEGORIES.filter((c) => c.optional).map((c) => c.name)).toEqual(['반려동물'])
  })

  it('이름은 공백이 아니고 겹치지 않는다', () => {
    for (const item of items) {
      expect(item.name.trim()).not.toBe('')
      expect(item.name).toBe(item.name.trim())
    }
    expect(new Set(items.map((item) => item.name)).size).toBe(items.length)
  })

  it('아이콘은 비어 있지 않고 겹치지 않는다', () => {
    for (const item of items) expect(item.icon.trim()).not.toBe('')
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
