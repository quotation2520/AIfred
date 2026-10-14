import { type FormEvent, useState } from 'react'
import {
  type ChoreRecord,
  type ChoreUpdateInput,
  createChore,
  deleteChore,
  newChoreId,
  updateChore,
} from '../api/chores'
import { deleteErrorText, type ErrorText, saveErrorText } from '../lib/errorMessages'
import type { Preset } from '../lib/presets'
import ErrorNotice from './ErrorNotice'

interface ChoreFormProps {
  /** 편집할 집안일. 없으면 추가 모드다. */
  chore?: ChoreRecord
  /** 추가 모드에서 기본 목록에서 고른 항목. 이름, 아이콘, 주기를 채워 연다. 채워진 값은 "바뀐 입력"으로 보지 않는다. */
  preset?: Pick<Preset, 'name' | 'icon' | 'intervalDays'>
  today: string
  /** 저장/삭제가 끝났을 때 */
  onDone: () => void
  onCancel: () => void
}

interface FormValues {
  name: string
  intervalDays: string
  lastDoneAt: string
  icon: string
  note: string
}

type FieldErrors = Partial<Record<keyof FormValues, string>>

/** 주기 상한(100년). 서버 server/app/schemas.py의 MAX_INTERVAL_DAYS와 같은 값이다. */
export const MAX_INTERVAL_DAYS = 36500

/**
 * 마지막 수행일 허용 범위. 제품 규칙이 아니라 날짜 계산 overflow를 막기 위한 범위다.
 * 서버 server/app/schemas.py의 MIN_DATE/MAX_DATE와 같은 값이다.
 */
export const MIN_LAST_DONE_AT = '2000-01-01'
export const MAX_LAST_DONE_AT = '2100-12-31'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function initialValues(
  chore: ChoreRecord | undefined,
  preset: ChoreFormProps['preset'],
  today: string,
): FormValues {
  if (!chore && preset) {
    // 기본 목록에서 고른 경우: 마지막 수행일은 오늘, 메모는 비워 둔다.
    return { name: preset.name, intervalDays: String(preset.intervalDays), lastDoneAt: today, icon: preset.icon, note: '' }
  }
  return {
    name: chore?.name ?? '',
    intervalDays: chore ? String(chore.intervalDays) : '',
    lastDoneAt: chore?.lastDoneAt ?? today,
    icon: chore?.icon ?? '',
    note: chore?.note ?? '',
  }
}

function validate(values: FormValues): FieldErrors {
  const errors: FieldErrors = {}
  if (!values.name.trim()) errors.name = '이름을 입력해 주세요.'
  // 상황별로 짧게 안내한다 (UX U10). 숫자 칸이라 숫자가 아닌 입력은 빈 값으로 들어온다.
  const interval = values.intervalDays.trim()
  const intervalNumber = Number(interval)
  if (!interval) {
    errors.intervalDays = '주기를 입력해 주세요.'
  } else if (!Number.isFinite(intervalNumber) || intervalNumber < 1 || intervalNumber > MAX_INTERVAL_DAYS) {
    errors.intervalDays = `1~${MAX_INTERVAL_DAYS}일 사이로 입력해 주세요.`
  } else if (!Number.isInteger(intervalNumber)) {
    errors.intervalDays = '소수점 없이 일 단위로 입력해 주세요.'
  }
  if (!values.lastDoneAt) {
    errors.lastDoneAt = '마지막 수행일을 선택해 주세요.'
  } else if (
    !DATE_RE.test(values.lastDoneAt) ||
    values.lastDoneAt < MIN_LAST_DONE_AT ||
    values.lastDoneAt > MAX_LAST_DONE_AT
  ) {
    // "YYYY-MM-DD"는 문자열 비교가 날짜 순서와 같다.
    errors.lastDoneAt = `마지막 수행일은 ${MIN_LAST_DONE_AT}~${MAX_LAST_DONE_AT} 사이여야 해요.`
  }
  return errors
}

/** 빈 문자열은 값 없음(null)으로 본다. */
function optional(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

/** 원래 값과 비교해 바뀐 필드만 모은다. */
function changedFields(chore: ChoreRecord, values: FormValues): ChoreUpdateInput {
  const changes: ChoreUpdateInput = {}
  const name = values.name.trim()
  const intervalDays = Number(values.intervalDays.trim())
  const icon = optional(values.icon)
  const note = optional(values.note)
  if (name !== chore.name) changes.name = name
  if (intervalDays !== chore.intervalDays) changes.intervalDays = intervalDays
  if (values.lastDoneAt !== chore.lastDoneAt) changes.lastDoneAt = values.lastDoneAt
  if (icon !== (chore.icon ?? null)) changes.icon = icon
  if (note !== (chore.note ?? null)) changes.note = note
  return changes
}

function isDirty(values: FormValues, initial: FormValues): boolean {
  return (Object.keys(initial) as (keyof FormValues)[]).some((key) => values[key] !== initial[key])
}

/** F1 집안일 추가·편집 화면. */
function ChoreForm({ chore, preset, today, onDone, onCancel }: ChoreFormProps) {
  const isEdit = chore !== undefined
  const [initial] = useState<FormValues>(() => initialValues(chore, preset, today))
  const [values, setValues] = useState<FormValues>(initial)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState<ErrorText | null>(null)
  const [busy, setBusy] = useState(false)

  function handleCancel() {
    // 입력이 바뀐 상태에서만 묻는다 (UX U10).
    if (isDirty(values, initial) && !window.confirm('작성 중인 내용을 버릴까요?')) return
    onCancel()
  }

  function setField(field: keyof FormValues, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = validate(values)
    setErrors(nextErrors)
    setSubmitError(null)
    if (Object.keys(nextErrors).length > 0) return

    setBusy(true)
    try {
      if (chore) {
        const changes = changedFields(chore, values)
        if (Object.keys(changes).length > 0) {
          await updateChore(chore.id, changes)
        }
      } else {
        const icon = optional(values.icon)
        const note = optional(values.note)
        await createChore({
          id: newChoreId(),
          name: values.name.trim(),
          intervalDays: Number(values.intervalDays.trim()),
          lastDoneAt: values.lastDoneAt,
          ...(icon !== null && { icon }),
          ...(note !== null && { note }),
        })
      }
      onDone()
    } catch (error) {
      setSubmitError(saveErrorText(error))
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!chore) return
    // 받침에 따라 바뀌는 조사를 쓰지 않는 문장 (UX U10).
    if (!window.confirm(`'${chore.name}' 삭제할까요?`)) return
    setSubmitError(null)
    setBusy(true)
    try {
      await deleteChore(chore.id)
      onDone()
    } catch (error) {
      setSubmitError(deleteErrorText(error))
      setBusy(false)
    }
  }

  return (
    <main className="chore-form-screen">
      <h1 className="form-title">{isEdit ? '집안일 편집' : '집안일 추가'}</h1>
      <form className="chore-form" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="chore-name">이름</label>
          <input
            id="chore-name"
            type="text"
            value={values.name}
            onChange={(e) => setField('name', e.target.value)}
            placeholder="예: 화분 물주기"
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? 'chore-name-error' : undefined}
          />
          {errors.name && (
            <p id="chore-name-error" className="field__error">
              {errors.name}
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor="chore-interval">주기 (일)</label>
          <input
            id="chore-interval"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_INTERVAL_DAYS}
            step={1}
            value={values.intervalDays}
            onChange={(e) => setField('intervalDays', e.target.value)}
            placeholder="예: 7"
            aria-invalid={errors.intervalDays ? true : undefined}
            aria-describedby={errors.intervalDays ? 'chore-interval-error' : undefined}
          />
          {errors.intervalDays && (
            <p id="chore-interval-error" className="field__error">
              {errors.intervalDays}
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor="chore-last-done">마지막 수행일</label>
          <input
            id="chore-last-done"
            type="date"
            min={MIN_LAST_DONE_AT}
            max={MAX_LAST_DONE_AT}
            value={values.lastDoneAt}
            onChange={(e) => setField('lastDoneAt', e.target.value)}
            aria-invalid={errors.lastDoneAt ? true : undefined}
            aria-describedby={errors.lastDoneAt ? 'chore-last-done-error' : undefined}
          />
          {errors.lastDoneAt && (
            <p id="chore-last-done-error" className="field__error">
              {errors.lastDoneAt}
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor="chore-icon">아이콘 (선택)</label>
          <input
            id="chore-icon"
            type="text"
            value={values.icon}
            onChange={(e) => setField('icon', e.target.value)}
            placeholder="예: 🪴"
          />
        </div>

        <div className="field">
          <label htmlFor="chore-note">메모 (선택)</label>
          <textarea id="chore-note" rows={3} value={values.note} onChange={(e) => setField('note', e.target.value)} />
        </div>

        {submitError && <ErrorNotice error={submitError} className="form-error" />}

        <div className="form-actions">
          <button type="button" className="button button--secondary" onClick={handleCancel} disabled={busy}>
            취소
          </button>
          <button type="submit" className="button button--primary" disabled={busy}>
            저장
          </button>
        </div>

        {isEdit && (
          <div className="form-danger-zone">
            <button type="button" className="button button--danger" onClick={handleDelete} disabled={busy}>
              삭제
            </button>
          </div>
        )}
      </form>
    </main>
  )
}

export default ChoreForm
