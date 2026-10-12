import { expect, type Page } from '@playwright/test'
import type { ChoreRecord } from '../src/api/chores'
import { ALL_CLEAR_CHORES } from './sampleData.ts'

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
  /**
   * 대시보드가 열린 뒤(불러오기 끝난 뒤) 실행할 조작. 캡처 직전 화면이 의도한 상태인지
   * expect로 확인해 두면 화면이 바뀌었을 때 캡처가 실패해서 알 수 있다.
   */
  steps?: (page: Page) => Promise<void>
}

async function openAddForm(page: Page): Promise<void> {
  await page.getByRole('button', { name: '집안일 추가' }).click()
  await expect(page.getByRole('heading', { name: '집안일 추가' })).toBeVisible()
}

/** 시나리오 목록. 새 화면·상태를 찍으려면 여기에 항목을 덧붙인다. */
export const SCENARIOS: Scenario[] = [
  {
    name: 'dashboard',
    description: '대시보드: 샘플 6개(D+2, D+1, D-Day, D-1, D-2, D-7)',
    steps: async (page) => {
      await expect(page.getByTestId('summary')).toHaveText('오늘 할 일 3개 · 밀린 일 2개')
    },
  },
  {
    name: 'dashboard-empty',
    description: '대시보드: 집안일 0개(빈 상태)',
    chores: [],
    steps: async (page) => {
      await expect(page.getByTestId('summary')).toHaveText('오늘 할 일 0개 · 밀린 일 0개')
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
    name: 'add-form',
    description: '추가 화면: "+"를 눌러 연 빈 폼',
    steps: openAddForm,
  },
  {
    name: 'add-form-errors',
    description: '추가 화면: 빈 값으로 저장을 눌러 검증 오류가 보이는 상태',
    steps: async (page) => {
      await openAddForm(page)
      await page.getByRole('button', { name: '저장' }).click()
      await expect(page.getByText('이름을 입력해 주세요.')).toBeVisible()
    },
  },
  {
    name: 'edit-form',
    description: '편집 화면: 냉장고 청소 카드를 눌러 연 상태',
    steps: async (page) => {
      await page.getByRole('button', { name: /^냉장고 청소 .* 편집$/ }).first().click()
      await expect(page.getByRole('heading', { name: '집안일 편집' })).toBeVisible()
      await expect(page.getByLabel('이름')).toHaveValue('냉장고 청소')
    },
  },
]
