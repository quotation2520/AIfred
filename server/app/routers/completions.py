"""F3 완료 체크와 실행 취소 API.

- 완료하면 완료 기록(Completion)을 남기고 chore.last_done_at을 max(기존 값, 완료일)로 바꾼다
  (PRD 7장: 마지막 수행일은 완료 기록 중 가장 늦은 날짜).
- 실행 취소는 완료 기록을 soft delete하고 last_done_at을 복원한다. 동기화(F8)로 취소를 전달하기 위해 행을 남긴다.
"""

from datetime import date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.clock import get_now, get_today
from app.db import get_session
from app.models import Chore, Completion, new_id
from app.schemas import ChoreRead, CompletionCreate, CompletionRead, CompletionResult

router = APIRouter(prefix="/api", tags=["completions"])

SessionDep = Annotated[Session, Depends(get_session)]
TodayDep = Annotated[date, Depends(get_today)]
NowDep = Annotated[datetime, Depends(get_now)]

_CHORE_NOT_FOUND = "집안일을 찾을 수 없다"


def _active_chore_or_404(session: Session, chore_id: str) -> Chore:
    chore = session.get(Chore, chore_id)
    if chore is None or chore.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_CHORE_NOT_FOUND)
    return chore


def _result(completion: Completion, chore: Chore) -> CompletionResult:
    return CompletionResult(
        completion=CompletionRead.model_validate(completion),
        chore=ChoreRead.model_validate(chore),
    )


@router.post(
    "/chores/{chore_id}/completions",
    response_model=CompletionResult,
    status_code=status.HTTP_201_CREATED,
    responses={200: {"description": "같은 id로 이미 기록돼 있어 기존 기록을 돌려줌"}},
)
def complete_chore(
    chore_id: str,
    body: CompletionCreate,
    response: Response,
    session: SessionDep,
    today: TodayDep,
    now: NowDep,
) -> CompletionResult:
    chore = _active_chore_or_404(session, chore_id)
    done_on = body.done_on or today
    if done_on > today:
        raise HTTPException(
            status_code=422,
            detail="완료일은 오늘보다 미래일 수 없다",
        )

    completion_id = body.id or new_id()
    existing = session.get(Completion, completion_id)
    if existing is not None:
        return _existing_result(existing, chore, response)

    completion = Completion(
        id=completion_id,
        chore_id=chore.id,
        done_at=now,
        done_on=done_on,
        due_on=chore.last_done_at + timedelta(days=chore.interval_days),
        previous_last_done_at=chore.last_done_at,
    )
    chore.last_done_at = max(chore.last_done_at, done_on)
    chore.updated_at = now
    session.add(completion)
    session.add(chore)
    try:
        session.commit()
    except IntegrityError:
        # 같은 id의 요청이 동시에 들어와 다른 쪽이 먼저 저장한 경우
        session.rollback()
        existing = session.get(Completion, completion_id)
        if existing is None:
            raise
        return _existing_result(existing, _active_chore_or_404(session, chore_id), response)
    session.refresh(completion)
    session.refresh(chore)
    return _result(completion, chore)


def _existing_result(existing: Completion, chore: Chore, response: Response) -> CompletionResult:
    """재시도: 새로 만들지 않고 기존 기록을 200으로 돌려준다. 이미 취소된 기록도 되살리지 않는다."""
    if existing.chore_id != chore.id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="다른 집안일에 쓰인 id다")
    response.status_code = status.HTTP_200_OK
    return _result(existing, chore)


@router.delete("/completions/{completion_id}", response_model=ChoreRead)
def undo_completion(completion_id: str, session: SessionDep, now: NowDep) -> Chore:
    completion = session.get(Completion, completion_id)
    if completion is None or completion.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="완료 기록을 찾을 수 없다")
    chore = _active_chore_or_404(session, completion.chore_id)

    latest_other = session.exec(
        select(func.max(Completion.done_on)).where(
            Completion.chore_id == chore.id,
            Completion.id != completion.id,
            Completion.deleted_at.is_(None),  # type: ignore[union-attr]
        )
    ).one()
    restored = completion.previous_last_done_at
    if latest_other is not None:
        restored = max(restored, latest_other)

    completion.deleted_at = now
    chore.last_done_at = restored
    chore.updated_at = now
    session.add(completion)
    session.add(chore)
    session.commit()
    session.refresh(chore)
    return chore
