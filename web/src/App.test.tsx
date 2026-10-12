// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { MAX_INTERVAL_DAYS, MAX_LAST_DONE_AT, MIN_LAST_DONE_AT } from './components/ChoreForm'
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
})

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

async function openAddForm(user: UserEvent) {
  await user.click(fab())
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
    await renderDashboard()
    const todaySection = section('오늘 할 일')
    const others = section('그 밖의 집안일')

    const overdue = cardOf(todaySection, '화분 물주기')
    expect(overdue.getAttribute('data-status')).toBe('overdue')
    expect(overdue.className).toContain('chore-card--overdue')
    expect(within(overdue).getByText('D+2')).toBeTruthy()
    // 색 없이도 알 수 있는 단서: 배지 안 "!" 표시와 읽기용 "2일 지남"
    expect(overdue.querySelector('.badge__alert')?.textContent).toBe('!')
    expect(within(overdue).getByRole('button', { name: '화분 물주기 D+2 (2일 지남) 편집' })).toBeTruthy()
    expect(within(overdue).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0')
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
    // 17 / 30 = 56.67%
    expect(within(ok).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('57')
  })

  it('완료 체크 버튼은 준비 중으로 비활성이다', async () => {
    await renderDashboard()
    const check = within(cardOf(section('오늘 할 일'), '걸레질')).getByRole('button', { name: /완료 체크/ })
    expect((check as HTMLButtonElement).disabled).toBe(true)
    expect(check.getAttribute('aria-label')).toContain('준비 중')
  })

  it('오늘 할 일이 없으면 빈 상태 문구를 보여준다', async () => {
    await renderDashboard([record('c', '냉장고 청소', 30, '2026-10-01')])
    expect(within(section('오늘 할 일')).getByText(/오늘 할 일이 없어요/)).toBeTruthy()
    expect(cardNames(section('그 밖의 집안일'))).toEqual(['냉장고 청소'])
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
    expect(screen.getByRole('heading', { name: '집안일 추가' })).toBeTruthy()
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

  it('입력하지 않았으면 취소할 때 묻지 않고 요청 없이 대시보드로 돌아간다', async () => {
    const user = userEvent.setup()
    const { calls } = await renderDashboard()
    const confirm = vi.spyOn(window, 'confirm')
    await openAddForm(user)
    await user.click(screen.getByRole('button', { name: '취소' }))
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
    await waitDashboard()
    expect(confirm).toHaveBeenCalledTimes(2)
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
