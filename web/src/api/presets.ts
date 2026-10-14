/**
 * 서버 기본 집안일 목록 API 클라이언트 (server/app/routers/presets.py).
 *
 * 처음 목록은 서버가 shared/presets.json으로 채우고(isBuiltin), 이후에는 사용자가 앱에서 편집한다.
 * 같은 카테고리 안에서 이름이 겹치거나 카테고리 이름이 겹치면 409, 입력이 맞지 않으면 422다.
 */

import { request, uuidV4 } from './chores'

/** 서버 PresetItemRead. 선택 화면의 한 줄. 고르면 이름, 아이콘, 주기가 채워진 추가 폼이 열린다. */
export interface PresetItem {
  id: string
  name: string
  icon: string
  intervalDays: number
  /** 비고. 선택 화면과 추가 폼에는 아직 쓰지 않는다. */
  note: string | null
  isBuiltin: boolean
}

/** 서버 PresetCategoryRead. items는 정렬 순서대로다. */
export interface PresetCategory {
  id: string
  name: string
  emoji: string
  isBuiltin: boolean
  items: PresetItem[]
}

export interface PresetCategoryCreateInput {
  id: string
  name: string
  /** 없으면 서버가 📁를 쓴다. */
  emoji?: string
}

export interface PresetCategoryUpdateInput {
  name?: string
  emoji?: string
}

export interface PresetItemCreateInput {
  id: string
  name: string
  /** 없으면 서버가 🧹를 쓴다. */
  icon?: string
  intervalDays: number
  note?: string | null
}

/** 보낸 필드만 바뀐다. note는 null로 지운다. */
export interface PresetItemUpdateInput {
  name?: string
  icon?: string
  intervalDays?: number
  note?: string | null
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

function body(value: unknown): RequestInit['body'] {
  return JSON.stringify(value)
}

export async function listPresets(): Promise<PresetCategory[]> {
  return json(await request('/api/presets'))
}

export async function createPresetCategory(input: PresetCategoryCreateInput): Promise<PresetCategory> {
  return json(await request('/api/preset-categories', { method: 'POST', body: body(input) }))
}

export async function updatePresetCategory(id: string, changes: PresetCategoryUpdateInput): Promise<PresetCategory> {
  return json(
    await request(`/api/preset-categories/${encodeURIComponent(id)}`, { method: 'PATCH', body: body(changes) }),
  )
}

/** 카테고리와 그 안의 항목을 함께 지운다. */
export async function deletePresetCategory(id: string): Promise<void> {
  await request(`/api/preset-categories/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function createPresetItem(categoryId: string, input: PresetItemCreateInput): Promise<PresetItem> {
  return json(
    await request(`/api/preset-categories/${encodeURIComponent(categoryId)}/items`, {
      method: 'POST',
      body: body(input),
    }),
  )
}

export async function updatePresetItem(id: string, changes: PresetItemUpdateInput): Promise<PresetItem> {
  return json(await request(`/api/preset-items/${encodeURIComponent(id)}`, { method: 'PATCH', body: body(changes) }))
}

export async function deletePresetItem(id: string): Promise<void> {
  await request(`/api/preset-items/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** 새 카테고리·항목 id. 집안일처럼 클라이언트에서 만든다(HTTP 접속이라 uuidV4). */
export function newPresetId(): string {
  return uuidV4()
}
