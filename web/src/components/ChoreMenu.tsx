import type { ChoreRecord } from '../api/chores'
import Sheet, { SheetHeader } from './Sheet'

interface ChoreMenuProps {
  chore: ChoreRecord
  closing?: boolean
  onExited?: () => void
  onEdit: (chore: ChoreRecord) => void
  onDelete: (chore: ChoreRecord) => void
  /** 바깥 탭, 닫기, 아래로 끌기, Esc */
  onClose: () => void
}

/**
 * 카드 "⋯" 메뉴 (UX U2, B2): 편집과 삭제. 폰에서는 아래에서 올라오는 목록이고 넓은 화면에서는 작은 대화상자다.
 * 머리줄에 이름 전체를 보여 줘서 어느 집안일의 메뉴인지 알 수 있다. 줄마다 높이 52px로 누르기 쉽다.
 * 삭제는 확인 창 없이 바로 하고 실행 취소 알림을 띄운다(대시보드가 처리).
 */
function ChoreMenu({ chore, closing, onExited, onEdit, onDelete, onClose }: ChoreMenuProps) {
  return (
    <Sheet size="menu" closing={closing} onExited={onExited} onRequestClose={onClose} testId="chore-menu">
      <SheetHeader title={chore.name} onClose={onClose} />
      <ul className="action-list">
        <li>
          <button type="button" className="action-list__item" onClick={() => onEdit(chore)} disabled={closing}>
            <span className="action-list__icon" aria-hidden="true">
              ✏️
            </span>
            편집
          </button>
        </li>
        <li>
          <button
            type="button"
            className="action-list__item action-list__item--danger"
            onClick={() => onDelete(chore)}
            disabled={closing}
          >
            <span className="action-list__icon" aria-hidden="true">
              🗑
            </span>
            삭제
          </button>
        </li>
      </ul>
    </Sheet>
  )
}

export default ChoreMenu
