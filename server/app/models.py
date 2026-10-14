"""PRD 5장 데이터 모델. 게이지와 상태는 저장하지 않고 계산한다."""

import uuid
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


def new_id() -> str:
    return str(uuid.uuid4())


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Chore(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    name: str
    interval_days: int = Field(ge=1)
    last_done_at: date
    icon: str | None = None
    note: str | None = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    deleted_at: datetime | None = None


class Completion(SQLModel, table=True):
    """완료 기록(F3). 추가만 하고, 실행 취소는 soft delete(deleted_at)로 남겨 동기화(F8)로 전달한다."""

    id: str = Field(default_factory=new_id, primary_key=True)
    chore_id: str = Field(foreign_key="chore.id", index=True)
    done_at: datetime
    """기록한 시각 (UTC)"""
    done_on: date
    """완료한 로컬 날짜"""
    due_on: date
    """완료 시점의 예정일 = 그때의 last_done_at + interval_days. 제때 했는지(done_on <= due_on) 계산용"""
    previous_last_done_at: date
    """완료 직전의 chore.last_done_at. 실행 취소 때 복원한다"""
    deleted_at: datetime | None = None
    """실행 취소 시각"""


class Device(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    local_ip: str | None = None
    push_subscription: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    last_sync_at: datetime | None = None
    last_notified_on: date | None = None
