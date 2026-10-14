"""기본 집안일 목록 API. 집안일 추가의 첫 화면(선택 화면)에서 쓴다.

처음 목록은 서버가 시작할 때 shared/presets.json으로 채운다(app/presets.py). 이후에는 사용자가 카테고리와 항목을
추가, 수정, 삭제한다. 삭제는 다른 모델처럼 soft delete(deleted_at)다. 정렬 순서를 바꾸는 API는 아직 없다.
"""

import unicodedata
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func
from sqlmodel import Session, select

from app.clock import get_now
from app.db import get_session
from app.models import PresetCategory, PresetItem, new_id
from app.schemas import (
    PresetCategoryCreate,
    PresetCategoryRead,
    PresetCategoryUpdate,
    PresetItemCreate,
    PresetItemRead,
    PresetItemUpdate,
)

router = APIRouter(prefix="/api", tags=["presets"])

SessionDep = Annotated[Session, Depends(get_session)]
NowDep = Annotated[datetime, Depends(get_now)]

_DUPLICATE_CATEGORY = "같은 이름의 카테고리가 이미 있다"
_DUPLICATE_ITEM = "이 카테고리에 같은 이름의 항목이 이미 있다"


def name_key(name: str) -> str:
    """이름이 겹치는지 비교하는 키. 앞뒤 공백을 지우고, 유니코드 정규화(NFC)와 대소문자 무시(casefold)를 한다.

    같은 한글이 조합형/완성형으로 다르게 들어오거나 영문 대소문자만 다른 이름은 같은 이름으로 본다.
    """
    return unicodedata.normalize("NFC", name.strip()).casefold()


def _active_category_or_404(session: Session, category_id: str) -> PresetCategory:
    category = session.get(PresetCategory, category_id)
    if category is None or category.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="카테고리를 찾을 수 없다")
    return category


def _active_item_or_404(session: Session, item_id: str) -> PresetItem:
    item = session.get(PresetItem, item_id)
    if item is None or item.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="항목을 찾을 수 없다")
    return item


def _active_items(session: Session, category_id: str) -> list[PresetItem]:
    return list(
        session.exec(
            select(PresetItem)
            .where(PresetItem.category_id == category_id, PresetItem.deleted_at.is_(None))  # type: ignore[union-attr]
            .order_by(PresetItem.sort_order, PresetItem.created_at)  # type: ignore[arg-type]
        ).all()
    )


def _category_read(category: PresetCategory, items: list[PresetItem]) -> PresetCategoryRead:
    return PresetCategoryRead(
        id=category.id,
        name=category.name,
        emoji=category.emoji,
        is_builtin=category.is_builtin,
        items=[PresetItemRead.model_validate(item) for item in items],
    )


def _ensure_unique_category_name(session: Session, name: str, exclude_id: str | None = None) -> None:
    categories = session.exec(
        select(PresetCategory).where(PresetCategory.deleted_at.is_(None))  # type: ignore[union-attr]
    ).all()
    key = name_key(name)
    if any(c.id != exclude_id and name_key(c.name) == key for c in categories):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_DUPLICATE_CATEGORY)


def _ensure_unique_item_name(session: Session, category_id: str, name: str, exclude_id: str | None = None) -> None:
    key = name_key(name)
    if any(i.id != exclude_id and name_key(i.name) == key for i in _active_items(session, category_id)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_DUPLICATE_ITEM)


def _next_order(session: Session, column: Any, *where: Any) -> int:
    """맨 뒤 순서. 삭제된 행도 포함해 가장 큰 값 + 1이다."""
    current = session.exec(select(func.max(column)).where(*where)).one()
    return 0 if current is None else current + 1


@router.get("/presets", response_model=list[PresetCategoryRead])
def list_presets(session: SessionDep) -> list[PresetCategoryRead]:
    categories = session.exec(
        select(PresetCategory)
        .where(PresetCategory.deleted_at.is_(None))  # type: ignore[union-attr]
        .order_by(PresetCategory.sort_order, PresetCategory.created_at)  # type: ignore[arg-type]
    ).all()
    items = session.exec(
        select(PresetItem)
        .where(PresetItem.deleted_at.is_(None))  # type: ignore[union-attr]
        .order_by(PresetItem.sort_order, PresetItem.created_at)  # type: ignore[arg-type]
    ).all()
    by_category: dict[str, list[PresetItem]] = {}
    for item in items:
        by_category.setdefault(item.category_id, []).append(item)
    return [_category_read(category, by_category.get(category.id, [])) for category in categories]


@router.post("/preset-categories", response_model=PresetCategoryRead, status_code=status.HTTP_201_CREATED)
def create_category(body: PresetCategoryCreate, session: SessionDep, now: NowDep) -> PresetCategoryRead:
    category_id = body.id or new_id()
    # 삭제된 카테고리의 id도 재사용하지 않는다.
    if session.get(PresetCategory, category_id) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="이미 있는 id다")
    _ensure_unique_category_name(session, body.name)
    category = PresetCategory(
        id=category_id,
        name=body.name,
        emoji=body.emoji or "",
        sort_order=_next_order(session, PresetCategory.sort_order),
        is_builtin=False,
        created_at=now,
        updated_at=now,
    )
    session.add(category)
    session.commit()
    session.refresh(category)
    return _category_read(category, [])


@router.patch("/preset-categories/{category_id}", response_model=PresetCategoryRead)
def update_category(
    category_id: str, body: PresetCategoryUpdate, session: SessionDep, now: NowDep
) -> PresetCategoryRead:
    category = _active_category_or_404(session, category_id)
    changes = body.model_dump(exclude_unset=True)
    if "name" in changes:
        _ensure_unique_category_name(session, changes["name"], exclude_id=category.id)
    for field, value in changes.items():
        setattr(category, field, value)
    category.updated_at = now
    session.add(category)
    session.commit()
    session.refresh(category)
    return _category_read(category, _active_items(session, category.id))


@router.delete("/preset-categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(category_id: str, session: SessionDep, now: NowDep) -> Response:
    category = _active_category_or_404(session, category_id)
    for item in _active_items(session, category.id):
        item.deleted_at = now
        item.updated_at = now
        session.add(item)
    category.deleted_at = now
    category.updated_at = now
    session.add(category)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/preset-categories/{category_id}/items",
    response_model=PresetItemRead,
    status_code=status.HTTP_201_CREATED,
)
def create_item(category_id: str, body: PresetItemCreate, session: SessionDep, now: NowDep) -> PresetItem:
    category = _active_category_or_404(session, category_id)
    item_id = body.id or new_id()
    if session.get(PresetItem, item_id) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="이미 있는 id다")
    _ensure_unique_item_name(session, category.id, body.name)
    item = PresetItem(
        id=item_id,
        category_id=category.id,
        name=body.name,
        icon=body.icon or "",
        interval_days=body.interval_days,
        note=body.note,
        sort_order=_next_order(session, PresetItem.sort_order, PresetItem.category_id == category.id),
        is_builtin=False,
        created_at=now,
        updated_at=now,
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@router.patch("/preset-items/{item_id}", response_model=PresetItemRead)
def update_item(item_id: str, body: PresetItemUpdate, session: SessionDep, now: NowDep) -> PresetItem:
    item = _active_item_or_404(session, item_id)
    changes = body.model_dump(exclude_unset=True)
    if "name" in changes:
        _ensure_unique_item_name(session, item.category_id, changes["name"], exclude_id=item.id)
    for field, value in changes.items():
        setattr(item, field, value)
    item.updated_at = now
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@router.delete("/preset-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(item_id: str, session: SessionDep, now: NowDep) -> Response:
    item = _active_item_or_404(session, item_id)
    item.deleted_at = now
    item.updated_at = now
    session.add(item)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
