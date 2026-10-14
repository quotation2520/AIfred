import { useState } from 'react'
import { formatInterval } from '../lib/formatDate'
import { type Preset, type PresetCategory, PRESET_CATEGORIES, presetNameKey } from '../lib/presets'

interface PresetPickerProps {
  /** 이미 등록된(삭제되지 않은) 집안일 이름. 같은 이름의 항목은 "추가됨"으로 흐리게 보이고 누를 수 없다. */
  takenNames: readonly string[]
  /** 항목을 골랐을 때. 이 값이 채워진 추가 폼을 연다. */
  onPick: (preset: Preset) => void
  /** "직접 입력": 빈 추가 폼을 연다. */
  onCustom: () => void
  /** 대시보드로 돌아간다. */
  onClose: () => void
}

/**
 * 집안일 추가의 첫 화면: 기본 목록(shared/presets.json)에서 고르거나 직접 입력한다.
 * 분류별 제목 아래에 항목을 작은 카드로 놓는다. 선택 분류(반려동물)는 맨 아래에 접어 둔다.
 */
function PresetPicker({ takenNames, onPick, onCustom, onClose }: PresetPickerProps) {
  const [optionalOpen, setOptionalOpen] = useState(false)
  const taken = new Set(takenNames.map(presetNameKey))
  const required = PRESET_CATEGORIES.filter((category) => !category.optional)
  const optional = PRESET_CATEGORIES.filter((category) => category.optional)

  const renderCategory = (category: PresetCategory) => {
    const headingId = `preset-${category.id}-heading`
    return (
      <section key={category.id} className="preset-category" aria-labelledby={headingId}>
        <h2 id={headingId} className="preset-category__title">
          <span aria-hidden="true">{category.emoji}</span> {category.name}
        </h2>
        <ul className="preset-grid">
          {category.items.map((preset) => {
            const added = taken.has(presetNameKey(preset.name))
            return (
              <li key={preset.name}>
                <button
                  type="button"
                  className={`preset-chip${added ? ' preset-chip--added' : ''}`}
                  disabled={added}
                  onClick={() => onPick(preset)}
                >
                  <span className="preset-chip__icon" aria-hidden="true">
                    {preset.icon}
                  </span>
                  <span className="preset-chip__text">
                    <span className="preset-chip__name">{preset.name}</span>{' '}
                    <span className="preset-chip__interval">{formatInterval(preset.intervalDays)}</span>
                    {added && (
                      <>
                        {' '}
                        <span className="preset-chip__added">추가됨</span>
                      </>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    )
  }

  return (
    <main className="preset-screen">
      <div className="preset-screen__header">
        <h1 className="form-title">어떤 집안일을 추가할까요?</h1>
        <button type="button" className="button" onClick={onClose}>
          닫기
        </button>
      </div>
      <p className="preset-screen__hint">고르면 이름, 아이콘, 주기가 채워져요. 저장하기 전에 고칠 수 있어요.</p>
      <button type="button" className="button button--primary button--large preset-screen__custom" onClick={onCustom}>
        직접 입력
      </button>

      {required.map(renderCategory)}

      {optional.length > 0 && (
        <div className="preset-optional">
          <button
            type="button"
            className="button preset-optional__toggle"
            aria-expanded={optionalOpen}
            onClick={() => setOptionalOpen((open) => !open)}
          >
            <span aria-hidden="true">{optional.map((category) => category.emoji).join(' ')}</span>{' '}
            {optional.map((category) => category.name).join('·')} 항목 {optionalOpen ? '숨기기' : '보기'}
          </button>
          {optionalOpen && optional.map(renderCategory)}
        </div>
      )}
    </main>
  )
}

export default PresetPicker
