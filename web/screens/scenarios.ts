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
    description: '대시보드: 집안일 12개를 중간까지 스크롤한 상태를 보이는 화면 그대로 캡처(하단 "+" 막대와 카드 위치 확인)',
    chores: LONG_CHORES,
    fullPage: false,
    steps: async (page) => {
      await expect(page.getByTestId('summary')).toHaveText('오늘 할 일 3개 (밀린 일 2개 포함)')
      // 카드 경계가 막대 위쪽에 걸치도록 반 장 정도 어긋난 위치로 스크롤한다.
      await page.evaluate(() => window.scrollTo(0, 330))
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
    description: '추가 첫 화면: "+"를 눌러 연 기본 목록(욕실 청소·화분 물주기 등은 "추가됨")',
    steps: openPicker,
  },
  {
    name: 'add-picker-pets',
    description: '추가 첫 화면: 맨 아래 반려동물 분류를 펼친 상태',
    steps: async (page) => {
      await openPicker(page)
      await page.getByRole('button', { name: '반려동물 항목 보기' }).click()
      await expect(page.getByRole('heading', { name: '반려동물' })).toBeVisible()
    },
  },
  {
    name: 'add-form-preset',
    description: '추가 화면: 기본 목록에서 "이불 빨래"를 골라 값이 채워진 폼',
    chores: [],
    steps: async (page) => {
      await openPicker(page)
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
