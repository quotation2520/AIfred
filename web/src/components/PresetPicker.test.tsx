// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PresetItem } from '../api/presets'
import { ENTER_MS } from '../lib/motion'
import { PRESET_OPEN_STORAGE_KEY } from '../lib/presets'
import { jsonResponse, mockFetch, presetCategory, presetItem, presetRoutes, SAMPLE_PRESETS } from '../test/fetchMock'
import PresetPicker from './PresetPicker'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
  delete (HTMLElement.prototype as Partial<HTMLElement>).animate
})

interface Setup {
  takenNames?: string[]
  routes?: Parameters<typeof mockFetch>[0]
}

async function renderPicker({ takenNames = [], routes = {} }: Setup = {}) {
  const mock = mockFetch({ ...presetRoutes(), ...routes })
  const onPick = vi.fn<(preset: PresetItem) => void>()
  const onCustom = vi.fn()
  const onClose = vi.fn()
  render(<PresetPicker takenNames={takenNames} onPick={onPick} onCustom={onCustom} onClose={onClose} />)
  await screen.findByRole('button', { name: /^주방 \d+$/ })
  return { ...mock, onPick, onCustom, onClose }
}

/** 카테고리 머리줄(펼치기/접기 버튼). 이름은 "주방 2"처럼 이름과 항목 수다. */
function toggleOf(category: string): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(`^${category} \\d+$`) })
}

function regionOf(category: string): HTMLElement {
  return screen.getByRole('region', { name: category })
}

/** 펼친 카테고리의 줄 이름(아이콘 빼고 이름만). 맨 아래 "+ 항목 추가" 줄은 뺀다. */
function rowNames(category: string): string[] {
  return Array.from(regionOf(category).querySelectorAll('.preset-row__name')).map((el) => el.textContent ?? '')
}

function itemButton(name: string): HTMLButtonElement {
  return screen.getByRole('button', { name: new RegExp(`^${name} (매일|\\d+일마다)( 추가됨)?$`) }) as HTMLButtonElement
}

async function expand(user: UserEvent, category: string) {
  await user.click(toggleOf(category))
  expect(toggleOf(category).getAttribute('aria-expanded')).toBe('true')
}

describe('불러오기', () => {
  it('불러오는 동안 안내를 보이고, 받은 카테고리를 모두 접힌 채로 보여준다. 머리줄은 이모지, 이름, 항목 수다', async () => {
    const { calls } = mockFetch(presetRoutes())
    render(<PresetPicker takenNames={[]} onPick={vi.fn()} onCustom={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('status').textContent).toContain('불러오는 중')

    const kitchen = await screen.findByRole('button', { name: '주방 2' })
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(['GET /api/presets'])
    expect(kitchen.getAttribute('aria-expanded')).toBe('false')
    expect(kitchen.querySelector('.preset-category__emoji')?.textContent).toBe('🍳')
    expect(kitchen.querySelector('.preset-category__count')?.textContent).toBe('2')
    expect(toggleOf('쓰레기').textContent).toContain('♻️ 쓰레기 1')
    // 순서는 서버 응답 그대로, 처음에는 항목이 하나도 안 보인다.
    expect(
      screen.getAllByRole('button', { expanded: false }).map((b) => b.querySelector('.preset-category__name')?.textContent),
    ).toEqual(['주방', '세탁', '쓰레기', '생활·관리'])
    expect(screen.queryAllByRole('region')).toHaveLength(0)
    expect(document.querySelectorAll('.preset-row--pick')).toHaveLength(0)
    expect(screen.getByRole('button', { name: '직접 입력' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '+ 카테고리 추가' })).toBeTruthy()
  })

  it('불러오지 못하면 오류와 다시 시도 버튼을 보여주고, 다시 시도하면 목록이 나온다. 직접 입력은 그대로 쓸 수 있다', async () => {
    const user = userEvent.setup()
    let fail = true
    const { calls } = mockFetch({
      'GET /api/presets': () => (fail ? jsonResponse({ detail: '서버 고장' }, 500) : jsonResponse(SAMPLE_PRESETS)),
    })
    const onCustom = vi.fn()
    render(<PresetPicker takenNames={[]} onPick={vi.fn()} onCustom={onCustom} onClose={vi.fn()} />)

    const alert = await screen.findByRole('alert')
    expect(alert.querySelector('.error-notice__title')?.textContent).toBe('기본 목록을 불러오지 못했어요.')
    expect(alert.querySelector('.error-notice__hint')?.textContent).toContain('다시 시도해 주세요.')
    expect(alert.querySelector('.error-notice__detail')?.textContent).toBe('오류 코드 500 · 서버 고장')
    expect(screen.queryByRole('button', { name: '편집' })).toBeNull()
    expect(screen.queryByRole('button', { name: '+ 카테고리 추가' })).toBeNull()
    await user.click(screen.getByRole('button', { name: '직접 입력' }))
    expect(onCustom).toHaveBeenCalledTimes(1)

    fail = false
    await user.click(within(alert).getByRole('button', { name: '다시 시도' }))
    await screen.findByRole('button', { name: '주방 2' })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(calls).toHaveLength(2)
  })
})

describe('아코디언', () => {
  it('머리줄을 누르면 펼치고 다시 누르면 접는다. 여러 개를 함께 펼칠 수 있고, 펼친 상태를 기기에 기억한다', async () => {
    const user = userEvent.setup()
    await renderPicker()

    await expand(user, '주방')
    expect(toggleOf('주방').getAttribute('aria-controls')).toBe(regionOf('주방').id)
    await expand(user, '세탁')
    expect(rowNames('주방')).toEqual(['설거지', '냉장고 정리'])
    expect(rowNames('세탁')).toEqual(['빨래', '이불 빨래'])
    expect(JSON.parse(localStorage.getItem(PRESET_OPEN_STORAGE_KEY) ?? '[]')).toEqual(['cat-kitchen', 'cat-laundry'])

    await user.click(toggleOf('주방'))
    expect(toggleOf('주방').getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('region', { name: '주방' })).toBeNull()
    expect(rowNames('세탁')).toEqual(['빨래', '이불 빨래'])
    expect(JSON.parse(localStorage.getItem(PRESET_OPEN_STORAGE_KEY) ?? '[]')).toEqual(['cat-laundry'])

    // 다시 열면 기억한 대로 펼쳐져 있다.
    cleanup()
    await renderPicker()
    expect(toggleOf('세탁').getAttribute('aria-expanded')).toBe('true')
    expect(toggleOf('주방').getAttribute('aria-expanded')).toBe('false')
    expect(rowNames('세탁')).toEqual(['빨래', '이불 빨래'])
  })

  it('저장소를 쓸 수 없으면 모두 접힌 채로 시작하고, 펼치기는 오류 없이 동작한다', async () => {
    const user = userEvent.setup()
    localStorage.setItem(PRESET_OPEN_STORAGE_KEY, '["cat-kitchen"]')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    await renderPicker()
    expect(screen.queryAllByRole('region')).toHaveLength(0)
    await expand(user, '주방')
    expect(rowNames('주방')).toEqual(['설거지', '냉장고 정리'])
  })

  it('펼치면 항목이 한 줄에 하나씩 아이콘, 이름, 주기("매일", "N일마다")로 나오고, 맨 아래에 "+ 항목 추가"가 있다', async () => {
    const user = userEvent.setup()
    await renderPicker()
    await expand(user, '주방')

    const region = regionOf('주방')
    const rows = within(region).getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    const dishes = within(rows[0]).getByRole('button', { name: '설거지 매일' })
    expect(dishes.className).toContain('preset-row')
    expect(dishes.querySelector('.preset-row__icon')?.textContent).toBe('🍽️')
    expect(dishes.querySelector('.preset-row__interval')?.textContent).toBe('매일')
    expect(within(rows[1]).getByRole('button', { name: '냉장고 정리 7일마다' })).toBeTruthy()
    expect(within(rows[2]).getByRole('button', { name: '+ 항목 추가' })).toBeTruthy()
  })

  it('항목을 누르면 그 항목으로 onPick을 부른다. 이미 등록된 이름은 "추가됨"으로 누를 수 없다', async () => {
    const user = userEvent.setup()
    const { onPick } = await renderPicker({ takenNames: [' 설거지'] })
    await expand(user, '주방')

    const dishes = itemButton('설거지')
    expect(dishes.disabled).toBe(true)
    expect(dishes.className).toContain('preset-row--added')
    expect(dishes.querySelector('.preset-row__added')?.textContent).toBe('추가됨')
    await user.click(dishes)
    expect(onPick).not.toHaveBeenCalled()

    await user.click(itemButton('냉장고 정리'))
    expect(onPick).toHaveBeenCalledWith(SAMPLE_PRESETS[0].items[1])
  })

  describe('움직임', () => {
    type Listener = () => void
    function fakeAnimate() {
      const listeners: Record<string, Listener[]> = {}
      const animation = {
        cancel: vi.fn(() => listeners.cancel?.forEach((l) => l())),
        addEventListener: (type: string, listener: Listener) => {
          ;(listeners[type] ??= []).push(listener)
        },
        finish: () => listeners.finish?.forEach((l) => l()),
      }
      const animate = vi.fn(() => animation as unknown as Animation)
      Object.defineProperty(HTMLElement.prototype, 'animate', { value: animate, configurable: true, writable: true })
      return { animate, animation }
    }

    it('접을 때는 내용이 사라지는 움직임이 끝난 뒤 빠진다. 그 사이 다시 펼치면 움직임을 멈추고 그대로 둔다', async () => {
      const user = userEvent.setup()
      const { animate, animation } = fakeAnimate()
      await renderPicker()
      await expand(user, '주방')

      await user.click(toggleOf('주방'))
      expect(animate).toHaveBeenCalledWith(
        [
          { opacity: 1, transform: 'none' },
          { opacity: 0, transform: 'translateY(-6px)' },
        ],
        expect.objectContaining({ duration: ENTER_MS }),
      )
      expect(toggleOf('주방').getAttribute('aria-expanded')).toBe('false')
      expect(regionOf('주방')).toBeTruthy()
      act(() => animation.finish())
      expect(screen.queryByRole('region', { name: '주방' })).toBeNull()

      await expand(user, '주방')
      await user.click(toggleOf('주방'))
      await user.click(toggleOf('주방'))
      expect(animation.cancel).toHaveBeenCalled()
      expect(toggleOf('주방').getAttribute('aria-expanded')).toBe('true')
      expect(rowNames('주방')).toEqual(['설거지', '냉장고 정리'])
    })

    it('움직임 줄이기 설정이면 움직이지 않고 바로 접는다', async () => {
      const user = userEvent.setup()
      const { animate } = fakeAnimate()
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query }))
      await renderPicker()
      await expand(user, '주방')
      await user.click(toggleOf('주방'))
      expect(animate).not.toHaveBeenCalled()
      expect(screen.queryByRole('region', { name: '주방' })).toBeNull()
    })
  })
})

describe('항목 추가', () => {
  it('"+ 항목 추가"로 줄 자리에 폼을 열고, 검증을 통과하면 POST한 뒤 목록 맨 아래에 바로 보여준다', async () => {
    const user = userEvent.setup()
    const { calls } = await renderPicker({
      routes: {
        'POST /api/preset-categories/cat-kitchen/items': (call) =>
          jsonResponse({ note: null, icon: '🧹', ...(call.body as object), isBuiltin: false }, 201),
      },
    })
    await expand(user, '주방')
    await user.click(within(regionOf('주방')).getByRole('button', { name: '+ 항목 추가' }))
    const form = screen.getByRole('form', { name: '항목 추가' })
    expect(document.activeElement).toBe(within(form).getByLabelText('항목 이름'))

    // 빈 값은 보내지 않는다.
    await user.click(within(form).getByRole('button', { name: '저장' }))
    expect(within(form).getByText('이름을 입력해 주세요.')).toBeTruthy()
    expect(within(form).getByText('주기를 입력해 주세요.')).toBeTruthy()
    await user.type(within(form).getByLabelText('주기 (일)'), '1.5')
    await user.click(within(form).getByRole('button', { name: '저장' }))
    expect(within(form).getByText('소수점 없이 일 단위로 입력해 주세요.')).toBeTruthy()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)

    await user.type(within(form).getByLabelText('항목 이름'), '  오븐 청소 ')
    await user.type(within(form).getByLabelText('아이콘'), '🥧')
    await user.clear(within(form).getByLabelText('주기 (일)'))
    await user.type(within(form).getByLabelText('주기 (일)'), '60')
    await user.type(within(form).getByLabelText('메모 (선택)'), '트레이 포함')
    await user.click(within(form).getByRole('button', { name: '저장' }))

    await screen.findByRole('button', { name: '오븐 청소 60일마다' })
    const post = calls.find((c) => c.method === 'POST')
    expect(post?.url).toBe('/api/preset-categories/cat-kitchen/items')
    const body = post?.body as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['icon', 'id', 'intervalDays', 'name', 'note'])
    expect(body).toMatchObject({ name: '오븐 청소', icon: '🥧', intervalDays: 60, note: '트레이 포함' })
    expect(body.id).toMatch(UUID_RE)
    expect(rowNames('주방')).toEqual(['설거지', '냉장고 정리', '오븐 청소'])
    expect(toggleOf('주방').getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: '주방 3' })).toBeTruthy()
    expect(screen.queryByRole('form')).toBeNull()
  })

  it('아이콘과 메모를 비우면 보내지 않는다(서버가 🧹를 쓴다). 취소하면 요청 없이 닫힌다', async () => {
    const user = userEvent.setup()
    const { calls } = await renderPicker({
      routes: {
        'POST /api/preset-categories/cat-trash/items': (call) =>
          jsonResponse({ note: null, icon: '🧹', ...(call.body as object), isBuiltin: false }, 201),
      },
    })
    await expand(user, '쓰레기')
    await user.click(within(regionOf('쓰레기')).getByRole('button', { name: '+ 항목 추가' }))
    await user.click(screen.getByRole('button', { name: '취소' }))
    expect(screen.queryByRole('form')).toBeNull()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)

    await user.click(within(regionOf('쓰레기')).getByRole('button', { name: '+ 항목 추가' }))
    const form = screen.getByRole('form', { name: '항목 추가' })
    await user.type(within(form).getByLabelText('항목 이름'), '음식물 쓰레기')
    await user.type(within(form).getByLabelText('아이콘'), '  ')
    await user.type(within(form).getByLabelText('주기 (일)'), '2')
    await user.click(within(form).getByRole('button', { name: '저장' }))
    const added = await screen.findByRole('button', { name: '음식물 쓰레기 2일마다' })
    expect(added.querySelector('.preset-row__icon')?.textContent).toBe('🧹')
    expect(Object.keys(calls.find((c) => c.method === 'POST')?.body as object).sort()).toEqual([
      'id',
      'intervalDays',
      'name',
    ])
  })

  it('같은 이름이 있어 서버가 409로 거절하면 "이미 같은 이름이 있어요"를 보여주고 입력을 그대로 둔다', async () => {
    const user = userEvent.setup()
    await renderPicker({
      routes: {
        'POST /api/preset-categories/cat-kitchen/items': () =>
          jsonResponse({ detail: '이 카테고리에 같은 이름의 항목이 이미 있다' }, 409),
      },
    })
    await expand(user, '주방')
    await user.click(within(regionOf('주방')).getByRole('button', { name: '+ 항목 추가' }))
    const form = screen.getByRole('form', { name: '항목 추가' })
    await user.type(within(form).getByLabelText('항목 이름'), '설거지')
    await user.type(within(form).getByLabelText('주기 (일)'), '2')
    await user.click(within(form).getByRole('button', { name: '저장' }))

    const alert = await within(form).findByRole('alert')
    expect(alert.querySelector('.error-notice__title')?.textContent).toBe('이미 같은 이름이 있어요.')
    expect(alert.querySelector('.error-notice__hint')?.textContent).toBe('다른 이름으로 바꿔 주세요.')
    expect(alert.querySelector('.error-notice__detail')?.textContent).toBe(
      '오류 코드 409 · 이 카테고리에 같은 이름의 항목이 이미 있다',
    )
    expect((within(form).getByLabelText('항목 이름') as HTMLInputElement).value).toBe('설거지')
    expect(within(form).getByRole('button', { name: '저장' })).toHaveProperty('disabled', false)
    expect(rowNames('주방')).toEqual(['설거지', '냉장고 정리'])
  })

  it('서버가 422로 거절하면 입력 칸을 확인하라고 안내한다', async () => {
    const user = userEvent.setup()
    await renderPicker({
      routes: {
        'POST /api/preset-categories/cat-kitchen/items': () =>
          jsonResponse({ detail: [{ loc: ['body', 'icon'], msg: 'Value error, 이모지는 16자 이하여야 한다' }] }, 422),
      },
    })
    await expand(user, '주방')
    await user.click(within(regionOf('주방')).getByRole('button', { name: '+ 항목 추가' }))
    const form = screen.getByRole('form', { name: '항목 추가' })
    await user.type(within(form).getByLabelText('항목 이름'), '오븐 청소')
    await user.type(within(form).getByLabelText('주기 (일)'), '30')
    await user.click(within(form).getByRole('button', { name: '저장' }))
    const alert = await within(form).findByRole('alert')
    expect(alert.querySelector('.error-notice__title')?.textContent).toBe('저장하지 못했어요.')
    expect(alert.querySelector('.error-notice__hint')?.textContent).toBe(
      '입력한 값을 서버가 받지 않았어요. 입력 칸을 확인해 주세요.',
    )
  })
})

describe('카테고리 추가', () => {
  it('"+ 카테고리 추가"로 이름과 이모지를 넣어 POST하고, 새 카테고리를 맨 아래에 펼친 채로 보여준다', async () => {
    const user = userEvent.setup()
    const { calls } = await renderPicker({
      routes: {
        'POST /api/preset-categories': (call) =>
          jsonResponse({ emoji: '📁', ...(call.body as object), isBuiltin: false, items: [] }, 201),
      },
    })
    await user.click(screen.getByRole('button', { name: '+ 카테고리 추가' }))
    const form = screen.getByRole('form', { name: '카테고리 추가' })
    await user.click(within(form).getByRole('button', { name: '저장' }))
    expect(within(form).getByText('이름을 입력해 주세요.')).toBeTruthy()

    await user.type(within(form).getByLabelText('카테고리 이름'), ' 베란다 ')
    await user.type(within(form).getByLabelText('이모지'), '🌿')
    await user.click(within(form).getByRole('button', { name: '저장' }))

    const toggle = await screen.findByRole('button', { name: '베란다 0' })
    const post = calls.find((c) => c.method === 'POST')
    expect(post?.url).toBe('/api/preset-categories')
    const body = post?.body as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['emoji', 'id', 'name'])
    expect(body).toMatchObject({ name: '베란다', emoji: '🌿' })
    expect(body.id).toMatch(UUID_RE)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(within(regionOf('베란다')).getByRole('button', { name: '+ 항목 추가' })).toBeTruthy()
    const names = Array.from(document.querySelectorAll('.preset-category__name')).map((el) => el.textContent)
    expect(names[names.length - 1]).toBe('베란다')
    expect(JSON.parse(localStorage.getItem(PRESET_OPEN_STORAGE_KEY) ?? '[]')).toContain(body.id)
  })

  it('카테고리 이름이 겹쳐 409면 같은 문구를 보여준다', async () => {
    const user = userEvent.setup()
    await renderPicker({
      routes: { 'POST /api/preset-categories': () => jsonResponse({ detail: '같은 이름의 카테고리가 이미 있다' }, 409) },
    })
    await user.click(screen.getByRole('button', { name: '+ 카테고리 추가' }))
    const form = screen.getByRole('form', { name: '카테고리 추가' })
    await user.type(within(form).getByLabelText('카테고리 이름'), '주방')
    await user.click(within(form).getByRole('button', { name: '저장' }))
    const alert = await within(form).findByRole('alert')
    expect(alert.querySelector('.error-notice__title')?.textContent).toBe('이미 같은 이름이 있어요.')
  })
})

describe('편집 모드', () => {
  async function enterEditMode(user: UserEvent) {
    await user.click(screen.getByRole('button', { name: '편집' }))
    expect(screen.getByRole('button', { name: '완료' })).toBeTruthy()
  }

  it('편집을 켜면 카테고리와 항목(기본 항목 포함)마다 수정·삭제가 나오고, 항목을 눌러도 고르지 않는다', async () => {
    const user = userEvent.setup()
    const { onPick } = await renderPicker()
    await expand(user, '주방')
    expect(screen.queryByRole('button', { name: '설거지 수정' })).toBeNull()

    await enterEditMode(user)
    expect(screen.getByRole('button', { name: '주방 카테고리 수정' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '주방 카테고리 삭제' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '설거지 수정' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '냉장고 정리 삭제' })).toBeTruthy()
    // 항목 줄은 더 이상 버튼이 아니다.
    expect(screen.queryByRole('button', { name: /^설거지 매일/ })).toBeNull()
    await user.click(screen.getByText('설거지'))
    expect(onPick).not.toHaveBeenCalled()
    // 아코디언은 그대로 동작한다.
    await user.click(toggleOf('주방'))
    expect(screen.queryByRole('region', { name: '주방' })).toBeNull()

    await user.click(screen.getByRole('button', { name: '완료' }))
    expect(screen.queryByRole('button', { name: '주방 카테고리 수정' })).toBeNull()
  })

  it('편집 모드의 줄은 이름이 한 칸을 다 쓰고, 주기·"추가됨"은 이름 아래 줄, 수정·삭제는 따로 묶인 큰 버튼이다 (U5)', async () => {
    // jsdom은 레이아웃을 계산하지 않으므로 DOM 구조와 클래스만 확인한다.
    const user = userEvent.setup()
    await renderPicker({ takenNames: ['냉장고 정리'] })
    await expand(user, '주방')
    await enterEditMode(user)

    const remove = screen.getByRole('button', { name: '냉장고 정리 삭제' })
    const row = remove.closest('li') as HTMLElement
    expect(row.className).toBe('preset-row preset-row--editing')
    expect(Array.from(row.children).map((el) => el.className)).toEqual([
      'preset-row__icon',
      'preset-row__text',
      'preset-row__actions',
    ])
    const text = row.querySelector('.preset-row__text') as HTMLElement
    expect(Array.from(text.children).map((el) => el.className)).toEqual(['preset-row__name', 'preset-row__meta'])
    expect(text.querySelector('.preset-row__name')?.textContent).toBe('냉장고 정리')
    expect(text.querySelector('.preset-row__meta')?.textContent).toBe('7일마다추가됨')

    const edit = screen.getByRole('button', { name: '냉장고 정리 수정' })
    expect(edit.parentElement).toBe(remove.parentElement)
    expect(edit.className).toBe('preset-action')
    // 삭제는 모양이 다르다: 빨간 테두리 클래스와 휴지통 표시
    expect(remove.className).toBe('preset-action preset-action--danger')
    expect(remove.textContent).toBe('🗑 삭제')

    // 카테고리 머리줄도 같은 버튼 묶음을 쓴다.
    const categoryRemove = screen.getByRole('button', { name: '주방 카테고리 삭제' })
    expect(categoryRemove.parentElement?.className).toBe('preset-row__actions')
    expect(categoryRemove.textContent).toBe('🗑 삭제')
  })

  it('가운뎃점으로 이은 긴 이름은 가운뎃점 뒤에서 줄을 바꿀 수 있다', async () => {
    const user = userEvent.setup()
    const presets = [
      presetCategory('cat-kitchen', '주방', '🍳', [presetItem('item-stove', '가스레인지·인덕션 청소', '🔥', 14)]),
    ]
    mockFetch(presetRoutes(presets))
    render(<PresetPicker takenNames={[]} onPick={vi.fn()} onCustom={vi.fn()} onClose={vi.fn()} />)
    await screen.findByRole('button', { name: '주방 1' })
    await expand(user, '주방')
    await enterEditMode(user)
    const name = screen.getByRole('button', { name: '가스레인지·인덕션 청소 삭제' }).closest('li')?.querySelector('.preset-row__name')
    expect(name?.textContent).toBe('가스레인지·인덕션 청소')
    expect(name?.querySelectorAll('wbr')).toHaveLength(1)
  })

  it('항목 수정: 값이 채워진 폼에서 바뀐 필드만 PATCH하고 줄을 바로 고친다', async () => {
    const user = userEvent.setup()
    const { calls } = await renderPicker({
      routes: {
        'PATCH /api/preset-items/item-fridge': (call) =>
          jsonResponse({ ...SAMPLE_PRESETS[0].items[1], ...(call.body as object) }),
      },
    })
    await expand(user, '주방')
    await enterEditMode(user)
    await user.click(screen.getByRole('button', { name: '냉장고 정리 수정' }))

    const form = screen.getByRole('form', { name: '항목 수정' })
    expect((within(form).getByLabelText('항목 이름') as HTMLInputElement).value).toBe('냉장고 정리')
    expect((within(form).getByLabelText('아이콘') as HTMLInputElement).value).toBe('🧊')
    expect((within(form).getByLabelText('주기 (일)') as HTMLInputElement).value).toBe('7')
    expect((within(form).getByLabelText('메모 (선택)') as HTMLInputElement).value).toBe('유통기한 확인')

    await user.clear(within(form).getByLabelText('주기 (일)'))
    await user.type(within(form).getByLabelText('주기 (일)'), '5')
    await user.clear(within(form).getByLabelText('메모 (선택)'))
    await user.click(within(form).getByRole('button', { name: '저장' }))

    await screen.findByText('5일마다')
    expect(calls.filter((c) => c.method === 'PATCH').map((c) => c.body)).toEqual([{ intervalDays: 5, note: null }])
    expect(screen.queryByRole('form')).toBeNull()
    expect(rowNames('주방')).toEqual(['설거지', '냉장고 정리'])
  })

  it('항목 수정에서 바뀐 것이 없으면 PATCH하지 않는다', async () => {
    const user = userEvent.setup()
    const { calls } = await renderPicker()
    await expand(user, '주방')
    await enterEditMode(user)
    await user.click(screen.getByRole('button', { name: '설거지 수정' }))
    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(screen.queryByRole('form')).toBeNull()
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false)
  })

  it('항목 이름을 다른 항목과 같게 고쳐 409면 폼 안에 알린다', async () => {
    const user = userEvent.setup()
    await renderPicker({
      routes: {
        'PATCH /api/preset-items/item-dishes': () =>
          jsonResponse({ detail: '이 카테고리에 같은 이름의 항목이 이미 있다' }, 409),
      },
    })
    await expand(user, '주방')
    await enterEditMode(user)
    await user.click(screen.getByRole('button', { name: '설거지 수정' }))
    const form = screen.getByRole('form', { name: '항목 수정' })
    await user.clear(within(form).getByLabelText('항목 이름'))
    await user.type(within(form).getByLabelText('항목 이름'), '냉장고 정리')
    await user.click(within(form).getByRole('button', { name: '저장' }))
    const alert = await within(form).findByRole('alert')
    expect(alert.querySelector('.error-notice__title')?.textContent).toBe('이미 같은 이름이 있어요.')
  })

  it('항목 삭제: 확인하면 DELETE하고 줄을 뺀다. 취소하면 요청하지 않는다', async () => {
    const user = userEvent.setup()
    const { calls } = await renderPicker({
      routes: { 'DELETE /api/preset-items/item-dishes': () => new Response(null, { status: 204 }) },
    })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await expand(user, '주방')
    await enterEditMode(user)

    await user.click(screen.getByRole('button', { name: '설거지 삭제' }))
    expect(confirm).toHaveBeenCalledWith("'설거지' 항목 삭제할까요?")
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)

    confirm.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: '설거지 삭제' }))
    await screen.findByRole('button', { name: '주방 1' })
    expect(calls.filter((c) => c.method === 'DELETE').map((c) => c.url)).toEqual(['/api/preset-items/item-dishes'])
    expect(rowNames('주방')).toEqual(['냉장고 정리'])
  })

  it('카테고리 삭제: "안의 항목 N개도 함께 삭제됩니다"를 알리고, 확인하면 DELETE한 뒤 뺀다', async () => {
    const user = userEvent.setup()
    const { calls } = await renderPicker({
      routes: { 'DELETE /api/preset-categories/cat-kitchen': () => new Response(null, { status: 204 }) },
    })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await enterEditMode(user)

    await user.click(screen.getByRole('button', { name: '주방 카테고리 삭제' }))
    expect(confirm).toHaveBeenCalledWith("'주방' 카테고리 삭제할까요?\n안의 항목 2개도 함께 삭제됩니다.")
    await vi.waitFor(() => expect(screen.queryByRole('button', { name: /^주방 \d+$/ })).toBeNull())
    expect(calls.filter((c) => c.method === 'DELETE').map((c) => c.url)).toEqual([
      '/api/preset-categories/cat-kitchen',
    ])
  })

  it('카테고리 수정: 이름과 이모지를 고쳐 PATCH하고 머리줄을 바로 고친다', async () => {
    const user = userEvent.setup()
    const { calls } = await renderPicker({
      routes: {
        'PATCH /api/preset-categories/cat-kitchen': (call) =>
          jsonResponse({ ...SAMPLE_PRESETS[0], ...(call.body as object) }),
      },
    })
    await enterEditMode(user)
    await user.click(screen.getByRole('button', { name: '주방 카테고리 수정' }))
    const form = screen.getByRole('form', { name: '카테고리 수정' })
    expect((within(form).getByLabelText('카테고리 이름') as HTMLInputElement).value).toBe('주방')
    expect((within(form).getByLabelText('이모지') as HTMLInputElement).value).toBe('🍳')
    await user.clear(within(form).getByLabelText('카테고리 이름'))
    await user.type(within(form).getByLabelText('카테고리 이름'), '부엌')
    await user.click(within(form).getByRole('button', { name: '저장' }))

    const toggle = await screen.findByRole('button', { name: '부엌 2' })
    expect(toggle.querySelector('.preset-category__emoji')?.textContent).toBe('🍳')
    expect(calls.filter((c) => c.method === 'PATCH').map((c) => c.body)).toEqual([{ name: '부엌' }])
  })

  it('삭제에 실패하면 오류를 보여주고 목록은 그대로다', async () => {
    const user = userEvent.setup()
    await renderPicker({
      routes: { 'DELETE /api/preset-items/item-dishes': () => jsonResponse({ detail: '항목을 찾을 수 없다' }, 404) },
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await expand(user, '주방')
    await enterEditMode(user)
    await user.click(screen.getByRole('button', { name: '설거지 삭제' }))

    const alert = await screen.findByRole('alert')
    expect(alert.querySelector('.error-notice__title')?.textContent).toBe('삭제하지 못했어요.')
    expect(alert.querySelector('.error-notice__hint')?.textContent).toContain('이미 삭제됐을 수 있어요.')
    expect(rowNames('주방')).toEqual(['설거지', '냉장고 정리'])
    await user.click(within(alert).getByRole('button', { name: '닫기' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
