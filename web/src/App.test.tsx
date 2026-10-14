// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { ChoreRecord } from './api/chores'
import { MAX_INTERVAL_DAYS, MAX_LAST_DONE_AT, MIN_LAST_DONE_AT } from './components/ChoreForm'
import { UNDO_TOAST_MS } from './components/Dashboard'
import { LATER_OPEN_STORAGE_KEY, LATER_THRESHOLD_DAYS } from './lib/dashboardLayout'
import { MOVE_MS } from './lib/motion'
import { jsonResponse, mockFetch, record } from './test/fetchMock'

const TODAY = '2026-10-14'

// TODAY 기준 남은 일수를 주석에 적는다. 서버 응답 순서는 일부러 섞었다.
const CHORES = [
  record('c', '냉장고 청소', 30, '2026-10-01'), // 17, D-17
  record('a', '화분 물주기', 7, '2026-10-05', { icon: '🪴', note: '베란다' }), // -2, D+2 (PRD 4장 예시)
  record('f', '이불 빨래', 14, '2026-10-01'), // 1, D-1
  record('b', '걸레질', 3, '2026-10-11'), // 0, D-Day
  record('e', '분리수거', 7, '2026-10-01'), // -6, D+6
]

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
})

/** "나중에 할 일"(남은 일수 7일 이상)을 펼친 상태로 기억시켜 둔다. 카드가 모두 보여야 하는 테스트에서 쓴다. */
function rememberLaterOpen() {
  localStorage.setItem(LATER_OPEN_STORAGE_KEY, '1')
}

function laterToggle(): HTMLElement {
  return within(section('그 밖의 집안일')).getByRole('button', { name: /^(나중에 할 일 \d+개 더 보기|접기)$/ })
}

function section(name: string) {
  return screen.getByRole('region', { name })
}

function cardNames(region: HTMLElement): string[] {
  return within(region)
    .getAllByRole('listitem')
    .map((item) => item.querySelector('.chore-card__name')?.textContent ?? '')
}

function cardOf(region: HTMLElement, name: string): HTMLElement {
  const item = within(region)
    .getAllByRole('listitem')
    .find((li) => li.querySelector('.chore-card__name')?.textContent === name)
  if (!item) throw new Error(`카드 없음: ${name}`)
  return item
}

/** 대시보드 불러오기가 끝날 때까지 기다린다. 요약 줄은 목록을 받은 뒤에만 나온다. */
function waitDashboard() {
  return screen.findByTestId('summary')
}

async function renderDashboard(chores = CHORES) {
  const mock = mockFetch({ 'GET /api/chores': () => jsonResponse(chores) })
  render(<App today={TODAY} />)
  await waitDashboard()
  return mock
}

/** 카드(편집 영역)를 눌러 편집 화면을 연다. 이제 한 집안일은 한 영역에만 나온다. */
async function openCard(user: UserEvent, name: string) {
  await user.click(screen.getByRole('button', { name: new RegExp(`^${name} .* 편집$`) }))
  expect(screen.getByRole('heading', { name: '집안일 편집' })).toBeTruthy()
}

/** 하단 고정 "+" 버튼. 집안일이 0개일 때는 안내 상자에도 같은 이름의 버튼이 있으므로 마지막 것을 쓴다. */
function fab(): HTMLElement {
  const buttons = screen.getAllByRole('button', { name: '집안일 추가' })
  return buttons[buttons.length - 1]
}

const PICKER_TITLE = '어떤 집안일을 추가할까요?'

/** "+"를 눌러 기본 목록 선택 화면을 연다. */
async function openPicker(user: UserEvent) {
  await user.click(fab())
  expect(screen.getByRole('heading', { name: PICKER_TITLE })).toBeTruthy()
}

/** 선택 화면에서 "직접 입력"을 눌러 빈 추가 폼을 연다. */
async function openAddForm(user: UserEvent) {
  await openPicker(user)
  await user.click(screen.getByRole('button', { name: '직접 입력' }))
  expect(screen.getByRole('heading', { name: '집안일 추가' })).toBeTruthy()
}

describe('대시보드', () => {
  it('오늘 날짜와 요약을 "오늘 할 일 N개 (밀린 일 M개 포함)"으로 보여준다', async () => {
    await renderDashboard()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('10월 14일 (수)')
    expect(screen.getByTestId('summary').textContent).toBe('오늘 할 일 3개 (밀린 일 2개 포함)')
    expect(screen.getByTestId('summary').querySelector('.summary__overdue')?.textContent).toBe('밀린 일 2개')
  })

  it('밀린 일이 없으면 괄호 부분을 뺀다', async () => {
    await renderDashboard([record('b', '걸레질', 3, '2026-10-11'), record('c', '냉장고 청소', 30, '2026-10-01')])
    expect(screen.getByTestId('summary').textContent).toBe('오늘 할 일 1개')
  })

  it('오늘 할 일은 밀린 일 먼저, 그 밖의 집안일은 오늘 할 일을 빼고 남은 일수 순으로 보여준다', async () => {
    rememberLaterOpen()
    await renderDashboard()
    expect(cardNames(section('오늘 할 일'))).toEqual(['분리수거', '화분 물주기', '걸레질'])
    expect(cardNames(section('그 밖의 집안일'))).toEqual(['이불 빨래', '냉장고 청소'])
    // 같은 집안일이 두 번 나오지 않는다.
    expect(screen.getAllByRole('listitem')).toHaveLength(CHORES.length)
  })

  it('모든 집안일이 오늘 할 일이면 그 밖의 집안일 영역을 숨긴다', async () => {
    await renderDashboard([record('a', '화분 물주기', 7, '2026-10-05'), record('b', '걸레질', 3, '2026-10-11')])
    expect(cardNames(section('오늘 할 일'))).toEqual(['화분 물주기', '걸레질'])
    expect(screen.queryByRole('region', { name: '그 밖의 집안일' })).toBeNull()
  })

  it('지연 카드에 D+n 배지, 경고 표시, 강조가 붙고, 게이지 값이 상태에 맞다', async () => {
    rememberLaterOpen()
    await renderDashboard()
    const todaySection = section('오늘 할 일')
    const others = section('그 밖의 집안일')

    const overdue = cardOf(todaySection, '화분 물주기')
    expect(overdue.getAttribute('data-status')).toBe('overdue')
    expect(overdue.className).toContain('chore-card--overdue')
    expect(within(overdue).getByText('D+2')).toBeTruthy()
    // 색 없이도 알 수 있는 단서: 배지 안 "!" 표시와 읽기용 "2일 지남"
    expect(overdue.querySelector('.badge__alert')?.textContent).toBe('!')
    expect(within(overdue).getByRole('button', { name: '화분 물주기 7일마다 D+2 (2일 지남) 편집' })).toBeTruthy()
    // 게이지 슬라이더는 0~주기 범위라 지연이면 0이고, 읽기용 값으로 지난 날수를 알린다.
    const overdueGauge = within(overdue).getByRole('slider', { name: '화분 물주기 남은 일수' })
    expect(overdueGauge.getAttribute('aria-valuenow')).toBe('0')
    expect(overdueGauge.getAttribute('aria-valuetext')).toBe('2일 지남')
    expect(within(overdue).getByText('🪴')).toBeTruthy()

    const today = cardOf(todaySection, '걸레질')
    expect(today.getAttribute('data-status')).toBe('today')
    expect(within(today).getByText('D-Day')).toBeTruthy()
    expect(today.querySelector('.badge__alert')).toBeNull()

    const soon = cardOf(others, '이불 빨래')
    expect(soon.getAttribute('data-status')).toBe('soon')
    expect(within(soon).getByText('D-1')).toBeTruthy()

    const ok = cardOf(others, '냉장고 청소')
    expect(ok.getAttribute('data-status')).toBe('ok')
    expect(within(ok).getByText('D-17')).toBeTruthy()
    const okGauge = within(ok).getByRole('slider')
    expect(okGauge.getAttribute('aria-valuemin')).toBe('0')
    expect(okGauge.getAttribute('aria-valuemax')).toBe('30')
    expect(okGauge.getAttribute('aria-valuenow')).toBe('17')
    expect(okGauge.getAttribute('aria-valuetext')).toBe('17일 남음')
    // 17 / 30 = 56.67%: 채움은 transform으로 움직인다.
    const fill = ok.querySelector<HTMLElement>('.gauge__fill')
    expect(fill?.style.transform).toMatch(/^translateX\(-43\.33\d*%\)$/)
  })

  it('이름 옆에 주기를 표시한다: 1일은 "매일", 나머지는 "N일마다"', async () => {
    rememberLaterOpen()
    await renderDashboard([
      record('a', '설거지', 1, '2026-10-14'),
      record('b', '화분 물주기', 7, '2026-10-12'),
      record('c', '이불 빨래', 14, '2026-10-12'),
      record('d', '아주 아주 긴 이름의 집안일 베란다 창틀 먼지 닦기', 30, '2026-10-12'),
    ])
    const others = section('그 밖의 집안일')
    const intervalOf = (name: string) => cardOf(others, name).querySelector('.chore-card__interval')?.textContent
    expect(intervalOf('설거지')).toBe('· 매일')
    expect(intervalOf('화분 물주기')).toBe('· 7일마다')
    expect(intervalOf('이불 빨래')).toBe('· 14일마다')
    // 이름과 주기는 따로 있어서 이름만 말줄임된다.
    const long = cardOf(others, '아주 아주 긴 이름의 집안일 베란다 창틀 먼지 닦기')
    expect(long.querySelector('.chore-card__name')?.textContent).toBe('아주 아주 긴 이름의 집안일 베란다 창틀 먼지 닦기')
    expect(long.querySelector('.chore-card__interval')?.textContent).toBe('· 30일마다')
    // 편집 버튼의 읽기용 이름에도 주기가 들어가고, "… 편집" 형태는 그대로다.
    expect(within(cardOf(others, '설거지')).getByRole('button', { name: '설거지 매일 D-1 편집' })).toBeTruthy()
    expect(within(cardOf(others, '이불 빨래')).getByRole('button', { name: /^이불 빨래 .* 편집$/ })).toBeTruthy()
  })

  it('완료 체크 버튼이 켜져 있고, 카드에 편집 단서(">")가 있다', async () => {
    await renderDashboard()
    const card = cardOf(section('오늘 할 일'), '걸레질')
    const check = within(card).getByRole('button', { name: '걸레질 완료 체크' }) as HTMLButtonElement
    expect(check.disabled).toBe(false)
    const edit = within(card).getByRole('button', { name: '걸레질 3일마다 D-Day 편집' })
    expect(edit.querySelector('.chore-card__chevron')?.textContent).toBe('›')
  })

  it('오늘 할 일이 없으면 빈 상태 문구를 보여준다', async () => {
    await renderDashboard([record('c', '냉장고 청소', 30, '2026-10-01'), record('f', '이불 빨래', 14, '2026-10-01')])
    expect(within(section('오늘 할 일')).getByText(/오늘 할 일이 없어요/)).toBeTruthy()
    expect(cardNames(section('그 밖의 집안일'))).toEqual(['이불 빨래'])
    expect(screen.getByTestId('summary').textContent).toBe('오늘 할 일 0개')
  })

  it('집안일이 하나도 없으면 안내 상자 하나와 집안일 추가 버튼만 보여준다', async () => {
    const user = userEvent.setup()
    await renderDashboard([])
    expect(screen.getByText('첫 집안일을 등록해 보세요')).toBeTruthy()
    expect(screen.queryByText(/오늘 할 일이 없어요/)).toBeNull()
    expect(screen.queryByRole('region', { name: '오늘 할 일' })).toBeNull()
    expect(screen.queryByRole('region', { name: '그 밖의 집안일' })).toBeNull()

    const buttons = screen.getAllByRole('button', { name: '집안일 추가' })
    expect(buttons).toHaveLength(2) // 안내 상자 버튼 + 하단 "+"
    await user.click(buttons[0])
    // 기본 목록 선택 화면이 먼저 열린다.
    expect(screen.getByRole('heading', { name: PICKER_TITLE })).toBeTruthy()
  })

  it('로딩 후 API 오류를 한국어 안내와 작은 기술 정보로 보여주고 다시 시도할 수 있다', async () => {
    let fail = true
    const { calls } = mockFetch({
      'GET /api/chores': () => (fail ? jsonResponse({ detail: '서버 고장' }, 500) : jsonResponse(CHORES)),
    })
    render(<App today={TODAY} />)
    expect(screen.getByRole('status').textContent).toContain('불러오는 중')

    const alert = await screen.findByRole('alert')
    expect(alert.querySelector('.error-notice__title')?.textContent).toBe('목록을 불러오지 못했어요.')
    expect(alert.querySelector('.error-notice__hint')?.textContent).toBe(
      'PC 서버가 켜져 있는지, 집 Wi-Fi에 연결돼 있는지 확인한 뒤 다시 시도해 주세요.',
    )
    expect(alert.querySelector('.error-notice__detail')?.textContent).toBe('오류 코드 500 · 서버 고장')

    const retry = within(alert).getByRole('button', { name: '다시 시도' })
    expect(retry.className).toContain('button--primary')

    fail = false
    await userEvent.setup().click(retry)
    await waitDashboard()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(calls.filter((c) => c.method === 'GET')).toHaveLength(2)
  })
})

describe('오늘 날짜 갱신 (U1)', () => {
  // 10/13 기준: 화분 물주기 D-Day, 걸레질 D-1 → 10/14 기준: 화분 물주기 D+1, 걸레질 D-Day
  const DAY_CHORES = [record('a', '화분 물주기', 7, '2026-10-06'), record('b', '걸레질', 3, '2026-10-11')]

  function expectOct13() {
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('10월 13일 (화)')
    expect(screen.getByTestId('summary').textContent).toBe('오늘 할 일 1개')
    expect(cardNames(section('오늘 할 일'))).toEqual(['화분 물주기'])
    expect(cardNames(section('그 밖의 집안일'))).toEqual(['걸레질'])
  }

  it('로컬 자정이 지나면 새로고침 없이 날짜, 요약, 배지, 영역이 바뀐다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 9, 13, 23, 59, 58))
    const { calls } = mockFetch({ 'GET /api/chores': () => jsonResponse(DAY_CHORES) })
    render(<App />)
    await waitDashboard()
    expectOct13()

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('10월 14일 (수)')
    expect(screen.getByTestId('summary').textContent).toBe('오늘 할 일 2개 (밀린 일 1개 포함)')
    expect(cardNames(section('오늘 할 일'))).toEqual(['화분 물주기', '걸레질'])
    expect(within(section('오늘 할 일')).getByText('D+1')).toBeTruthy()
    expect(within(section('오늘 할 일')).getByText('D-Day')).toBeTruthy()
    expect(screen.queryByRole('region', { name: '그 밖의 집안일' })).toBeNull()
    // 상태 계산은 화면에서 하므로 목록을 다시 받지 않는다.
    expect(calls).toHaveLength(1)
  })

  it('앱이 다시 앞으로 오면(visibilitychange, focus) 바뀐 날짜로 다시 계산한다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 9, 13, 12, 0, 0))
    const { calls } = mockFetch({ 'GET /api/chores': () => jsonResponse(DAY_CHORES) })
    render(<App />)
    await waitDashboard()
    expectOct13()

    // 휴대폰이 잠들어 타이머가 돌지 않은 채로 다음 날 아침이 된 상황
    vi.setSystemTime(new Date(2026, 9, 14, 7, 30, 0))
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('10월 14일 (수)')
    expect(screen.getByTestId('summary').textContent).toBe('오늘 할 일 2개 (밀린 일 1개 포함)')

    vi.setSystemTime(new Date(2026, 9, 15, 7, 30, 0))
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('10월 15일 (목)')
    expect(screen.getByTestId('summary').textContent).toBe('오늘 할 일 2개 (밀린 일 2개 포함)')
    expect(within(section('오늘 할 일')).getByText('D+2')).toBeTruthy()
    expect(within(section('오늘 할 일')).getByText('D+1')).toBeTruthy()
    expect(calls).toHaveLength(1)
  })
})

describe('완료 체크 (F3)', () => {
  // 카드가 모두 보이는 상태에서 확인한다. 접힌 "나중에 할 일"과의 경계는 아래 '나중에 할 일 접기'에서 따로 본다.
  beforeEach(rememberLaterOpen)

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

  function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((r) => {
      resolve = r
    })
    return { promise, resolve }
  }

  /** 서버가 돌려줄 완료 응답: 마지막 수행일이 오늘로 바뀐 집안일과 완료 기록 */
  function completed(chore: ChoreRecord, completionId: string) {
    return {
      completion: {
        id: completionId,
        choreId: chore.id,
        doneAt: '2026-10-14T00:00:00Z',
        doneOn: TODAY,
        dueOn: '2026-10-12',
        previousLastDoneAt: chore.lastDoneAt,
        deletedAt: null,
      },
      chore: { ...chore, lastDoneAt: TODAY, updatedAt: '2026-10-14T00:00:00Z' },
    }
  }

  function checkButton(region: HTMLElement, name: string): HTMLButtonElement {
    return within(cardOf(region, name)).getByRole('button', { name: new RegExp(`^${name} (완료 체크|오늘 완료함)$`) })
  }

  function badgeOf(region: HTMLElement, name: string): string {
    return cardOf(region, name).querySelector('.badge__text')?.textContent ?? ''
  }

  function gaugeOf(region: HTMLElement, name: string): string | null {
    return within(cardOf(region, name)).getByRole('slider').getAttribute('aria-valuenow')
  }

  const WATERING = CHORES[1] // 화분 물주기, D+2

  it('체크하면 카드가 바로 바뀌고(낙관적 갱신), 서버 응답으로 확정한 뒤 실행 취소 알림을 띄운다', async () => {
    const user = userEvent.setup()
    const response = deferred<Response>()
    const { calls } = mockFetch({
      'GET /api/chores': () => jsonResponse(CHORES),
      'POST /api/chores/a/completions': () => response.promise,
    })
    render(<App today={TODAY} />)
    await waitDashboard()
    const todaySection = section('오늘 할 일')
    expect(badgeOf(todaySection, '화분 물주기')).toBe('D+2')

    await user.click(checkButton(todaySection, '화분 물주기'))

    // 응답 전: 카드가 바로 그 밖의 집안일의 제자리로 가고, 게이지가 차고 배지가 바뀌고,
    // 버튼은 "오늘 완료함"으로 눌리지 않는다.
    const others = section('그 밖의 집안일')
    expect(cardNames(others)).toEqual(['이불 빨래', '화분 물주기', '냉장고 청소'])
    expect(badgeOf(others, '화분 물주기')).toBe('D-7')
    expect(gaugeOf(others, '화분 물주기')).toBe('7')
    const check = checkButton(others, '화분 물주기')
    expect(check.getAttribute('aria-label')).toBe('화분 물주기 오늘 완료함')
    expect(check.disabled).toBe(true)
    // 요약은 바로 바뀐다.
    expect(screen.getByTestId('summary').textContent).toBe('오늘 할 일 2개 (밀린 일 1개 포함)')
    expect(screen.queryByTestId('undo-toast')).toBeNull()

    const post = calls.find((c) => c.method === 'POST')
    expect(post?.url).toBe('/api/chores/a/completions')
    const body = post?.body as { id: string; doneOn?: string }
    expect(body.id).toMatch(UUID_RE)
    expect(body.doneOn).toBeUndefined()

    response.resolve(jsonResponse(completed(WATERING, body.id), 201))
    const toast = await screen.findByTestId('undo-toast')
    expect(toast.querySelector('.toast__text')?.textContent).toBe('화분 물주기 완료')
    expect(within(toast).getByRole('button', { name: '실행 취소' })).toBeTruthy()
    expect(badgeOf(section('그 밖의 집안일'), '화분 물주기')).toBe('D-7')
    // 알림은 하단 막대 안, "+" 버튼과 같은 줄의 왼쪽에 있다.
    expect(toast.closest('.bottom-bar__inner')?.contains(fab())).toBe(true)
  })

  it('저장에 실패하면 원래 상태로 되돌리고 오류를 알린다', async () => {
    const user = userEvent.setup()
    mockFetch({
      'GET /api/chores': () => jsonResponse(CHORES),
      'POST /api/chores/a/completions': () => jsonResponse({ detail: '서버 고장' }, 500),
    })
    render(<App today={TODAY} />)
    await waitDashboard()
    const todaySection = section('오늘 할 일')

    await user.click(checkButton(todaySection, '화분 물주기'))

    const alert = await screen.findByRole('alert')
    expect(alert.querySelector('.error-notice__title')?.textContent).toBe('완료 체크를 저장하지 못했어요.')
    expect(alert.querySelector('.error-notice__detail')?.textContent).toBe('오류 코드 500 · 서버 고장')
    expect(badgeOf(todaySection, '화분 물주기')).toBe('D+2')
    expect(checkButton(todaySection, '화분 물주기').disabled).toBe(false)
    expect(screen.getByTestId('summary').textContent).toBe('오늘 할 일 3개 (밀린 일 2개 포함)')
    expect(screen.queryByTestId('undo-toast')).toBeNull()

    await user.click(within(alert).getByRole('button', { name: '닫기' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('실행 취소를 누르면 같은 완료 기록을 DELETE하고 원래 상태로 돌아간다', async () => {
    const user = userEvent.setup()
    const { calls } = mockFetch({
      'GET /api/chores': () => jsonResponse(CHORES),
      'POST /api/chores/a/completions': (call) =>
        jsonResponse(completed(WATERING, (call.body as { id: string }).id), 201),
    })
    render(<App today={TODAY} />)
    await waitDashboard()
    const todaySection = section('오늘 할 일')

    await user.click(checkButton(todaySection, '화분 물주기'))
    const toast = await screen.findByTestId('undo-toast')
    const post = calls.find((c) => c.method === 'POST')
    if (!post) throw new Error('POST가 없음')
    const completionId = (post.body as { id: string }).id
    // DELETE 경로는 완료 id로 정해지므로 여기서 등록한다.
    const undo = deferred<Response>()
    const { calls: undoCalls } = mockFetch({ [`DELETE /api/completions/${completionId}`]: () => undo.promise })

    await user.click(within(toast).getByRole('button', { name: '실행 취소' }))

    expect(screen.queryByTestId('undo-toast')).toBeNull()
    expect(undoCalls.map((c) => `${c.method} ${c.url}`)).toEqual([`DELETE /api/completions/${completionId}`])
    // 응답 전에도 원래 배지로 돌아가고, 요청이 끝날 때까지 체크 버튼은 눌리지 않는다.
    expect(badgeOf(todaySection, '화분 물주기')).toBe('D+2')
    expect(checkButton(todaySection, '화분 물주기').disabled).toBe(true)

    undo.resolve(jsonResponse(WATERING))
    await waitFor(() => expect(checkButton(todaySection, '화분 물주기').disabled).toBe(false))
    expect(badgeOf(todaySection, '화분 물주기')).toBe('D+2')
    expect(cardNames(section('오늘 할 일'))).toEqual(['분리수거', '화분 물주기', '걸레질'])
    expect(screen.getByTestId('summary').textContent).toBe('오늘 할 일 3개 (밀린 일 2개 포함)')
  })

  it('요청이 진행 중이면 같은 카드를 다시 눌러도 요청을 또 보내지 않는다', async () => {
    const response = deferred<Response>()
    // 오늘 이미 완료 표시가 되지 않는 경우(마지막 수행일이 미래)에도 진행 중에는 막는다.
    const future = record('g', '가습기 청소', 3, '2026-10-20')
    const { calls } = mockFetch({
      'GET /api/chores': () => jsonResponse([...CHORES, future]),
      'POST /api/chores/a/completions': () => response.promise,
      'POST /api/chores/g/completions': () => response.promise,
    })
    render(<App today={TODAY} />)
    await waitDashboard()

    const watering = checkButton(section('오늘 할 일'), '화분 물주기')
    fireEvent.click(watering)
    fireEvent.click(watering)
    const humidifier = checkButton(section('그 밖의 집안일'), '가습기 청소')
    fireEvent.click(humidifier)
    expect(humidifier.disabled).toBe(true)
    expect(humidifier.getAttribute('aria-busy')).toBe('true')
    fireEvent.click(humidifier)

    expect(calls.filter((c) => c.method === 'POST').map((c) => c.url)).toEqual([
      '/api/chores/a/completions',
      '/api/chores/g/completions',
    ])
  })

  it('오늘 이미 완료한 집안일은 "오늘 완료함"으로 보이고 눌리지 않는다', async () => {
    const { calls } = await renderDashboard([...CHORES, record('d', '설거지', 2, TODAY)])
    const check = checkButton(section('그 밖의 집안일'), '설거지')
    expect(check.getAttribute('aria-label')).toBe('설거지 오늘 완료함')
    expect(check.disabled).toBe(true)
    expect(check.className).toContain('chore-card__check--done')
    fireEvent.click(check)
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('체크하면 실행 취소 알림이 떠 있어도 카드가 바로 남은 일수 순서의 제자리로 옮겨진다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mockFetch({
      'GET /api/chores': () => jsonResponse(CHORES),
      'POST /api/chores/e/completions': (call) =>
        jsonResponse(completed(CHORES[4], (call.body as { id: string }).id), 201),
      'POST /api/chores/b/completions': (call) =>
        jsonResponse(completed(CHORES[3], (call.body as { id: string }).id), 201),
    })
    render(<App today={TODAY} />)
    await waitDashboard()
    expect(cardNames(section('오늘 할 일'))).toEqual(['분리수거', '화분 물주기', '걸레질'])

    // 연달아 두 개를 완료한다. 알림은 마지막 것만 보인다.
    await user.click(checkButton(section('오늘 할 일'), '분리수거'))
    // 응답을 기다리기 전에 이미 옮겨져 있다.
    expect(cardNames(section('오늘 할 일'))).toEqual(['화분 물주기', '걸레질'])
    expect(cardNames(section('그 밖의 집안일'))).toEqual(['이불 빨래', '분리수거', '냉장고 청소'])
    await screen.findByText('분리수거 완료')

    await user.click(checkButton(section('오늘 할 일'), '걸레질'))
    await screen.findByText('걸레질 완료')
    expect(screen.queryByText('분리수거 완료')).toBeNull()

    // 알림이 떠 있는 동안에도 배치는 지금 값(남은 일수 순: D-1, D-3, D-7, D-17) 기준이다.
    expect(cardNames(section('오늘 할 일'))).toEqual(['화분 물주기'])
    expect(cardNames(section('그 밖의 집안일'))).toEqual(['이불 빨래', '걸레질', '분리수거', '냉장고 청소'])
    expect(badgeOf(section('그 밖의 집안일'), '분리수거')).toBe('D-7')
    expect(badgeOf(section('그 밖의 집안일'), '걸레질')).toBe('D-3')
    expect(screen.getByTestId('summary').textContent).toBe('오늘 할 일 1개 (밀린 일 1개 포함)')
    expect(screen.getByTestId('undo-toast')).toBeTruthy()

    // 알림이 닫혀도 배치는 그대로다(한꺼번에 옮겨지지 않는다).
    act(() => {
      vi.advanceTimersByTime(UNDO_TOAST_MS + 100)
    })
    expect(screen.queryByTestId('undo-toast')).toBeNull()
    expect(cardNames(section('오늘 할 일'))).toEqual(['화분 물주기'])
    expect(cardNames(section('그 밖의 집안일'))).toEqual(['이불 빨래', '걸레질', '분리수거', '냉장고 청소'])
  })

  describe('위치 이동 애니메이션', () => {
    let now = 1000
    const animate = vi.fn(() => ({ cancel() {} }) as unknown as Animation)

    /** 카드 높이 100px로 문서 순서대로 쌓인 것처럼 위치를 돌려준다. */
    function fakeLayout() {
      vi.spyOn(performance, 'now').mockImplementation(() => now)
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        const index = Array.from(document.querySelectorAll('li.chore-card')).indexOf(this)
        return { x: 0, y: index * 100, left: 0, top: index * 100, width: 300, height: 90, right: 300, bottom: index * 100 + 90 } as DOMRect
      })
      Object.defineProperty(HTMLElement.prototype, 'animate', { value: animate, configurable: true, writable: true })
    }

    afterEach(() => {
      delete (HTMLElement.prototype as Partial<HTMLElement>).animate
      animate.mockClear()
      now = 1000
    })

    it('옮겨 간 카드는 이전 자리에서 미끄러져 오고, 움직이는 동안(250ms)은 그 카드의 체크를 받지 않는다', async () => {
      fakeLayout()
      const { calls } = mockFetch({
        'GET /api/chores': () => jsonResponse(CHORES),
        'POST /api/chores/e/completions': (call) =>
          jsonResponse(completed(CHORES[4], (call.body as { id: string }).id), 201),
        'POST /api/chores/a/completions': (call) =>
          jsonResponse(completed(WATERING, (call.body as { id: string }).id), 201),
      })
      render(<App today={TODAY} />)
      await waitDashboard()
      // 처음 나타날 때는 떠오르는 효과만 있다(카드 + 맨 아래 "접기" 버튼).
      expect(animate).toHaveBeenCalledTimes(CHORES.length + 1)
      animate.mockClear()

      fireEvent.click(checkButton(section('오늘 할 일'), '분리수거'))
      await screen.findByText('분리수거 완료')
      // 분리수거(0→3번째), 화분 물주기(1→0), 걸레질(2→1), 이불 빨래(3→2)가 옮겨졌다. 냉장고 청소는 그대로다.
      expect(animate).toHaveBeenCalledTimes(4)
      expect(animate).toHaveBeenCalledWith(
        [{ transform: 'translate(0px, 100px)' }, { transform: 'none' }],
        expect.objectContaining({ duration: MOVE_MS }),
      )

      // 손가락 아래로 미끄러져 온 화분 물주기를 바로 눌러도 무시한다.
      fireEvent.click(checkButton(section('오늘 할 일'), '화분 물주기'))
      expect(calls.filter((c) => c.method === 'POST').map((c) => c.url)).toEqual(['/api/chores/e/completions'])

      // 이동이 끝나면 누를 수 있다.
      now += MOVE_MS + 1
      fireEvent.click(checkButton(section('오늘 할 일'), '화분 물주기'))
      expect(calls.filter((c) => c.method === 'POST').map((c) => c.url)).toEqual([
        '/api/chores/e/completions',
        '/api/chores/a/completions',
      ])
      await screen.findByText('화분 물주기 완료')
    })

    it('움직임 줄이기 설정이면 애니메이션을 하지 않는다', async () => {
      fakeLayout()
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query }))
      mockFetch({
        'GET /api/chores': () => jsonResponse(CHORES),
        'POST /api/chores/e/completions': (call) =>
          jsonResponse(completed(CHORES[4], (call.body as { id: string }).id), 201),
      })
      render(<App today={TODAY} />)
      await waitDashboard()
      fireEvent.click(checkButton(section('오늘 할 일'), '분리수거'))
      await screen.findByText('분리수거 완료')
      expect(animate).not.toHaveBeenCalled()
    })
  })
})

describe('나중에 할 일 접기 (남은 일수 7일 이상)', () => {
  // TODAY(10/14) 기준 남은 일수
  const LATER_CHORES = [
    record('t', '걸레질', 3, '2026-10-11'), // 0, 오늘 할 일
    record('s', '먼지 털기', 7, '2026-10-13'), // 6
    record('l', '물걸레질', 10, '2026-10-11'), // 7
    record('c', '냉장고 청소', 30, '2026-10-01'), // 17
  ]

  function toastDetail(): string | null {
    return screen.getByTestId('undo-toast').querySelector('.toast__detail')?.textContent ?? null
  }

  it('기준값은 7일이고, 남은 일수 6은 보이고 7 이상은 접혀서 "나중에 할 일 N개 더 보기"만 보인다', async () => {
    expect(LATER_THRESHOLD_DAYS).toBe(7)
    await renderDashboard(LATER_CHORES)
    const others = section('그 밖의 집안일')
    expect(cardNames(others)).toEqual(['먼지 털기'])
    expect(screen.queryByText('물걸레질')).toBeNull()
    const toggle = laterToggle()
    expect(toggle.textContent).toBe('나중에 할 일 2개 더 보기')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    // 버튼은 영역 맨 아래에 있다.
    expect(others.lastElementChild).toBe(toggle)
    // 요약은 숨김과 관계없다.
    expect(screen.getByTestId('summary').textContent).toBe('오늘 할 일 1개')
  })

  it('펼치면 같은 정렬 순서로 이어서 보이고 "접기"로 바뀌며, 다시 접을 수 있다. 상태를 기기에 기억한다', async () => {
    const user = userEvent.setup()
    await renderDashboard(LATER_CHORES)
    await user.click(laterToggle())
    expect(cardNames(section('그 밖의 집안일'))).toEqual(['먼지 털기', '물걸레질', '냉장고 청소'])
    expect(laterToggle().textContent).toBe('접기')
    expect(laterToggle().getAttribute('aria-expanded')).toBe('true')
    expect(localStorage.getItem(LATER_OPEN_STORAGE_KEY)).toBe('1')

    await user.click(laterToggle())
    expect(cardNames(section('그 밖의 집안일'))).toEqual(['먼지 털기'])
    expect(laterToggle().textContent).toBe('나중에 할 일 2개 더 보기')
    expect(localStorage.getItem(LATER_OPEN_STORAGE_KEY)).toBe('0')
  })

  it('기억해 둔 펼침 상태로 시작한다', async () => {
    rememberLaterOpen()
    await renderDashboard(LATER_CHORES)
    expect(cardNames(section('그 밖의 집안일'))).toEqual(['먼지 털기', '물걸레질', '냉장고 청소'])
    expect(laterToggle().textContent).toBe('접기')
  })

  it('저장소를 쓸 수 없으면 접힌 상태로 시작하고, 펼치기는 오류 없이 동작한다', async () => {
    const user = userEvent.setup()
    rememberLaterOpen()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    await renderDashboard(LATER_CHORES)
    expect(cardNames(section('그 밖의 집안일'))).toEqual(['먼지 털기'])
    await user.click(laterToggle())
    expect(cardNames(section('그 밖의 집안일'))).toEqual(['먼지 털기', '물걸레질', '냉장고 청소'])
  })

  it('그 밖의 집안일이 모두 7일 이상이면 영역에 버튼만 보이고, 7일 이상이 없으면 버튼을 숨긴다', async () => {
    await renderDashboard([LATER_CHORES[0], LATER_CHORES[2], LATER_CHORES[3]])
    const others = section('그 밖의 집안일')
    expect(within(others).queryAllByRole('listitem')).toHaveLength(0)
    expect(laterToggle().textContent).toBe('나중에 할 일 2개 더 보기')
    cleanup()

    await renderDashboard([LATER_CHORES[0], LATER_CHORES[1]])
    expect(cardNames(section('그 밖의 집안일'))).toEqual(['먼지 털기'])
    expect(within(section('그 밖의 집안일')).queryByRole('button', { name: /더 보기|접기/ })).toBeNull()
    cleanup()

    // 펼친 상태에서도 7일 이상이 0개면 "접기"를 보이지 않는다.
    rememberLaterOpen()
    await renderDashboard([LATER_CHORES[0], LATER_CHORES[1]])
    expect(within(section('그 밖의 집안일')).queryByRole('button', { name: /더 보기|접기/ })).toBeNull()
  })

  it('게이지로 7일 이상이 되면 접힌 영역으로 들어가고, 알림에 "나중에 할 일로 이동"이 붙는다. 실행 취소하면 다시 보인다', async () => {
    const user = userEvent.setup()
    const { calls } = mockFetch({
      'GET /api/chores': () => jsonResponse(LATER_CHORES),
      'PATCH /api/chores/s': (call) => jsonResponse({ ...LATER_CHORES[1], ...(call.body as object) }),
    })
    render(<App today={TODAY} />)
    await waitDashboard()
    const slider = within(cardOf(section('그 밖의 집안일'), '먼지 털기')).getByRole('slider')
    slider.focus()
    await user.keyboard('{ArrowRight}{Enter}')

    expect(calls.filter((c) => c.method === 'PATCH').map((c) => c.body)).toEqual([{ lastDoneAt: '2026-10-14' }])
    // 낙관적 갱신으로 바로 접힌 영역에 들어가고, 버튼 개수가 늘고 한 번 반짝인다.
    expect(within(section('그 밖의 집안일')).queryAllByRole('listitem')).toHaveLength(0)
    expect(laterToggle().textContent).toBe('나중에 할 일 3개 더 보기')
    expect(laterToggle().querySelector('.later-toggle__label--arrived')).toBeTruthy()
    await screen.findByText('먼지 털기 → D-7')
    expect(toastDetail()).toBe('나중에 할 일로 이동')
    expect(screen.getByTestId('summary').textContent).toBe('오늘 할 일 1개')

    await user.click(within(screen.getByTestId('undo-toast')).getByRole('button', { name: '실행 취소' }))
    expect(cardNames(section('그 밖의 집안일'))).toEqual(['먼지 털기'])
    expect(laterToggle().textContent).toBe('나중에 할 일 2개 더 보기')
  })

  it('완료 체크로 7일 이상이 되는 카드도 접힌 영역으로 들어가고 알림에 표시된다', async () => {
    const user = userEvent.setup()
    mockFetch({
      'GET /api/chores': () => jsonResponse(LATER_CHORES),
      'POST /api/chores/t/completions': (call) =>
        jsonResponse(
          {
            completion: {
              id: (call.body as { id: string }).id,
              choreId: 't',
              doneAt: '2026-10-14T00:00:00Z',
              doneOn: TODAY,
              dueOn: TODAY,
              previousLastDoneAt: '2026-10-11',
              deletedAt: null,
            },
            chore: { ...LATER_CHORES[0], intervalDays: 3, lastDoneAt: TODAY },
          },
          201,
        ),
    })
    render(<App today={TODAY} />)
    await waitDashboard()
    // 걸레질은 주기 3일이라 완료해도 D-3: 접히지 않고 알림에도 붙지 않는다.
    await user.click(within(cardOf(section('오늘 할 일'), '걸레질')).getByRole('button', { name: '걸레질 완료 체크' }))
    await screen.findByText('걸레질 완료')
    expect(toastDetail()).toBeNull()
    expect(cardNames(section('그 밖의 집안일'))).toEqual(['걸레질', '먼지 털기'])
    expect(laterToggle().querySelector('.later-toggle__label--arrived')).toBeNull()
  })

  it('주기 7일 이상인 오늘 할 일을 완료하면 접힌 영역으로 들어간다. 펼친 상태에서는 그대로 보이고 알림에 붙지 않는다', async () => {
    const user = userEvent.setup()
    const watering = record('a', '화분 물주기', 7, '2026-10-05') // D+2 → 완료하면 D-7
    const route = (call: { body: unknown }) =>
      jsonResponse(
        {
          completion: {
            id: (call.body as { id: string }).id,
            choreId: 'a',
            doneAt: '2026-10-14T00:00:00Z',
            doneOn: TODAY,
            dueOn: '2026-10-12',
            previousLastDoneAt: '2026-10-05',
            deletedAt: null,
          },
          chore: { ...watering, lastDoneAt: TODAY },
        },
        201,
      )
    mockFetch({ 'GET /api/chores': () => jsonResponse([...LATER_CHORES, watering]), 'POST /api/chores/a/completions': route })
    render(<App today={TODAY} />)
    await waitDashboard()

    await user.click(within(cardOf(section('오늘 할 일'), '화분 물주기')).getByRole('button', { name: '화분 물주기 완료 체크' }))
    expect(screen.queryByText('화분 물주기')).toBeNull()
    expect(laterToggle().textContent).toBe('나중에 할 일 3개 더 보기')
    await screen.findByText('화분 물주기 완료')
    expect(toastDetail()).toBe('나중에 할 일로 이동')
    expect(screen.getByTestId('summary').textContent).toBe('오늘 할 일 1개')
    cleanup()

    rememberLaterOpen()
    mockFetch({ 'GET /api/chores': () => jsonResponse([...LATER_CHORES, watering]), 'POST /api/chores/a/completions': route })
    render(<App today={TODAY} />)
    await waitDashboard()
    await user.click(within(cardOf(section('오늘 할 일'), '화분 물주기')).getByRole('button', { name: '화분 물주기 완료 체크' }))
    expect(cardNames(section('그 밖의 집안일'))).toEqual(['먼지 털기', '물걸레질', '화분 물주기', '냉장고 청소'])
    await screen.findByText('화분 물주기 완료')
    expect(toastDetail()).toBeNull()
  })

  it('펼친 상태에서 게이지로 7일 미만이 되면 접어도 계속 보인다', async () => {
    const user = userEvent.setup()
    rememberLaterOpen()
    mockFetch({
      'GET /api/chores': () => jsonResponse(LATER_CHORES),
      'PATCH /api/chores/l': (call) => jsonResponse({ ...LATER_CHORES[2], ...(call.body as object) }),
    })
    render(<App today={TODAY} />)
    await waitDashboard()
    within(cardOf(section('그 밖의 집안일'), '물걸레질')).getByRole('slider').focus()
    await user.keyboard('{ArrowLeft}{Enter}')
    await screen.findByText('물걸레질 → D-6')
    expect(toastDetail()).toBeNull()
    expect(laterToggle().textContent).toBe('접기')

    await user.click(laterToggle())
    expect(cardNames(section('그 밖의 집안일'))).toEqual(['먼지 털기', '물걸레질'])
    expect(laterToggle().textContent).toBe('나중에 할 일 1개 더 보기')
  })
})

describe('게이지로 남은 일수 조절', () => {
  beforeEach(rememberLaterOpen)

  const FRIDGE = CHORES[0] // 냉장고 청소, 30일, D-17

  function sliderOf(region: HTMLElement, name: string): HTMLElement {
    return within(cardOf(region, name)).getByRole('slider')
  }

  function badgeText(region: HTMLElement, name: string): string {
    return cardOf(region, name).querySelector('.badge__text')?.textContent ?? ''
  }

  function patchRoute(base: ChoreRecord) {
    return (call: { body: unknown }) => jsonResponse({ ...base, ...(call.body as object), updatedAt: '2026-10-14T01:00:00Z' })
  }

  it('키보드 화살표로 1일씩 미리 보고, Enter로 PATCH { lastDoneAt }를 보낸 뒤 실행 취소 알림을 띄운다', async () => {
    const user = userEvent.setup()
    const { calls } = mockFetch({
      'GET /api/chores': () => jsonResponse(CHORES),
      'PATCH /api/chores/c': patchRoute(FRIDGE),
    })
    render(<App today={TODAY} />)
    await waitDashboard()
    const slider = sliderOf(section('그 밖의 집안일'), '냉장고 청소')
    expect(slider.getAttribute('aria-label')).toBe('냉장고 청소 남은 일수')

    slider.focus()
    await user.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}')
    // 미리 보기: 배지, 게이지 값, 읽기용 값이 바뀌고 아직 저장하지 않는다.
    expect(badgeText(section('그 밖의 집안일'), '냉장고 청소')).toBe('D-14')
    expect(slider.getAttribute('aria-valuenow')).toBe('14')
    expect(slider.getAttribute('aria-valuetext')).toBe('14일 남음')
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false)

    await user.keyboard('{Enter}')
    const patches = calls.filter((c) => c.method === 'PATCH')
    expect(patches).toHaveLength(1)
    expect(patches[0].url).toBe('/api/chores/c')
    // 새 마지막 수행일 = 오늘(10/14) − (30 − 14)일 = 9/28. 완료 기록은 만들지 않는다.
    expect(patches[0].body).toEqual({ lastDoneAt: '2026-09-28' })
    expect(calls.some((c) => c.method === 'POST')).toBe(false)

    const toast = await screen.findByTestId('undo-toast')
    expect(toast.querySelector('.toast__text')?.textContent).toBe('냉장고 청소 → D-14')
    expect(badgeText(section('그 밖의 집안일'), '냉장고 청소')).toBe('D-14')
    // 게이지를 눌러도 편집 화면으로 가지 않는다.
    expect(screen.queryByRole('heading', { name: '집안일 편집' })).toBeNull()
  })

  it('포커스가 빠지면 저장하고, 값이 그대로이거나 Esc로 취소하면 저장하지 않는다', async () => {
    const user = userEvent.setup()
    const { calls } = mockFetch({
      'GET /api/chores': () => jsonResponse(CHORES),
      'PATCH /api/chores/c': patchRoute(FRIDGE),
    })
    render(<App today={TODAY} />)
    await waitDashboard()
    const slider = sliderOf(section('그 밖의 집안일'), '냉장고 청소')

    // 바꿨다가 되돌리면 그대로다.
    slider.focus()
    await user.keyboard('{ArrowLeft}{ArrowRight}{Enter}')
    // 최댓값(주기)에서 더 올려도 그대로다.
    await user.keyboard('{End}')
    expect(slider.getAttribute('aria-valuenow')).toBe('30')
    await user.keyboard('{ArrowRight}{Escape}')
    expect(slider.getAttribute('aria-valuenow')).toBe('17')
    expect(badgeText(section('그 밖의 집안일'), '냉장고 청소')).toBe('D-17')
    await user.keyboard('{Enter}')
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false)

    await user.keyboard('{ArrowRight}')
    await user.tab()
    const patches = calls.filter((c) => c.method === 'PATCH')
    expect(patches.map((c) => c.body)).toEqual([{ lastDoneAt: '2026-10-02' }])
    await screen.findByText('냉장고 청소 → D-18')
  })

  it('지연 카드는 0(D-Day)부터 조절하고, 저장하면 남은 일수 순서의 제자리(다른 영역)로 옮겨진다', async () => {
    const user = userEvent.setup()
    const { calls } = mockFetch({
      'GET /api/chores': () => jsonResponse(CHORES),
      'PATCH /api/chores/a': patchRoute(CHORES[1]),
    })
    render(<App today={TODAY} />)
    await waitDashboard()
    const slider = sliderOf(section('오늘 할 일'), '화분 물주기')
    expect(slider.getAttribute('aria-valuenow')).toBe('0')

    slider.focus()
    // 0 아래(지연)로는 내려가지 않는다.
    await user.keyboard('{ArrowLeft}')
    expect(slider.getAttribute('aria-valuenow')).toBe('0')
    expect(badgeText(section('오늘 할 일'), '화분 물주기')).toBe('D-Day')
    await user.keyboard('{ArrowRight}{ArrowRight}{Enter}')

    expect(calls.filter((c) => c.method === 'PATCH').map((c) => c.body)).toEqual([{ lastDoneAt: '2026-10-09' }])
    // 낙관적 갱신으로 바로 옮겨진다.
    expect(cardNames(section('오늘 할 일'))).toEqual(['분리수거', '걸레질'])
    expect(cardNames(section('그 밖의 집안일'))).toEqual(['이불 빨래', '화분 물주기', '냉장고 청소'])
    expect(screen.getByTestId('summary').textContent).toBe('오늘 할 일 2개 (밀린 일 1개 포함)')
    await screen.findByText('화분 물주기 → D-2')
  })

  it('저장에 실패하면 원래대로 되돌리고 오류를 알린다', async () => {
    const user = userEvent.setup()
    mockFetch({
      'GET /api/chores': () => jsonResponse(CHORES),
      'PATCH /api/chores/c': () => jsonResponse({ detail: '서버 고장' }, 500),
    })
    render(<App today={TODAY} />)
    await waitDashboard()
    const slider = sliderOf(section('그 밖의 집안일'), '냉장고 청소')
    slider.focus()
    await user.keyboard('{Home}{Enter}')

    const alert = await screen.findByRole('alert')
    expect(alert.querySelector('.error-notice__title')?.textContent).toBe('남은 일수를 저장하지 못했어요.')
    expect(alert.querySelector('.error-notice__detail')?.textContent).toBe('오류 코드 500 · 서버 고장')
    expect(badgeText(section('그 밖의 집안일'), '냉장고 청소')).toBe('D-17')
    expect(sliderOf(section('그 밖의 집안일'), '냉장고 청소').getAttribute('aria-valuenow')).toBe('17')
    expect(cardNames(section('오늘 할 일'))).toEqual(['분리수거', '화분 물주기', '걸레질'])
    expect(screen.queryByTestId('undo-toast')).toBeNull()
  })

  it('실행 취소하면 원래 마지막 수행일로 PATCH한다', async () => {
    const user = userEvent.setup()
    const { calls } = mockFetch({
      'GET /api/chores': () => jsonResponse(CHORES),
      'PATCH /api/chores/c': patchRoute(FRIDGE),
    })
    render(<App today={TODAY} />)
    await waitDashboard()
    const slider = sliderOf(section('그 밖의 집안일'), '냉장고 청소')
    slider.focus()
    await user.keyboard('{ArrowLeft}{Enter}')
    const toast = await screen.findByTestId('undo-toast')

    await user.click(within(toast).getByRole('button', { name: '실행 취소' }))
    expect(screen.queryByTestId('undo-toast')).toBeNull()
    expect(calls.filter((c) => c.method === 'PATCH').map((c) => c.body)).toEqual([
      { lastDoneAt: '2026-09-30' },
      { lastDoneAt: '2026-10-01' },
    ])
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
    expect(badgeText(section('그 밖의 집안일'), '냉장고 청소')).toBe('D-17')
    await waitFor(() =>
      expect(sliderOf(section('그 밖의 집안일'), '냉장고 청소').getAttribute('aria-disabled')).toBeNull(),
    )
  })

  it('실행 취소 PATCH가 실패하면 조절한 값으로 되돌리고 오류를 알린다', async () => {
    const user = userEvent.setup()
    let fail = false
    mockFetch({
      'GET /api/chores': () => jsonResponse(CHORES),
      'PATCH /api/chores/c': (call) => (fail ? jsonResponse({ detail: '서버 고장' }, 500) : patchRoute(FRIDGE)(call)),
    })
    render(<App today={TODAY} />)
    await waitDashboard()
    sliderOf(section('그 밖의 집안일'), '냉장고 청소').focus()
    await user.keyboard('{ArrowLeft}{Enter}')
    const toast = await screen.findByTestId('undo-toast')
    fail = true
    await user.click(within(toast).getByRole('button', { name: '실행 취소' }))

    const alert = await screen.findByRole('alert')
    expect(alert.querySelector('.error-notice__title')?.textContent).toBe('실행 취소하지 못했어요.')
    expect(badgeText(section('그 밖의 집안일'), '냉장고 청소')).toBe('D-16')
  })

  it('가로로 끌면 손가락이 움직인 만큼 조절하고, 손을 떼면 저장한다. 편집 화면으로 가지 않는다', async () => {
    const { calls } = mockFetch({
      'GET /api/chores': () => jsonResponse(CHORES),
      'PATCH /api/chores/c': patchRoute(FRIDGE),
    })
    render(<App today={TODAY} />)
    await waitDashboard()
    const slider = sliderOf(section('그 밖의 집안일'), '냉장고 청소')
    // 트랙 폭 300px, 주기 30일 → 10px당 1일
    const track = slider.querySelector('.gauge') as HTMLElement
    track.getBoundingClientRect = () => ({ width: 300, height: 8, x: 0, y: 0, left: 0, top: 0, right: 300, bottom: 8 }) as DOMRect
    const pointer = { pointerId: 7, isPrimary: true, pointerType: 'touch' }

    fireEvent.pointerDown(slider, { ...pointer, clientX: 100, clientY: 20 })
    // 기준 거리(10px) 전에는 아무것도 바뀌지 않는다.
    fireEvent.pointerMove(slider, { ...pointer, clientX: 106, clientY: 21 })
    expect(slider.getAttribute('aria-valuenow')).toBe('17')
    fireEvent.pointerMove(slider, { ...pointer, clientX: 130, clientY: 22 })
    expect(slider.getAttribute('aria-valuenow')).toBe('20')
    expect(badgeText(section('그 밖의 집안일'), '냉장고 청소')).toBe('D-20')
    // 범위 밖으로 끌어도 주기(30)에서 멈춘다.
    fireEvent.pointerMove(slider, { ...pointer, clientX: 900, clientY: 22 })
    expect(slider.getAttribute('aria-valuenow')).toBe('30')
    fireEvent.pointerMove(slider, { ...pointer, clientX: 150, clientY: 22 })
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false)

    fireEvent.pointerUp(slider, { ...pointer, clientX: 150, clientY: 22 })
    fireEvent.click(slider)
    expect(calls.filter((c) => c.method === 'PATCH').map((c) => c.body)).toEqual([{ lastDoneAt: '2026-10-06' }])
    await screen.findByText('냉장고 청소 → D-22')
    expect(screen.queryByRole('heading', { name: '집안일 편집' })).toBeNull()
  })

  it('세로로 먼저 움직이면(스크롤) 조절하지 않고, 누르기만 해도 아무 일도 없다', async () => {
    const { calls } = mockFetch({ 'GET /api/chores': () => jsonResponse(CHORES) })
    render(<App today={TODAY} />)
    await waitDashboard()
    const slider = sliderOf(section('그 밖의 집안일'), '냉장고 청소')
    const track = slider.querySelector('.gauge') as HTMLElement
    track.getBoundingClientRect = () => ({ width: 300, height: 8, x: 0, y: 0, left: 0, top: 0, right: 300, bottom: 8 }) as DOMRect
    const pointer = { pointerId: 3, isPrimary: true, pointerType: 'touch' }

    fireEvent.pointerDown(slider, { ...pointer, clientX: 100, clientY: 20 })
    fireEvent.pointerMove(slider, { ...pointer, clientX: 102, clientY: 50 })
    fireEvent.pointerMove(slider, { ...pointer, clientX: 160, clientY: 60 })
    expect(slider.getAttribute('aria-valuenow')).toBe('17')
    fireEvent.pointerCancel(slider, { ...pointer })

    // 탭
    fireEvent.pointerDown(slider, { ...pointer, clientX: 100, clientY: 20 })
    fireEvent.pointerUp(slider, { ...pointer, clientX: 100, clientY: 20 })
    fireEvent.click(slider)
    fireEvent.blur(slider)

    expect(calls.every((c) => c.method === 'GET')).toBe(true)
    expect(screen.queryByRole('heading', { name: '집안일 편집' })).toBeNull()
    expect(badgeText(section('그 밖의 집안일'), '냉장고 청소')).toBe('D-17')
  })

  it('저장 중에는 그 카드의 게이지를 조절할 수 없다', async () => {
    const user = userEvent.setup()
    let resolve!: (value: Response) => void
    const { calls } = mockFetch({
      'GET /api/chores': () => jsonResponse(CHORES),
      'PATCH /api/chores/c': () => new Promise<Response>((r) => (resolve = r)),
    })
    render(<App today={TODAY} />)
    await waitDashboard()
    const slider = sliderOf(section('그 밖의 집안일'), '냉장고 청소')
    slider.focus()
    await user.keyboard('{ArrowLeft}{Enter}')
    expect(slider.getAttribute('aria-disabled')).toBe('true')
    await user.keyboard('{ArrowLeft}{Enter}')
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1)
    resolve(jsonResponse({ ...FRIDGE, lastDoneAt: '2026-09-30' }))
    await screen.findByText('냉장고 청소 → D-16')
  })
})

describe('집안일 추가', () => {
  it('검증에 실패하면 POST하지 않고, 통과하면 camelCase 본문으로 POST한 뒤 목록을 다시 불러온다', async () => {
    const user = userEvent.setup()
    await renderDashboard()
    // 대시보드 첫 로드 이후의 요청만 기록한다.
    const { calls } = mockFetch({
      'GET /api/chores': () => jsonResponse(CHORES),
      'POST /api/chores': (call) => jsonResponse({ ...(call.body as object), icon: null, note: null }, 201),
    })

    await openAddForm(user)
    // 마지막 수행일 기본값은 오늘
    expect((screen.getByLabelText('마지막 수행일') as HTMLInputElement).value).toBe(TODAY)

    // 빈 값
    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(screen.getByText('이름을 입력해 주세요.')).toBeTruthy()
    expect(screen.getByText('주기를 입력해 주세요.')).toBeTruthy()

    // 공백 이름, 주기 0
    await user.type(screen.getByLabelText('이름'), '   ')
    await user.type(screen.getByLabelText('주기 (일)'), '0')
    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(screen.getByText('이름을 입력해 주세요.')).toBeTruthy()
    expect(screen.getByText('1~36500일 사이로 입력해 주세요.')).toBeTruthy()

    expect(calls).toHaveLength(0)

    await user.clear(screen.getByLabelText('이름'))
    await user.type(screen.getByLabelText('이름'), '  욕실 청소 ')
    await user.clear(screen.getByLabelText('주기 (일)'))
    await user.type(screen.getByLabelText('주기 (일)'), '14')
    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitDashboard()
    // POST 다음에 대시보드가 목록을 다시 불러온다.
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(['POST /api/chores', 'GET /api/chores'])
    const body = calls[0].body as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['id', 'intervalDays', 'lastDoneAt', 'name'])
    expect(body).toMatchObject({ name: '욕실 청소', intervalDays: 14, lastDoneAt: TODAY })
    expect(body.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('주기 오류 문구는 상황별로 짧게 나온다', async () => {
    const user = userEvent.setup()
    await renderDashboard([])
    await openAddForm(user)
    const interval = screen.getByLabelText('주기 (일)')
    const save = () => user.click(screen.getByRole('button', { name: '저장' }))
    const message = () => document.getElementById('chore-interval-error')?.textContent

    await save()
    expect(message()).toBe('주기를 입력해 주세요.')

    await user.type(interval, '1.5')
    await save()
    expect(message()).toBe('소수점 없이 일 단위로 입력해 주세요.')

    await user.clear(interval)
    await user.type(interval, '-3')
    await save()
    expect(message()).toBe('1~36500일 사이로 입력해 주세요.')
  })

  it('주기 상한(36500일)을 넘으면 POST하지 않고, 상한값은 보낸다', async () => {
    const user = userEvent.setup()
    await renderDashboard([])
    const { calls } = mockFetch({
      'GET /api/chores': () => jsonResponse([]),
      'POST /api/chores': (call) => jsonResponse(call.body, 201),
    })
    expect(MAX_INTERVAL_DAYS).toBe(36500)

    await openAddForm(user)
    await user.type(screen.getByLabelText('이름'), '대청소')
    await user.type(screen.getByLabelText('주기 (일)'), '36501')
    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(screen.getByText('1~36500일 사이로 입력해 주세요.')).toBeTruthy()
    expect(calls).toHaveLength(0)

    await user.clear(screen.getByLabelText('주기 (일)'))
    await user.type(screen.getByLabelText('주기 (일)'), '36500')
    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitDashboard()
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({ intervalDays: 36500 })
  })

  it('마지막 수행일이 허용 범위(2000-01-01~2100-12-31) 밖이면 POST하지 않고, 경계값은 보낸다', async () => {
    const user = userEvent.setup()
    await renderDashboard([])
    const { calls } = mockFetch({
      'GET /api/chores': () => jsonResponse([]),
      'POST /api/chores': (call) => jsonResponse(call.body, 201),
    })

    await openAddForm(user)
    const dateInput = screen.getByLabelText('마지막 수행일') as HTMLInputElement
    expect(dateInput.min).toBe(MIN_LAST_DONE_AT)
    expect(dateInput.max).toBe(MAX_LAST_DONE_AT)
    expect([MIN_LAST_DONE_AT, MAX_LAST_DONE_AT]).toEqual(['2000-01-01', '2100-12-31'])

    await user.type(screen.getByLabelText('이름'), '대청소')
    await user.type(screen.getByLabelText('주기 (일)'), '7')
    const message = '마지막 수행일은 2000-01-01~2100-12-31 사이여야 해요.'

    for (const outOfRange of ['1999-12-31', '2101-01-01']) {
      fireEvent.change(dateInput, { target: { value: outOfRange } })
      await user.click(screen.getByRole('button', { name: '저장' }))
      expect(screen.getByText(message)).toBeTruthy()
    }
    expect(calls).toHaveLength(0)

    fireEvent.change(dateInput, { target: { value: '2100-12-31' } })
    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitDashboard()
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({ lastDoneAt: '2100-12-31' })
  })

  it('아이콘과 메모를 입력하면 함께 보낸다', async () => {
    const user = userEvent.setup()
    await renderDashboard([])
    const { calls } = mockFetch({
      'GET /api/chores': () => jsonResponse([]),
      'POST /api/chores': (call) => jsonResponse(call.body, 201),
    })

    await openAddForm(user)
    await user.type(screen.getByLabelText('이름'), '이불 빨래')
    await user.type(screen.getByLabelText('주기 (일)'), '14')
    await user.type(screen.getByLabelText('아이콘 (선택)'), '🛏️')
    await user.type(screen.getByLabelText('메모 (선택)'), '세탁망')
    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitDashboard()
    const post = calls.find((c) => c.method === 'POST')
    expect(post?.body).toMatchObject({ name: '이불 빨래', intervalDays: 14, icon: '🛏️', note: '세탁망' })
  })

  it('서버 422 응답을 한국어 안내와 작은 기술 정보로 보여주고 폼에 머문다', async () => {
    const user = userEvent.setup()
    await renderDashboard([])
    mockFetch({
      'GET /api/chores': () => jsonResponse([]),
      'POST /api/chores': () =>
        jsonResponse(
          { detail: [{ type: 'value_error', loc: ['body', 'name'], msg: 'Value error, 이름은 비어 있을 수 없다' }] },
          422,
        ),
    })

    await openAddForm(user)
    await user.type(screen.getByLabelText('이름'), '빨래')
    await user.type(screen.getByLabelText('주기 (일)'), '2')
    await user.click(screen.getByRole('button', { name: '저장' }))

    const alert = await screen.findByRole('alert')
    expect(alert.querySelector('.error-notice__title')?.textContent).toBe('저장하지 못했어요.')
    expect(alert.querySelector('.error-notice__hint')?.textContent).toBe(
      '입력한 값을 서버가 받지 않았어요. 입력 칸을 확인해 주세요.',
    )
    expect(alert.querySelector('.error-notice__detail')?.textContent).toBe(
      '오류 코드 422 · name: Value error, 이름은 비어 있을 수 없다',
    )
    expect(screen.getByRole('heading', { name: '집안일 추가' })).toBeTruthy()
    expect((screen.getByLabelText('이름') as HTMLInputElement).value).toBe('빨래')
  })

  it('입력하지 않았으면 취소할 때 묻지 않고 선택 화면으로, 선택 화면을 닫으면 요청 없이 대시보드로 돌아간다', async () => {
    const user = userEvent.setup()
    const { calls } = await renderDashboard()
    const confirm = vi.spyOn(window, 'confirm')
    await openAddForm(user)
    await user.click(screen.getByRole('button', { name: '취소' }))
    expect(screen.getByRole('heading', { name: PICKER_TITLE })).toBeTruthy()
    expect(confirm).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '닫기' }))
    await waitDashboard()
    expect(confirm).not.toHaveBeenCalled()
    expect(calls.every((c) => c.method === 'GET')).toBe(true)
  })

  it('입력한 뒤 취소하면 버릴지 묻고, 아니오면 폼에 머문다', async () => {
    const user = userEvent.setup()
    await renderDashboard()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await openAddForm(user)
    await user.type(screen.getByLabelText('이름'), '빨래')
    await user.click(screen.getByRole('button', { name: '취소' }))
    expect(confirm).toHaveBeenCalledWith('작성 중인 내용을 버릴까요?')
    expect(screen.getByRole('heading', { name: '집안일 추가' })).toBeTruthy()
    expect((screen.getByLabelText('이름') as HTMLInputElement).value).toBe('빨래')

    confirm.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: '취소' }))
    expect(screen.getByRole('heading', { name: PICKER_TITLE })).toBeTruthy()
    expect(confirm).toHaveBeenCalledTimes(2)
  })
})

describe('기본 목록에서 고르기', () => {
  /** 선택 화면의 항목 버튼. 이름 뒤에 주기("7일마다", "매일")와, 등록돼 있으면 "추가됨"이 붙는다. */
  function presetButton(name: string): HTMLButtonElement {
    return screen.getByRole('button', { name: new RegExp(`^${name} (매일|\\d+일마다)( 추가됨)?$`) }) as HTMLButtonElement
  }

  it('분류별 제목 아래에 항목을 아이콘, 이름, 주기와 함께 보여준다', async () => {
    const user = userEvent.setup()
    await renderDashboard([])
    await openPicker(user)

    for (const name of ['주방', '청소', '욕실', '세탁', '쓰레기', '생활·관리']) {
      expect(screen.getByRole('region', { name })).toBeTruthy()
    }
    const kitchen = screen.getByRole('region', { name: '주방' })
    expect(kitchen.querySelector('h2')?.textContent).toBe('🍳 주방')
    const dishes = within(kitchen).getByRole('button', { name: '설거지 매일' })
    expect(dishes.querySelector('.preset-chip__icon')?.textContent).toBe('🍽️')
    expect(dishes.querySelector('.preset-chip__interval')?.textContent).toBe('매일')
    expect(within(kitchen).getByRole('button', { name: '냉장고 정리 7일마다' })).toBeTruthy()
    // 반려동물(선택 분류)을 뺀 37개가 처음부터 보인다.
    expect(document.querySelectorAll('.preset-chip')).toHaveLength(37)
    expect(screen.getByRole('button', { name: '직접 입력' })).toBeTruthy()
  })

  it('반려동물 분류는 맨 아래에 접혀 있다가 펼쳐진다', async () => {
    const user = userEvent.setup()
    await renderDashboard([])
    await openPicker(user)
    expect(screen.queryByRole('region', { name: '반려동물' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^밥그릇·물그릇 세척/ })).toBeNull()

    const toggle = screen.getByRole('button', { name: '반려동물 항목 보기' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    await user.click(toggle)
    const pets = screen.getByRole('region', { name: '반려동물' })
    expect(within(pets).getByRole('button', { name: '밥그릇·물그릇 세척 매일' })).toBeTruthy()
    expect(within(pets).getByRole('button', { name: '목욕시키기 30일마다' })).toBeTruthy()
    // 펼친 분류는 다른 분류들 뒤(맨 아래)에 있다.
    const regions = screen.getAllByRole('region').map((r) => r.getAttribute('aria-labelledby'))
    expect(regions[regions.length - 1]).toBe('preset-pets-heading')

    const hide = screen.getByRole('button', { name: '반려동물 항목 숨기기' })
    expect(hide.getAttribute('aria-expanded')).toBe('true')
    await user.click(hide)
    expect(screen.queryByRole('region', { name: '반려동물' })).toBeNull()
  })

  it('항목을 누르면 이름, 아이콘, 주기가 채워진 폼이 열리고, 저장하면 그 값으로 POST한다', async () => {
    const user = userEvent.setup()
    await renderDashboard([])
    const { calls } = mockFetch({
      'GET /api/chores': () => jsonResponse([]),
      'POST /api/chores': (call) => jsonResponse(call.body, 201),
    })
    await openPicker(user)
    await user.click(presetButton('이불 빨래'))

    expect(screen.getByRole('heading', { name: '집안일 추가' })).toBeTruthy()
    expect((screen.getByLabelText('이름') as HTMLInputElement).value).toBe('이불 빨래')
    expect((screen.getByLabelText('주기 (일)') as HTMLInputElement).value).toBe('14')
    expect((screen.getByLabelText('아이콘 (선택)') as HTMLInputElement).value).toBe('🛏️')
    expect((screen.getByLabelText('마지막 수행일') as HTMLInputElement).value).toBe(TODAY)
    expect((screen.getByLabelText('메모 (선택)') as HTMLTextAreaElement).value).toBe('')

    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitDashboard()
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(['POST /api/chores', 'GET /api/chores'])
    const body = calls[0].body as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['icon', 'id', 'intervalDays', 'lastDoneAt', 'name'])
    expect(body).toMatchObject({ name: '이불 빨래', icon: '🛏️', intervalDays: 14, lastDoneAt: TODAY })
  })

  it('채워진 값은 저장 전에 고칠 수 있다', async () => {
    const user = userEvent.setup()
    await renderDashboard([])
    const { calls } = mockFetch({
      'GET /api/chores': () => jsonResponse([]),
      'POST /api/chores': (call) => jsonResponse(call.body, 201),
    })
    await openPicker(user)
    await user.click(presetButton('화분 물주기'))
    await user.clear(screen.getByLabelText('주기 (일)'))
    await user.type(screen.getByLabelText('주기 (일)'), '4')
    await user.type(screen.getByLabelText('메모 (선택)'), '베란다')
    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitDashboard()
    expect(calls[0].body).toMatchObject({ name: '화분 물주기', icon: '🪴', intervalDays: 4, note: '베란다' })
  })

  it('이미 등록된 이름의 항목은 "추가됨"으로 흐리게 보이고 누를 수 없다. 삭제된 집안일은 세지 않는다', async () => {
    const user = userEvent.setup()
    await renderDashboard([
      record('a', '설거지', 1, TODAY),
      record('b', ' 분리수거 ', 3, TODAY),
      record('z', '빨래', 3, TODAY, { deletedAt: '2026-10-13T00:00:00Z' }),
    ])
    await openPicker(user)

    const dishes = presetButton('설거지')
    expect(dishes.disabled).toBe(true)
    expect(dishes.className).toContain('preset-chip--added')
    expect(dishes.querySelector('.preset-chip__added')?.textContent).toBe('추가됨')
    // 앞뒤 공백은 무시하고 비교한다.
    expect(presetButton('분리수거').disabled).toBe(true)
    await user.click(dishes)
    expect(screen.getByRole('heading', { name: PICKER_TITLE })).toBeTruthy()

    const laundry = presetButton('빨래')
    expect(laundry.disabled).toBe(false)
    expect(laundry.querySelector('.preset-chip__added')).toBeNull()
  })

  it('직접 입력을 누르면 빈 폼이 열린다', async () => {
    const user = userEvent.setup()
    await renderDashboard([])
    await openPicker(user)
    await user.click(screen.getByRole('button', { name: '직접 입력' }))
    expect(screen.getByRole('heading', { name: '집안일 추가' })).toBeTruthy()
    expect((screen.getByLabelText('이름') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('주기 (일)') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('아이콘 (선택)') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('마지막 수행일') as HTMLInputElement).value).toBe(TODAY)
  })

  it('채워진 값만으로는 바뀐 것으로 보지 않아 묻지 않고, 폼 취소는 선택 화면, 선택 화면 닫기는 대시보드로 간다', async () => {
    const user = userEvent.setup()
    const { calls } = await renderDashboard()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await openPicker(user)
    await user.click(presetButton('장보기'))
    await user.click(screen.getByRole('button', { name: '취소' }))
    expect(confirm).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: PICKER_TITLE })).toBeTruthy()

    // 채운 값을 고친 뒤 취소하면 묻는다.
    await user.click(presetButton('장보기'))
    await user.type(screen.getByLabelText('이름'), ' 2')
    await user.click(screen.getByRole('button', { name: '취소' }))
    expect(confirm).toHaveBeenCalledWith('작성 중인 내용을 버릴까요?')
    expect(screen.getByRole('heading', { name: PICKER_TITLE })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '닫기' }))
    await waitDashboard()
    expect(calls.every((c) => c.method === 'GET')).toBe(true)
  })
})

describe('집안일 편집', () => {
  it('카드를 누르면 기존 값을 채워 보여주고, 바뀐 필드만 PATCH한다', async () => {
    const user = userEvent.setup()
    const { calls } = mockFetch({
      'GET /api/chores': () => jsonResponse(CHORES),
      'PATCH /api/chores/a': (call) => jsonResponse({ ...CHORES[1], ...(call.body as object) }),
    })
    render(<App today={TODAY} />)
    await waitDashboard()

    await openCard(user, '화분 물주기')
    expect((screen.getByLabelText('이름') as HTMLInputElement).value).toBe('화분 물주기')
    expect((screen.getByLabelText('주기 (일)') as HTMLInputElement).value).toBe('7')
    expect((screen.getByLabelText('마지막 수행일') as HTMLInputElement).value).toBe('2026-10-05')
    expect((screen.getByLabelText('아이콘 (선택)') as HTMLInputElement).value).toBe('🪴')
    expect((screen.getByLabelText('메모 (선택)') as HTMLTextAreaElement).value).toBe('베란다')

    await user.clear(screen.getByLabelText('주기 (일)'))
    await user.type(screen.getByLabelText('주기 (일)'), '10')
    await user.clear(screen.getByLabelText('메모 (선택)'))
    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitDashboard()
    const patches = calls.filter((c) => c.method === 'PATCH')
    expect(patches).toHaveLength(1)
    expect(patches[0].url).toBe('/api/chores/a')
    expect(patches[0].body).toEqual({ intervalDays: 10, note: null })
    expect(calls.filter((c) => c.method === 'GET')).toHaveLength(2)
  })

  it('바뀐 것이 없으면 PATCH하지 않는다', async () => {
    const user = userEvent.setup()
    const { calls } = await renderDashboard()
    await openCard(user, '걸레질')
    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitDashboard()
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false)
  })

  it('편집에서도 검증한다', async () => {
    const user = userEvent.setup()
    const { calls } = await renderDashboard()
    await openCard(user, '걸레질')
    await user.clear(screen.getByLabelText('이름'))
    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(screen.getByText('이름을 입력해 주세요.')).toBeTruthy()
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false)
  })

  it('편집에서도 마지막 수행일이 범위 밖이면 PATCH하지 않는다', async () => {
    const user = userEvent.setup()
    const { calls } = await renderDashboard()
    await openCard(user, '걸레질')
    fireEvent.change(screen.getByLabelText('마지막 수행일'), { target: { value: '9999-12-31' } })
    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(screen.getByText('마지막 수행일은 2000-01-01~2100-12-31 사이여야 해요.')).toBeTruthy()
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false)
  })

  it('편집에서도 주기 상한을 넘으면 PATCH하지 않는다', async () => {
    const user = userEvent.setup()
    const { calls } = await renderDashboard()
    await openCard(user, '걸레질')
    await user.clear(screen.getByLabelText('주기 (일)'))
    await user.type(screen.getByLabelText('주기 (일)'), '36501')
    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(screen.getByText('1~36500일 사이로 입력해 주세요.')).toBeTruthy()
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false)
  })

  it('편집 값을 바꾼 뒤 취소하면 버릴지 묻는다', async () => {
    const user = userEvent.setup()
    await renderDashboard()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await openCard(user, '걸레질')

    await user.click(screen.getByRole('button', { name: '취소' }))
    await waitDashboard()
    expect(confirm).not.toHaveBeenCalled()

    await openCard(user, '걸레질')
    await user.type(screen.getByLabelText('메모 (선택)'), '거실')
    await user.click(screen.getByRole('button', { name: '취소' }))
    await waitDashboard()
    expect(confirm).toHaveBeenCalledWith('작성 중인 내용을 버릴까요?')
  })

  it('삭제를 확인하면 DELETE하고 대시보드로 돌아가 목록을 다시 불러온다', async () => {
    const user = userEvent.setup()
    let chores = CHORES
    const { calls } = mockFetch({
      'GET /api/chores': () => jsonResponse(chores),
      'DELETE /api/chores/b': () => {
        chores = CHORES.filter((c) => c.id !== 'b')
        return new Response(null, { status: 204 })
      },
    })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App today={TODAY} />)
    await waitDashboard()

    await openCard(user, '걸레질')
    await user.click(screen.getByRole('button', { name: '삭제' }))

    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm).toHaveBeenCalledWith("'걸레질' 삭제할까요?")
    await waitDashboard()
    await waitFor(() => expect(cardNames(section('오늘 할 일'))).not.toContain('걸레질'))
    expect(calls.filter((c) => c.method === 'DELETE').map((c) => c.url)).toEqual(['/api/chores/b'])
    expect(screen.getByTestId('summary').textContent).toBe('오늘 할 일 2개 (밀린 일 2개 포함)')
  })

  it('삭제를 취소하면 DELETE하지 않고 편집 화면에 머문다', async () => {
    const user = userEvent.setup()
    const { calls } = await renderDashboard()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    await openCard(user, '걸레질')
    await user.click(screen.getByRole('button', { name: '삭제' }))
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
    expect(screen.getByRole('heading', { name: '집안일 편집' })).toBeTruthy()
  })

  it('삭제에 실패하면 한국어 안내와 기술 정보를 보여주고 편집 화면에 머문다', async () => {
    const user = userEvent.setup()
    mockFetch({
      'GET /api/chores': () => jsonResponse(CHORES),
      'DELETE /api/chores/b': () => new Response('Bad Gateway', { status: 502 }),
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App today={TODAY} />)
    await waitDashboard()
    await openCard(user, '걸레질')
    await user.click(screen.getByRole('button', { name: '삭제' }))

    const alert = await screen.findByRole('alert')
    expect(alert.querySelector('.error-notice__title')?.textContent).toBe('삭제하지 못했어요.')
    expect(alert.querySelector('.error-notice__hint')?.textContent).toBe(
      'PC 서버가 켜져 있는지, 집 Wi-Fi에 연결돼 있는지 확인한 뒤 다시 삭제해 주세요.',
    )
    expect(alert.querySelector('.error-notice__detail')?.textContent).toBe('오류 코드 502 · Bad Gateway')
    expect(screen.getByRole('heading', { name: '집안일 편집' })).toBeTruthy()
  })

  it('추가 화면에는 삭제 버튼이 없다', async () => {
    const user = userEvent.setup()
    await renderDashboard()
    await openAddForm(user)
    expect(screen.queryByRole('button', { name: '삭제' })).toBeNull()
  })
})
