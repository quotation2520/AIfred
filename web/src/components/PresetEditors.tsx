import { type FormEvent, type ReactNode, useEffect, useState } from 'react'
import { type ErrorText, presetSaveErrorText } from '../lib/errorMessages'
import {
  codePointLength,
  DEFAULT_CATEGORY_EMOJI,
  DEFAULT_ITEM_ICON,
  PRESET_EMOJI_MAX_LENGTH,
  PRESET_NAME_MAX_LENGTH,
  PRESET_NOTE_MAX_LENGTH,
} from '../lib/presets'
import { MAX_INTERVAL_DAYS } from './ChoreForm'
import ErrorNotice from './ErrorNotice'

/** 입력 칸 값(문자열 그대로) */
export interface PresetItemValues {
  name: string
  icon: string
  intervalDays: string
  note: string
}

export interface PresetCategoryValues {
  name: string
  emoji: string
}

type Errors<T> = Partial<Record<keyof T, string>>

function nameError(name: string): string | undefined {
  const trimmed = name.trim()
  if (!trimmed) return '이름을 입력해 주세요.'
  if (codePointLength(trimmed) > PRESET_NAME_MAX_LENGTH) return `${PRESET_NAME_MAX_LENGTH}자 이하로 입력해 주세요.`
  return undefined
}

function emojiError(value: string): string | undefined {
  return codePointLength(value.trim()) > PRESET_EMOJI_MAX_LENGTH ? '이모지 하나만 입력해 주세요.' : undefined
}

/** ChoreForm의 주기 검증과 같은 규칙과 문구다. */
function intervalError(value: string): string | undefined {
  const interval = value.trim()
  const number = Number(interval)
  if (!interval) return '주기를 입력해 주세요.'
  if (!Number.isFinite(number) || number < 1 || number > MAX_INTERVAL_DAYS) {
    return `1~${MAX_INTERVAL_DAYS}일 사이로 입력해 주세요.`
  }
  if (!Number.isInteger(number)) return '소수점 없이 일 단위로 입력해 주세요.'
  return undefined
}

function compact<T>(errors: Errors<T>): Errors<T> {
  return Object.fromEntries(Object.entries(errors).filter(([, v]) => v !== undefined)) as Errors<T>
}

interface EditorShellProps {
  label: string
  busy: boolean
  submitError: ErrorText | null
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onCancel: () => void
  children: ReactNode
}

/** 목록 안에서 펼쳐지는 작은 입력 폼의 틀: 입력 칸, 오류, 취소/저장 */
function EditorShell({ label, busy, submitError, onSubmit, onCancel, children }: EditorShellProps) {
  return (
    <form className="preset-editor" aria-label={label} onSubmit={onSubmit} noValidate>
      <p className="preset-editor__title">{label}</p>
      {children}
      {submitError && <ErrorNotice error={submitError} className="preset-editor__error" />}
      <div className="form-actions">
        <button type="button" className="button button--secondary" onClick={onCancel} disabled={busy}>
          취소
        </button>
        <button type="submit" className="button button--primary" disabled={busy}>
          저장
        </button>
      </div>
    </form>
  )
}

interface FieldProps {
  id: string
  label: string
  error?: string
  children: ReactNode
}

function Field({ id, label, error, children }: FieldProps) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error && (
        <p id={`${id}-error`} className="field__error">
          {error}
        </p>
      )}
    </div>
  )
}

function invalidProps(id: string, error: string | undefined) {
  return error ? { 'aria-invalid': true, 'aria-describedby': `${id}-error` } : {}
}

/** 저장 중 오류는 폼 안에 보여 주고 입력은 그대로 둔다. 성공하면 부모가 폼을 닫는다. */
function useSubmit<T>(validate: (values: T) => Errors<T>, save: (values: T) => Promise<void>) {
  const [errors, setErrors] = useState<Errors<T>>({})
  const [submitError, setSubmitError] = useState<ErrorText | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (values: T) => {
    const next = compact(validate(values))
    setErrors(next)
    setSubmitError(null)
    if (Object.keys(next).length > 0) return
    setBusy(true)
    try {
      await save(values)
    } catch (error) {
      setSubmitError(presetSaveErrorText(error))
      setBusy(false)
    }
  }
  return { errors, submitError, busy, submit }
}

/** 입력이 처음 값과 달라졌는지 부모에게 알린다. 폼이 닫히면 false로 돌려놓는다. */
function useReportDirty<T extends object>(values: T, initial: T, onDirtyChange?: (dirty: boolean) => void) {
  const dirty = (Object.keys(initial) as (keyof T)[]).some((key) => values[key] !== initial[key])
  useEffect(() => {
    onDirtyChange?.(dirty)
    return () => onDirtyChange?.(false)
  }, [dirty, onDirtyChange])
}

interface PresetItemEditorProps {
  label: string
  initial?: PresetItemValues
  onSave: (values: PresetItemValues) => Promise<void>
  onCancel: () => void
  /** 입력이 처음 값과 달라졌는지. 뒤로 가기나 시트 닫기에서 확인 창을 띄울지 정한다. */
  onDirtyChange?: (dirty: boolean) => void
}

const EMPTY_ITEM: PresetItemValues = { name: '', icon: '', intervalDays: '', note: '' }

/** 항목 추가·수정: 이름, 아이콘(이모지), 주기, 메모(선택) */
export function PresetItemEditor({ label, initial = EMPTY_ITEM, onSave, onCancel, onDirtyChange }: PresetItemEditorProps) {
  const [values, setValues] = useState(initial)
  useReportDirty(values, initial, onDirtyChange)
  const { errors, submitError, busy, submit } = useSubmit<PresetItemValues>(
    (v) => ({
      name: nameError(v.name),
      icon: emojiError(v.icon),
      intervalDays: intervalError(v.intervalDays),
      note: codePointLength(v.note.trim()) > PRESET_NOTE_MAX_LENGTH ? `${PRESET_NOTE_MAX_LENGTH}자 이하로 입력해 주세요.` : undefined,
    }),
    onSave,
  )
  const set = (field: keyof PresetItemValues, value: string) => setValues((prev) => ({ ...prev, [field]: value }))

  return (
    <EditorShell
      label={label}
      busy={busy}
      submitError={submitError}
      onSubmit={(event) => {
        event.preventDefault()
        void submit(values)
      }}
      onCancel={onCancel}
    >
      <Field id="preset-item-name" label="항목 이름" error={errors.name}>
        <input
          id="preset-item-name"
          type="text"
          autoFocus
          value={values.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="예: 화분 물주기"
          {...invalidProps('preset-item-name', errors.name)}
        />
      </Field>
      <div className="preset-editor__row">
        <Field id="preset-item-icon" label="아이콘" error={errors.icon}>
          <input
            id="preset-item-icon"
            type="text"
            className="preset-editor__emoji"
            value={values.icon}
            onChange={(e) => set('icon', e.target.value)}
            placeholder={DEFAULT_ITEM_ICON}
            {...invalidProps('preset-item-icon', errors.icon)}
          />
        </Field>
        <Field id="preset-item-interval" label="주기 (일)" error={errors.intervalDays}>
          <input
            id="preset-item-interval"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_INTERVAL_DAYS}
            step={1}
            value={values.intervalDays}
            onChange={(e) => set('intervalDays', e.target.value)}
            placeholder="예: 7"
            {...invalidProps('preset-item-interval', errors.intervalDays)}
          />
        </Field>
      </div>
      <Field id="preset-item-note" label="메모 (선택)" error={errors.note}>
        <input
          id="preset-item-note"
          type="text"
          value={values.note}
          onChange={(e) => set('note', e.target.value)}
          {...invalidProps('preset-item-note', errors.note)}
        />
      </Field>
    </EditorShell>
  )
}

interface PresetCategoryEditorProps {
  label: string
  initial?: PresetCategoryValues
  onSave: (values: PresetCategoryValues) => Promise<void>
  onCancel: () => void
  onDirtyChange?: (dirty: boolean) => void
}

const EMPTY_CATEGORY: PresetCategoryValues = { name: '', emoji: '' }

/** 카테고리 추가·수정: 이름, 이모지 */
export function PresetCategoryEditor({
  label,
  initial = EMPTY_CATEGORY,
  onSave,
  onCancel,
  onDirtyChange,
}: PresetCategoryEditorProps) {
  const [values, setValues] = useState(initial)
  useReportDirty(values, initial, onDirtyChange)
  const { errors, submitError, busy, submit } = useSubmit<PresetCategoryValues>(
    (v) => ({ name: nameError(v.name), emoji: emojiError(v.emoji) }),
    onSave,
  )
  const set = (field: keyof PresetCategoryValues, value: string) => setValues((prev) => ({ ...prev, [field]: value }))

  return (
    <EditorShell
      label={label}
      busy={busy}
      submitError={submitError}
      onSubmit={(event) => {
        event.preventDefault()
        void submit(values)
      }}
      onCancel={onCancel}
    >
      <div className="preset-editor__row">
        <Field id="preset-category-emoji" label="이모지" error={errors.emoji}>
          <input
            id="preset-category-emoji"
            type="text"
            className="preset-editor__emoji"
            value={values.emoji}
            onChange={(e) => set('emoji', e.target.value)}
            placeholder={DEFAULT_CATEGORY_EMOJI}
            {...invalidProps('preset-category-emoji', errors.emoji)}
          />
        </Field>
        <Field id="preset-category-name" label="카테고리 이름" error={errors.name}>
          <input
            id="preset-category-name"
            type="text"
            autoFocus
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="예: 베란다"
            {...invalidProps('preset-category-name', errors.name)}
          />
        </Field>
      </div>
    </EditorShell>
  )
}
