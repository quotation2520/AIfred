import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createPresetCategory,
  createPresetItem,
  deletePresetCategory,
  deletePresetItem,
  listPresets,
  newPresetId,
  type PresetCategory,
  type PresetItem,
  type PresetItemUpdateInput,
  updatePresetCategory,
  updatePresetItem,
} from '../api/presets'
import { type ErrorText, presetDeleteErrorText, presetLoadErrorText } from '../lib/errorMessages'
import { formatInterval } from '../lib/formatDate'
import { ENTER_MS, prefersReducedMotion } from '../lib/motion'
import { loadOpenCategories, presetNameKey, saveOpenCategories } from '../lib/presets'
import { useBackLayer } from '../lib/useBackLayer'
import BreakableText from './BreakableText'
import { DISCARD_CONFIRM_TEXT } from './ChoreForm'
import ErrorNotice from './ErrorNotice'
import { type PresetCategoryValues, PresetCategoryEditor, type PresetItemValues, PresetItemEditor } from './PresetEditors'
import { SheetHeader } from './Sheet'

interface PresetPickerProps {
  /** 이미 등록된(삭제되지 않은) 집안일 이름. 같은 이름의 항목은 "추가됨"으로 흐리게 보이고 누를 수 없다. */
  takenNames: readonly string[]
  /** 항목을 골랐을 때. 이 값이 채워진 추가 폼을 연다. */
  onPick: (preset: PresetItem) => void
  /** "직접 입력": 빈 추가 폼을 연다. */
  onCustom: () => void
  /** 머리줄 닫기(✕): 시트를 닫고 대시보드로 돌아간다. 작성 중인 입력 확인은 받는 쪽이 한다. */
  onClose: () => void
  /** 작은 입력 폼에 입력한 내용이 있는지 알려 준다(시트 닫기 확인용). */
  onDirtyChange?: (dirty: boolean) => void
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; error: ErrorText }
  | { kind: 'ready'; categories: PresetCategory[] }

/** 지금 열려 있는 입력 폼. 한 번에 하나만 연다. */
type Editor =
  | { kind: 'add-category' }
  | { kind: 'edit-category'; categoryId: string }
  | { kind: 'add-item'; categoryId: string }
  | { kind: 'edit-item'; itemId: string }
  | null

/** 빈 문자열은 값 없음으로 본다. */
function trimmedOrNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function itemValues(item: PresetItem): PresetItemValues {
  return { name: item.name, icon: item.icon, intervalDays: String(item.intervalDays), note: item.note ?? '' }
}

/**
 * 집안일 추가의 첫 화면: 기본 목록(서버 GET /api/presets)에서 고르거나 직접 입력한다.
 *
 * 카테고리는 아코디언이다. 처음에는 모두 접혀 있고, 머리줄을 누르면 항목이 한 줄에 하나씩 펼쳐진다.
 * 여러 개를 함께 펼칠 수 있고, 펼친 카테고리는 기기에 기억한다.
 * 펼친 카테고리 맨 아래 "+ 항목 추가", 목록 맨 아래 "+ 카테고리 추가"로 목록을 늘린다.
 * "편집"을 켜면 카테고리와 항목(기본 항목 포함)마다 수정·삭제가 나오고, 항목을 눌러도 추가 폼으로 가지 않는다.
 *
 * 추가·수정·삭제는 서버 응답을 받은 뒤 화면에 반영한다(이름이 겹치면 409로 거절될 수 있어서).
 *
 * 시트 안의 내용이다(머리줄과 스크롤되는 본문). 편집 모드와 작은 입력 폼은 방문 기록에 한 층씩 쌓여서
 * 뒤로 가기를 누르면 입력 폼 → 편집 모드 순서로 하나씩 닫힌다 (UX U3). 입력한 내용이 있으면 버릴지 묻는다.
 */
function PresetPicker({ takenNames, onPick, onCustom, onClose, onDirtyChange }: PresetPickerProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(() => new Set(loadOpenCategories()))
  // 접히는 애니메이션이 끝날 때까지 내용을 남겨 둘 카테고리
  const [closingIds, setClosingIds] = useState<ReadonlySet<string>>(() => new Set())
  const bodies = useRef(new Map<string, HTMLElement>())
  const closeAnimations = useRef(new Map<string, Animation>())
  const [editMode, setEditMode] = useState(false)
  const [editor, setEditor] = useState<Editor>(null)
  const [actionError, setActionError] = useState<ErrorText | null>(null)
  // 열린 작은 입력 폼에 입력한 내용이 있는지
  const [editorDirty, setEditorDirty] = useState(false)
  const taken = new Set(takenNames.map(presetNameKey))

  useEffect(() => {
    onDirtyChange?.(editor !== null && editorDirty)
  }, [editor, editorDirty, onDirtyChange])

  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  // 뒤로 가기: 작은 입력 폼이 먼저, 그다음 편집 모드가 닫힌다(선언 순서 = 쌓이는 순서).
  useBackLayer(editMode, () => {
    setEditMode(false)
    setEditor(null)
    setActionError(null)
  })
  useBackLayer(editor !== null, () => {
    if (editorDirty && !window.confirm(DISCARD_CONFIRM_TEXT)) return false
    setEditor(null)
  })

  useEffect(() => {
    let cancelled = false
    listPresets().then(
      (categories) => {
        if (!cancelled) setState({ kind: 'ready', categories })
      },
      (error: unknown) => {
        if (!cancelled) setState({ kind: 'error', error: presetLoadErrorText(error) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [attempt])

  const retry = () => {
    setState({ kind: 'loading' })
    setAttempt((n) => n + 1)
  }

  const updateCategories = useCallback((change: (categories: PresetCategory[]) => PresetCategory[]) => {
    setState((current) => (current.kind === 'ready' ? { ...current, categories: change(current.categories) } : current))
  }, [])

  const setOpen = (id: string, open: boolean) => {
    setOpenIds((current) => {
      const next = new Set(current)
      if (open) next.add(id)
      else next.delete(id)
      saveOpenCategories(next)
      return next
    })
  }

  const setClosing = (id: string, closing: boolean) => {
    setClosingIds((current) => {
      const next = new Set(current)
      if (closing) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const toggleCategory = (id: string) => {
    if (!openIds.has(id)) {
      // 접히는 중에 다시 펼치면 사라지던 내용을 그대로 되돌린다.
      closeAnimations.current.get(id)?.cancel()
      setClosing(id, false)
      setOpen(id, true)
      return
    }
    setOpen(id, false)
    // 접을 때는 내용이 살짝 위로 사라진 뒤 빠진다. 움직임 줄이기 설정이나 animate가 없는 환경에서는 바로 빠진다.
    const body = bodies.current.get(id)
    if (!body || prefersReducedMotion() || typeof body.animate !== 'function') return
    setClosing(id, true)
    const animation = body.animate(
      [
        { opacity: 1, transform: 'none' },
        { opacity: 0, transform: 'translateY(-6px)' },
      ],
      { duration: ENTER_MS, easing: 'ease-in', fill: 'forwards' },
    )
    closeAnimations.current.set(id, animation)
    const done = () => {
      if (closeAnimations.current.get(id) === animation) closeAnimations.current.delete(id)
      setClosing(id, false)
    }
    animation.addEventListener('finish', done)
    animation.addEventListener('cancel', done)
  }

  const bodyRef = (id: string) => (el: HTMLElement | null) => {
    if (el) bodies.current.set(id, el)
    else bodies.current.delete(id)
  }

  const toggleEditMode = () => {
    setEditMode((on) => !on)
    setEditor(null)
    setActionError(null)
  }

  const openEditor = (next: Editor) => {
    setActionError(null)
    setEditor(next)
  }

  // --- 저장 (실패하면 오류를 던져 폼이 보여 준다) ---

  const saveNewCategory = async (values: PresetCategoryValues) => {
    const emoji = trimmedOrNull(values.emoji)
    const created = await createPresetCategory({
      id: newPresetId(),
      name: values.name.trim(),
      ...(emoji !== null && { emoji }),
    })
    updateCategories((categories) => [...categories, created])
    // 새 카테고리는 바로 항목을 넣을 수 있게 펼쳐 둔다.
    setOpen(created.id, true)
    setEditor(null)
  }

  const saveCategory = async (category: PresetCategory, values: PresetCategoryValues) => {
    const changes: { name?: string; emoji?: string } = {}
    const name = values.name.trim()
    const emoji = trimmedOrNull(values.emoji)
    if (name !== category.name) changes.name = name
    if (emoji !== null && emoji !== category.emoji) changes.emoji = emoji
    if (Object.keys(changes).length > 0) {
      const saved = await updatePresetCategory(category.id, changes)
      updateCategories((categories) =>
        categories.map((c) => (c.id === saved.id ? { ...c, name: saved.name, emoji: saved.emoji } : c)),
      )
    }
    setEditor(null)
  }

  const saveNewItem = async (category: PresetCategory, values: PresetItemValues) => {
    const icon = trimmedOrNull(values.icon)
    const note = trimmedOrNull(values.note)
    const created = await createPresetItem(category.id, {
      id: newPresetId(),
      name: values.name.trim(),
      intervalDays: Number(values.intervalDays.trim()),
      ...(icon !== null && { icon }),
      ...(note !== null && { note }),
    })
    updateCategories((categories) =>
      categories.map((c) => (c.id === category.id ? { ...c, items: [...c.items, created] } : c)),
    )
    setEditor(null)
  }

  const saveItem = async (item: PresetItem, values: PresetItemValues) => {
    const changes: PresetItemUpdateInput = {}
    const name = values.name.trim()
    const icon = trimmedOrNull(values.icon)
    const intervalDays = Number(values.intervalDays.trim())
    const note = trimmedOrNull(values.note)
    if (name !== item.name) changes.name = name
    // 아이콘은 지울 수 없다. 비워 두면 원래 아이콘을 그대로 둔다.
    if (icon !== null && icon !== item.icon) changes.icon = icon
    if (intervalDays !== item.intervalDays) changes.intervalDays = intervalDays
    if (note !== (item.note ?? null)) changes.note = note
    if (Object.keys(changes).length > 0) {
      const saved = await updatePresetItem(item.id, changes)
      updateCategories((categories) =>
        categories.map((c) => ({ ...c, items: c.items.map((i) => (i.id === saved.id ? saved : i)) })),
      )
    }
    setEditor(null)
  }

  // --- 삭제 ---

  const removeCategory = async (category: PresetCategory) => {
    const count = category.items.length
    const message =
      count > 0
        ? `'${category.name}' 카테고리 삭제할까요?\n안의 항목 ${count}개도 함께 삭제됩니다.`
        : `'${category.name}' 카테고리 삭제할까요?`
    if (!window.confirm(message)) return
    setActionError(null)
    try {
      await deletePresetCategory(category.id)
      updateCategories((categories) => categories.filter((c) => c.id !== category.id))
      setOpen(category.id, false)
    } catch (error) {
      setActionError(presetDeleteErrorText(error))
    }
  }

  const removeItem = async (item: PresetItem) => {
    if (!window.confirm(`'${item.name}' 항목 삭제할까요?`)) return
    setActionError(null)
    try {
      await deletePresetItem(item.id)
      updateCategories((categories) =>
        categories.map((c) => ({ ...c, items: c.items.filter((i) => i.id !== item.id) })),
      )
    } catch (error) {
      setActionError(presetDeleteErrorText(error))
    }
  }

  // --- 그리기 ---

  const renderItem = (item: PresetItem) => {
    if (editor?.kind === 'edit-item' && editor.itemId === item.id) {
      return (
        <li key={item.id}>
          <PresetItemEditor
            label="항목 수정"
            initial={itemValues(item)}
            onSave={(values) => saveItem(item, values)}
            onCancel={() => setEditor(null)}
            onDirtyChange={setEditorDirty}
          />
        </li>
      )
    }
    const added = taken.has(presetNameKey(item.name))
    if (editMode) {
      // 편집 모드 (UX U5): 이름이 한 줄을 다 쓰고 단어 단위로 두 줄까지 보인다. 주기와 "추가됨"은 이름 아래 둘째 줄이다.
      // 수정·삭제는 각각 44px 이상이고, 삭제는 테두리 모양과 휴지통 표시가 달라 수정과 구별된다.
      return (
        <li key={item.id} className="preset-row preset-row--editing">
          <span className="preset-row__icon" aria-hidden="true">
            {item.icon}
          </span>
          <span className="preset-row__text">
            <span className="preset-row__name">
              <BreakableText text={item.name} />
            </span>
            <span className="preset-row__meta">
              <span className="preset-row__interval">{formatInterval(item.intervalDays)}</span>
              {added && <span className="preset-row__added">추가됨</span>}
            </span>
          </span>
          <span className="preset-row__actions">
            <button
              type="button"
              className="preset-action"
              aria-label={`${item.name} 수정`}
              onClick={() => openEditor({ kind: 'edit-item', itemId: item.id })}
            >
              수정
            </button>
            <button
              type="button"
              className="preset-action preset-action--danger"
              aria-label={`${item.name} 삭제`}
              onClick={() => void removeItem(item)}
            >
              <span aria-hidden="true">🗑</span> 삭제
            </button>
          </span>
        </li>
      )
    }
    const content = (
      <>
        <span className="preset-row__icon" aria-hidden="true">
          {item.icon}
        </span>{' '}
        <span className="preset-row__name">{item.name}</span>{' '}
        <span className="preset-row__interval">{formatInterval(item.intervalDays)}</span>
        {added && (
          <>
            {' '}
            <span className="preset-row__added">추가됨</span>
          </>
        )}
      </>
    )
    return (
      <li key={item.id}>
        <button
          type="button"
          className={`preset-row preset-row--pick${added ? ' preset-row--added' : ''}`}
          disabled={added}
          onClick={() => onPick(item)}
        >
          {content}
        </button>
      </li>
    )
  }

  const renderCategory = (category: PresetCategory) => {
    const open = openIds.has(category.id)
    const visible = open || closingIds.has(category.id)
    const toggleId = `preset-${category.id}-toggle`
    const bodyId = `preset-${category.id}-items`

    const header =
      editor?.kind === 'edit-category' && editor.categoryId === category.id ? (
        <PresetCategoryEditor
          label="카테고리 수정"
          initial={{ name: category.name, emoji: category.emoji }}
          onSave={(values) => saveCategory(category, values)}
          onCancel={() => setEditor(null)}
          onDirtyChange={setEditorDirty}
        />
      ) : (
        <div className="preset-category__header">
          <button
            type="button"
            id={toggleId}
            className="preset-category__toggle"
            aria-expanded={open}
            aria-controls={visible ? bodyId : undefined}
            onClick={() => toggleCategory(category.id)}
          >
            <span className="preset-category__emoji" aria-hidden="true">
              {category.emoji}
            </span>{' '}
            <span className="preset-category__name">{category.name}</span>{' '}
            <span className="preset-category__count">{category.items.length}</span>
            <span className="preset-category__chevron" aria-hidden="true">
              ›
            </span>
          </button>
          {editMode && (
            <span className="preset-row__actions">
              <button
                type="button"
                className="preset-action"
                aria-label={`${category.name} 카테고리 수정`}
                onClick={() => openEditor({ kind: 'edit-category', categoryId: category.id })}
              >
                수정
              </button>
              <button
                type="button"
                className="preset-action preset-action--danger"
                aria-label={`${category.name} 카테고리 삭제`}
                onClick={() => void removeCategory(category)}
              >
                <span aria-hidden="true">🗑</span> 삭제
              </button>
            </span>
          )}
        </div>
      )

    return (
      <li key={category.id} className={`preset-category${open ? ' preset-category--open' : ''}`}>
        {header}
        {visible && (
          <div
            id={bodyId}
            ref={bodyRef(category.id)}
            role="region"
            aria-label={category.name}
            className="preset-category__body"
          >
            <ul className="preset-rows">
              {category.items.map(renderItem)}
              <li>
                {editor?.kind === 'add-item' && editor.categoryId === category.id ? (
                  <PresetItemEditor
                    label="항목 추가"
                    onSave={(values) => saveNewItem(category, values)}
                    onCancel={() => setEditor(null)}
                    onDirtyChange={setEditorDirty}
                  />
                ) : (
                  <button
                    type="button"
                    className="preset-row preset-row--add"
                    onClick={() => openEditor({ kind: 'add-item', categoryId: category.id })}
                  >
                    + 항목 추가
                  </button>
                )}
              </li>
            </ul>
          </div>
        )}
      </li>
    )
  }

  return (
    <>
      <SheetHeader
        title="어떤 집안일을 추가할까요?"
        onClose={onClose}
        actions={
          state.kind === 'ready' && (
            <button
              type="button"
              className={`button${editMode ? ' button--primary' : ''}`}
              onClick={toggleEditMode}
            >
              {editMode ? '완료' : '편집'}
            </button>
          )
        }
      />
      <div className="sheet__body preset-screen">
        <p className="preset-screen__hint">
          {editMode
            ? '카테고리와 항목을 고치거나 지울 수 있어요. 기본 항목도 바꿀 수 있어요.'
            : '고르면 이름, 아이콘, 주기가 채워져요. 저장하기 전에 고칠 수 있어요.'}
        </p>
        <button type="button" className="button button--primary button--large preset-screen__custom" onClick={onCustom}>
          직접 입력
        </button>

        {state.kind === 'loading' && (
          <p className="status-message" role="status">
            불러오는 중…
          </p>
        )}

        {state.kind === 'error' && (
          <ErrorNotice error={state.error} className="preset-screen__error">
            <button type="button" className="button button--primary button--large" onClick={retry}>
              다시 시도
            </button>
          </ErrorNotice>
        )}

        {actionError && (
          <ErrorNotice error={actionError} className="preset-screen__error">
            <button type="button" className="button" onClick={() => setActionError(null)}>
              닫기
            </button>
          </ErrorNotice>
        )}

        {state.kind === 'ready' && (
          <>
            <ul className="preset-categories">{state.categories.map(renderCategory)}</ul>
            {editor?.kind === 'add-category' ? (
              <PresetCategoryEditor
                label="카테고리 추가"
                onSave={saveNewCategory}
                onCancel={() => setEditor(null)}
                onDirtyChange={setEditorDirty}
              />
            ) : (
              <button
                type="button"
                className="preset-add-category"
                onClick={() => openEditor({ kind: 'add-category' })}
              >
                + 카테고리 추가
              </button>
            )}
          </>
        )}
      </div>
    </>
  )
}

export default PresetPicker
