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
    id: str = Field(default_factory=new_id, primary_key=True)
    chore_id: str = Field(foreign_key="chore.id", index=True)
    done_at: datetime


class Device(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    local_ip: str | None = None
    push_subscription: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    last_sync_at: datetime | None = None
    last_notified_on: date | None = None
