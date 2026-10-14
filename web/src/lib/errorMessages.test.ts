import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/chores'
import {
  adjustErrorText,
  adjustUndoErrorText,
  completeErrorText,
  deleteErrorText,
  loadErrorText,
  restoreErrorText,
  saveErrorText,
  technicalDetail,
  uncompleteErrorText,
  undoErrorText,
} from './errorMessages'

describe('오류 문구', () => {
  it('기술 정보는 상태 코드와 원문, 네트워크 오류는 메시지만 담는다', () => {
    expect(technicalDetail(new ApiError(500, 'Internal Server Error'))).toBe('오류 코드 500 · Internal Server Error')
    expect(technicalDetail(new TypeError('Failed to fetch'))).toBe('Failed to fetch')
  })

  it('목록 오류는 연결 확인을 안내한다', () => {
    expect(loadErrorText(new TypeError('Failed to fetch'))).toEqual({
      title: '목록을 불러오지 못했어요.',
      hint: 'PC 서버가 켜져 있는지, 집 Wi-Fi에 연결돼 있는지 확인한 뒤 다시 시도해 주세요.',
      detail: 'Failed to fetch',
    })
  })

  it('저장 오류는 상태 코드별로 안내가 다르다', () => {
    expect(saveErrorText(new ApiError(422, [])).hint).toBe('입력한 값을 서버가 받지 않았어요. 입력 칸을 확인해 주세요.')
    expect(saveErrorText(new ApiError(404, '집안일을 찾을 수 없다')).hint).toContain('이미 삭제된 집안일')
    expect(saveErrorText(new ApiError(500, 'x')).hint).toContain('다시 저장해 주세요.')
  })

  it('완료 체크와 실행 취소 오류도 404와 그 밖을 나눈다', () => {
    expect(completeErrorText(new TypeError('Failed to fetch'))).toEqual({
      title: '완료 체크를 저장하지 못했어요.',
      hint: 'PC 서버가 켜져 있는지, 집 Wi-Fi에 연결돼 있는지 확인한 뒤 다시 체크해 주세요.',
      detail: 'Failed to fetch',
    })
    expect(completeErrorText(new ApiError(404, 'x')).hint).toContain('이미 삭제된 집안일')
    expect(undoErrorText(new ApiError(500, 'x')).title).toBe('실행 취소하지 못했어요.')
    expect(undoErrorText(new ApiError(500, 'x')).hint).toContain('완료 기록은 그대로 남아 있어요.')
    expect(undoErrorText(new ApiError(404, 'x')).hint).toContain('이미 취소됐거나')
  })

  it('잔여일 조절과 그 실행 취소 오류는 상태 코드별로 안내가 다르다', () => {
    expect(adjustErrorText(new TypeError('Failed to fetch'))).toEqual({
      title: '남은 일수를 저장하지 못했어요.',
      hint: 'PC 서버가 켜져 있는지, 집 Wi-Fi에 연결돼 있는지 확인한 뒤 게이지를 다시 조절해 주세요.',
      detail: 'Failed to fetch',
    })
    expect(adjustErrorText(new ApiError(404, 'x')).hint).toContain('이미 삭제된 집안일')
    expect(adjustErrorText(new ApiError(422, [])).hint).toContain('마지막 수행일을 직접 고쳐')
    expect(adjustUndoErrorText(new ApiError(500, 'x')).title).toBe('실행 취소하지 못했어요.')
    expect(adjustUndoErrorText(new ApiError(500, 'x')).hint).toContain('조절한 날짜가 그대로 남아 있어요.')
    expect(adjustUndoErrorText(new ApiError(404, 'x')).hint).toContain('이미 삭제된 집안일')
  })

  it('삭제 오류도 404와 그 밖을 나눈다', () => {
    expect(deleteErrorText(new ApiError(404, 'x')).hint).toContain('이미 삭제된 집안일')
    expect(deleteErrorText(new TypeError('Failed to fetch')).hint).toContain('다시 삭제해 주세요.')
  })

  it('되살리기 오류는 404·409와 그 밖을 나눈다', () => {
    expect(restoreErrorText(new ApiError(500, 'x')).title).toBe('실행 취소하지 못했어요.')
    expect(restoreErrorText(new ApiError(500, 'x')).hint).toContain('삭제된 채로 남아 있어요.')
    expect(restoreErrorText(new ApiError(404, 'x')).hint).toContain('이미 되살렸거나')
    expect(restoreErrorText(new ApiError(409, 'x')).hint).toContain('이미 되살렸거나')
  })

  it('오늘 완료 취소 오류는 기록이 없을 때(404)를 따로 안내한다', () => {
    expect(uncompleteErrorText(new TypeError('Failed to fetch'))).toEqual({
      title: '완료를 취소하지 못했어요.',
      hint: 'PC 서버가 켜져 있는지, 집 Wi-Fi에 연결돼 있는지 확인한 뒤 다시 눌러 주세요.',
      detail: 'Failed to fetch',
    })
    expect(uncompleteErrorText(new ApiError(404, 'x')).hint).toContain('오늘 완료한 기록이 없어요.')
  })
})
