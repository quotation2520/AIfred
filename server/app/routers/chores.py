"""F1 집안일 등록/조회/편집/삭제 API.

삭제는 soft delete(deleted_at 기록)다. 동기화(F8)로 삭제를 전달하기 위해 행을 남긴다.
"""

from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlmodel import Session, select

from app.clock import get_now, get_today
from app.db import get_session
from app.models import Chore, new_id
from app.schemas import ChoreCreate, ChoreRead, ChoreUpdate
from app.status import sorted_by_urgency

router = APIRouter(prefix="/api/chores", tags=["chores"])

SessionDep = Annotated[Session, Depends(get_session)]
TodayDep = Annotated[date, Depends(get_today)]
NowDep = Annotated[datetime, Depends(get_now)]


def _get_active_or_404(session: Session, chore_id: str) -> Chore:
    chore = session.get(Chore, chore_id)
    if chore is None or chore.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="집안일을 찾을 수 없다")
    return chore


@router.get("", response_model=list[ChoreRead])
def list_chores(session: SessionDep, today: TodayDep) -> list[Chore]:
    chores = session.exec(select(Chore).where(Chore.deleted_at.is_(None))).all()  # type: ignore[union-attr]
    return sorted_by_urgency(chores, today)


@router.get("/{chore_id}", response_model=ChoreRead)
def get_chore(chore_id: str, session: SessionDep) -> Chore:
    return _get_active_or_404(session, chore_id)


@router.post("", response_model=ChoreRead, status_code=status.HTTP_201_CREATED)
def create_chore(body: ChoreCreate, session: SessionDep, today: TodayDep, now: NowDep) -> Chore:
    chore_id = body.id or new_id()
    # 삭제된 집안일의 id도 재사용하지 않는다.
    if session.get(Chore, chore_id) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="이미 있는 id다")
    chore = Chore(
        id=chore_id,
        name=body.name,
        interval_days=body.interval_days,
        last_done_at=body.last_done_at or today,
        icon=body.icon,
        note=body.note,
        created_at=now,
        updated_at=now,
    )
    session.add(chore)
    session.commit()
    session.refresh(chore)
    return chore


@router.patch("/{chore_id}", response_model=ChoreRead)
def update_chore(chore_id: str, body: ChoreUpdate, session: SessionDep, now: NowDep) -> Chore:
    chore = _get_active_or_404(session, chore_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(chore, field, value)
    chore.updated_at = now
    session.add(chore)
    session.commit()
    session.refresh(chore)
    return chore


@router.delete("/{chore_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_chore(chore_id: str, session: SessionDep, now: NowDep) -> Response:
    chore = _get_active_or_404(session, chore_id)
    chore.deleted_at = now
    chore.updated_at = now
    session.add(chore)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{chore_id}/restore", response_model=ChoreRead)
def restore_chore(chore_id: str, session: SessionDep, now: NowDep) -> Chore:
    """삭제를 실행 취소한다(UX U2). 완료 기록은 삭제할 때 건드리지 않으므로 그대로 이어진다."""
    chore = session.get(Chore, chore_id)
    if chore is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="집안일을 찾을 수 없다")
    if chore.deleted_at is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="삭제되지 않은 집안일이다")
    chore.deleted_at = None
    chore.updated_at = now
    session.add(chore)
    session.commit()
    session.refresh(chore)
    return chore
