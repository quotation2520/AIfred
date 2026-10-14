import { expect, type Page } from '@playwright/test'
import type { ChoreRecord } from '../src/api/chores'
import { ALL_CLEAR_CHORES, ALL_TODAY_CHORES, LONG_CHORES } from './sampleData.ts'

/** 가짜 API 응답 하나. */
export interface MockResponse {
  status: number
  body: string
  contentType?: string
}

/**
 * 캡처 시나리오 하나. 모바일(360px)과 데스크톱(1280px)에서 각각
 * `screenshots/<name>-<mobile|desktop>.png`로 저장된다.
 */
export interface Scenario {
  /** 파일 이름에 쓰인다. 소문자-하이픈. */
  name: string
  /** 무엇을 찍는지 한 줄 설명. */
  description: string
  /** 처음 GET /api/chores가 돌려줄 목록. 기본값은 SAMPLE_CHORES. 추가·수정·삭제는 이 목록에 반영된다. */
  chores?: ChoreRecord[]
  /** 지정하면 GET /api/chores가 이 응답을 돌려준다(오류 상태 캡처용). */
  listResponse?: MockResponse
  /** 지정하면 POST /api/chores가 이 응답을 돌려준다(저장 실패 캡처용). */
  createResponse?: MockResponse
  /**
   * 지정하면 GET /api/presets가 이 응답을 돌려준다(기본 목록 오류 캡처용).
   * 없으면 shared/presets.json으로 만든 목록을 돌려주고, 기본 목록 추가·수정·삭제도 메모리에 반영한다.
   */
  presetsResponse?: MockResponse
  /**
   * false면 전체 페이지 대신 지금 보이는 화면(뷰포트)만 찍는다. 기본값 true.
   * 전체 페이지 캡처에서는 화면 아래 고정 요소가 첫 화면 기준 위치에 찍히므로,
   * 스크롤한 상태의 고정 요소를 보여 줄 때 쓴다.
   */
  fullPage?: boolean
  /**
   * 대시보드가 열린 뒤(불러오기 끝난 뒤) 실행할 조작. 캡처 직전 화면이 의도한 상태인지
   * expect로 확인해 두면 화면이 바뀌었을 때 캡처가 실패해서 알 수 있다.
   */
  steps?: (page: Page) => Promise<void>
}

/** 하단 고정 "+" 버튼으로 기본 목록 선택 화면을 연다. 집안일 0개 화면에는 같은 이름의 버튼이 하나 더 있어 마지막 것을 쓴다. */
async function openPicker(page: Page): Promise<void> {
  await page.getByRole('button', { name: '집안일 추가', exact: true }).last().click()
  await expect(page.getByRole('heading', { name: '어떤 집안일을 추가할까요?' })).toBeVisible()
}

/** 선택 화면에서 카테고리 머리줄("🍳 주방 9")을 눌러 펼친다. */
async function expandCategory(page: Page, name: string): Promise<void> {
  const toggle = page.getByRole('button', { name: new RegExp(`^${name} \\d+$`) })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
}

/** 선택 화면에서 "직접 입력"을 눌러 빈 추가 폼을 연다. */
async function openAddForm(page: Page): Promise<void> {
  await openPicker(page)
  await page.getByRole('button', { name: '직접 입력' }).click()
  await expect(page.getByRole('heading', { name: '집안일 추가' })).toBeVisible()
}

/** 그 밖의 집안일 맨 아래 버튼으로 접힌 "나중에 할 일"(남은 일수 7일 이상)을 펼친다. */
async function openLater(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^나중에 할 일 \d+개 더 보기$/ }).click()
  await expect(page.getByRole('button', { name: '접기' })).toBeVisible()
}

/**
 * 카드 게이지를 마우스로 오른쪽으로 끈다. fraction은 게이지 폭 대비 끄는 거리(0.5면 주기의 절반만큼 남은 일수가 는다).
 * 가로로 10px 넘게 움직여야 조절이 시작되므로 여러 단계로 나눠 움직인다. release가 false면 누른 채로 둔다.
 */
async function dragGauge(page: Page, name: string, fraction: number, { release }: { release: boolean }): Promise<void> {
  const slider = page.getByRole('slider', { name: `${name} 남은 일수` })
  const box = await slider.boundingBox()
  if (!box) throw new Error(`${name} 게이지가 보이지 않는다`)
  const startX = box.x + box.width * 0.25
  const y = box.y + box.height / 2
  await page.mouse.move(startX, y)
  await page.mouse.down()
  await page.mouse.move(startX + box.width * fraction, y, { steps: 10 })
  if (release) await page.mouse.up()
}

/** 시나리오 목록. 새 화면·상태를 찍으려면 여기에 항목을 덧붙인다. */
export const SCENARIOS: Scenario[] = [
  {
    name: 'dashboard',
    description: '대시보드: 샘플 7개(D+2, D+1, D-Day / D-1, D-2, D-5 긴 이름 / 접힌 D-7 1개)',
    steps: async (page) => {
      await expect(page.getByTestId('summary')).toHaveText('오늘 할 일 3개 (밀린 일 2개 포함)')
      await expect(page.getByRole('heading', { name: '그 밖의 집안일' })).toBeVisible()
      await expect(page.getByRole('button', { name: '나중에 할 일 1개 더 보기' })).toBeVisible()
    },
  },
  {
    name: 'dashboard-later-closed',
    description: '대시보드: 집안일 12개에서 "나중에 할 일"(남은 일수 7일 이상) 5개가 접힌 처음 상태(dashboard-later-open과 비교용)',
    chores: LONG_CHORES,
    steps: async (page) => {
      await expect(page.getByRole('button', { name: '나중에 할 일 5개 더 보기' })).toHaveAttribute('aria-expanded', 'false')
    },
  },
  {
    name: 'dashboard-later-open',
    description: '대시보드: 집안일 12개에서 "나중에 할 일"(남은 일수 7일 이상)을 펼친 상태',
    chores: LONG_CHORES,
    steps: async (page) => {
      await expect(page.getByRole('button', { name: '나중에 할 일 5개 더 보기' })).toBeVisible()
      await openLater(page)
    },
  },
  {
    name: 'dashboard-scrolled',
    description:
      '대시보드: 집안일 12개("나중에 할 일" 펼침)를 중간까지 스크롤한 상태를 보이는 화면 그대로 캡처(하단 "+" 막대와 카드 위치 확인)',
    chores: LONG_CHORES,
    fullPage: false,
    steps: async (page) => {
      await expect(page.getByTestId('summary')).toHaveText('오늘 할 일 3개 (밀린 일 2개 포함)')
      // 접힌 상태에서는 페이지가 짧아 막대 아래로 지나가는 카드가 없으므로 펼친 뒤 스크롤한다.
      await openLater(page)
      // 카드 경계가 막대 위쪽에 걸치도록 반 장 정도 어긋난 위치로 스크롤한다.
      await page.evaluate(() => window.scrollTo(0, 430))
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(430)
    },
  },
  {
    name: 'dashboard-complete-toast',
    description: '대시보드: 걸레질(D-Day)을 완료 체크한 직후. 카드가 그 밖의 집안일로 옮겨 가고 하단에 실행 취소 알림이 보임',
    fullPage: false,
    steps: async (page) => {
      await page.getByRole('button', { name: '걸레질 완료 체크' }).click()
      await expect(page.getByTestId('undo-toast')).toContainText('걸레질 완료')
      await expect(page.getByRole('button', { name: '걸레질 오늘 완료함' })).toBeVisible()
      await expect(page.getByTestId('summary')).toHaveText('오늘 할 일 2개 (밀린 일 2개 포함)')
    },
  },
  {
    name: 'dashboard-complete-moved-later',
    description:
      '대시보드: 욕실 청소(D+2, 7일마다)를 완료 체크한 직후. 카드가 접힌 "나중에 할 일"로 들어가 알림에 "나중에 할 일로 이동"이 붙음',
    fullPage: false,
    steps: async (page) => {
      await page.getByRole('button', { name: '욕실 청소 완료 체크' }).click()
      await expect(page.getByTestId('undo-toast')).toContainText('욕실 청소 완료')
      await expect(page.getByTestId('undo-toast')).toContainText('나중에 할 일로 이동')
      await expect(page.getByRole('button', { name: '나중에 할 일 2개 더 보기' })).toBeVisible()
    },
  },
  {
    name: 'dashboard-gauge-dragging',
    description: '대시보드: 분리수거(D-1, 4일마다) 게이지를 오른쪽으로 끌고 있는 도중(손을 떼기 전, 배지가 D-3 미리 보기)',
    fullPage: false,
    steps: async (page) => {
      await dragGauge(page, '분리수거', 0.5, { release: false })
      await expect(page.getByRole('slider', { name: '분리수거 남은 일수' })).toHaveAttribute('aria-valuenow', '3')
      await expect(page.getByRole('button', { name: /^분리수거 4일마다 D-3 편집$/ })).toBeVisible()
    },
  },
  {
    name: 'dashboard-gauge-adjusted',
    description: '대시보드: 분리수거 게이지를 끌어 놓은 직후. 카드가 D-3 자리로 옮겨 가고 "분리수거 → D-3" 실행 취소 알림이 보임',
    fullPage: false,
    steps: async (page) => {
      await dragGauge(page, '분리수거', 0.5, { release: true })
      await expect(page.getByTestId('undo-toast')).toContainText('분리수거 → D-3')
    },
  },
  {
    name: 'dashboard-all-today',
    description: '대시보드: 모든 집안일이 오늘 할 일(그 밖의 집안일 영역 없음)',
    chores: ALL_TODAY_CHORES,
    steps: async (page) => {
      await expect(page.getByTestId('summary')).toHaveText('오늘 할 일 3개 (밀린 일 2개 포함)')
      await expect(page.getByRole('heading', { name: '그 밖의 집안일' })).toHaveCount(0)
    },
  },
  {
    name: 'dashboard-empty',
    description: '대시보드: 집안일 0개(첫 등록 안내 상자)',
    chores: [],
    steps: async (page) => {
      await expect(page.getByTestId('summary')).toHaveText('오늘 할 일 0개')
      await expect(page.getByText('첫 집안일을 등록해 보세요')).toBeVisible()
    },
  },
  {
    name: 'dashboard-all-clear',
    description: '대시보드: 집안일은 있지만 오늘 할 일 0개',
    chores: ALL_CLEAR_CHORES,
    steps: async (page) => {
      await expect(page.getByText('오늘 할 일이 없어요. 푹 쉬세요!')).toBeVisible()
    },
  },
  {
    name: 'dashboard-error',
    description: '대시보드: 목록 API 500 오류',
    listResponse: { status: 500, body: 'Internal Server Error', contentType: 'text/plain' },
    steps: async (page) => {
      await expect(page.getByRole('alert')).toContainText('목록을 불러오지 못했어요.')
    },
  },
  {
    name: 'add-picker',
    description: '추가 첫 화면: "+"를 눌러 연 기본 목록(카테고리 7개가 모두 접힌 처음 상태)',
    steps: async (page) => {
      await openPicker(page)
      await expect(page.getByRole('button', { name: '주방 9' })).toHaveAttribute('aria-expanded', 'false')
    },
  },
  {
    name: 'add-picker-open',
    description: '추가 첫 화면: 욕실과 생활·관리를 펼쳐 항목이 한 줄씩 보이는 상태(욕실 청소·화분 물주기는 "추가됨")',
    steps: async (page) => {
      await openPicker(page)
      await expandCategory(page, '욕실')
      await expandCategory(page, '생활·관리')
      await expect(page.getByRole('button', { name: '욕실 청소 7일마다 추가됨' })).toBeDisabled()
    },
  },
  {
    name: 'add-picker-new-item',
    description: '추가 첫 화면: 주방을 펼치고 맨 아래 "+ 항목 추가"를 눌러 연 입력 폼',
    steps: async (page) => {
      await openPicker(page)
      await expandCategory(page, '주방')
      await page.getByRole('region', { name: '주방' }).getByRole('button', { name: '+ 항목 추가' }).click()
      await expect(page.getByRole('form', { name: '항목 추가' })).toBeVisible()
    },
  },
  {
    name: 'add-picker-new-category',
    description: '추가 첫 화면: 목록 맨 아래 "+ 카테고리 추가"를 눌러 연 입력 폼',
    steps: async (page) => {
      await openPicker(page)
      await page.getByRole('button', { name: '+ 카테고리 추가' }).click()
      await expect(page.getByRole('form', { name: '카테고리 추가' })).toBeVisible()
    },
  },
  {
    name: 'add-picker-edit',
    description: '추가 첫 화면: "편집"을 켜고 주방을 펼쳐 카테고리·항목마다 수정·삭제가 보이는 상태',
    steps: async (page) => {
      await openPicker(page)
      await page.getByRole('button', { name: '편집', exact: true }).click()
      await expandCategory(page, '주방')
      await expect(page.getByRole('button', { name: '설거지 수정' })).toBeVisible()
    },
  },
  {
    name: 'add-picker-error',
    description: '추가 첫 화면: 기본 목록 API 500 오류(직접 입력은 그대로 보임)',
    presetsResponse: { status: 500, body: 'Internal Server Error', contentType: 'text/plain' },
    steps: async (page) => {
      await openPicker(page)
      await expect(page.getByRole('alert')).toContainText('기본 목록을 불러오지 못했어요.')
    },
  },
  {
    name: 'add-form-preset',
    description: '추가 화면: 기본 목록의 세탁을 펼쳐 "이불 빨래"를 골라 값이 채워진 폼',
    chores: [],
    steps: async (page) => {
      await openPicker(page)
      await expandCategory(page, '세탁')
      await page.getByRole('button', { name: /^이불 빨래 / }).click()
      await expect(page.getByRole('heading', { name: '집안일 추가' })).toBeVisible()
      await expect(page.getByLabel('이름')).toHaveValue('이불 빨래')
    },
  },
  {
    name: 'add-form',
    description: '추가 화면: 선택 화면에서 "직접 입력"을 눌러 연 빈 폼',
    steps: openAddForm,
  },
  {
    name: 'add-form-errors',
    description: '추가 화면: 빈 값으로 저장을 눌러 검증 오류가 보이는 상태',
    steps: async (page) => {
      await openAddForm(page)
      await page.getByRole('button', { name: '저장' }).click()
      await expect(page.getByText('이름을 입력해 주세요.')).toBeVisible()
      await expect(page.getByText('주기를 입력해 주세요.')).toBeVisible()
    },
  },
  {
    name: 'add-form-save-error',
    description: '추가 화면: 서버가 입력값을 거부(422)해 저장 실패 문구가 보이는 상태',
    createResponse: {
      status: 422,
      body: JSON.stringify({
        detail: [{ type: 'value_error', loc: ['body', 'name'], msg: 'Value error, 이름은 비어 있을 수 없다' }],
      }),
    },
    steps: async (page) => {
      await openAddForm(page)
      await page.getByLabel('이름').fill('이불 빨래')
      await page.getByLabel('주기 (일)').fill('14')
      await page.getByRole('button', { name: '저장' }).click()
      await expect(page.getByRole('alert')).toContainText('저장하지 못했어요.')
    },
  },
  {
    name: 'edit-form',
    description: '편집 화면: 접힌 "나중에 할 일"을 펼쳐 냉장고 청소 카드를 눌러 연 상태',
    steps: async (page) => {
      await openLater(page)
      await page.getByRole('button', { name: /^냉장고 청소 .* 편집$/ }).click()
      await expect(page.getByRole('heading', { name: '집안일 편집' })).toBeVisible()
      await expect(page.getByLabel('이름')).toHaveValue('냉장고 청소')
    },
  },
]
