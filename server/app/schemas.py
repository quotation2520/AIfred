"""API 요청/응답 스키마.

DB 모델(models.py)은 snake_case를 유지하고, API JSON은 camelCase로 주고받는다.
- 날짜(lastDoneAt): "YYYY-MM-DD"
- 시각(createdAt/updatedAt/deletedAt): UTC ISO 8601 ("Z" 포함). SQLite에서 읽은 naive datetime은
  UTC로 간주한다. 이 정규화는 UtcDatetime 한 곳에서만 처리한다.
"""

import re
import uuid
from datetime import date, datetime, timezone
from typing import Annotated, Any

from pydantic import AfterValidator, BaseModel, BeforeValidator, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel


def as_utc(value: datetime) -> datetime:
    """naive datetime은 UTC로 간주해 tzinfo를 붙이고, aware datetime은 UTC로 변환한다."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


_DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")


def _date_string(value: Any) -> Any:
    """요청의 날짜는 "YYYY-MM-DD" 문자열만 받는다 (시각이 붙은 문자열, 숫자 등은 거부)."""
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if not isinstance(value, str) or not _DATE_RE.fullmatch(value):
        raise ValueError('날짜는 "YYYY-MM-DD" 형식이어야 한다')
    return value


MAX_INTERVAL_DAYS = 36500
"""주기 상한(100년). 날짜 계산 overflow와 SQLite 정수 overflow를 막는다. web의 ChoreForm과 같은 값이다."""

MIN_DATE = date(2000, 1, 1)
MAX_DATE = date(2100, 12, 31)
"""lastDoneAt 허용 범위. 제품 규칙이 아니라 날짜 계산 overflow를 막기 위한 범위다. web의 ChoreForm과 같은 값이다."""


def _date_in_range(value: date) -> date:
    if not MIN_DATE <= value <= MAX_DATE:
        raise ValueError(f"날짜는 {MIN_DATE.isoformat()}~{MAX_DATE.isoformat()} 사이여야 한다")
    return value


UtcDatetime = Annotated[datetime, AfterValidator(as_utc)]
IntervalDays = Annotated[int, Field(strict=True, ge=1, le=MAX_INTERVAL_DAYS)]
DateOnly = Annotated[date, BeforeValidator(_date_string), AfterValidator(_date_in_range)]


def _clean_name(value: str) -> str:
    stripped = value.strip()
    if not stripped:
        raise ValueError("이름은 비어 있을 수 없다")
    return stripped


def _clean_id(value: str) -> str:
    """하이픈이 있는 표준 UUID 문자열만 받는다. 저장은 소문자로 한다."""
    try:
        parsed = uuid.UUID(value)
    except ValueError as exc:
        raise ValueError("id는 UUID 형식이어야 한다") from exc
    canonical = str(parsed)
    if canonical != value.lower():
        raise ValueError("id는 8-4-4-4-12 형식의 UUID 문자열이어야 한다")
    return canonical


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ChoreCreate(CamelModel):
    id: str | None = None
    name: str
    interval_days: IntervalDays
    last_done_at: DateOnly | None = None
    """없으면 서버의 오늘"""
    icon: str | None = None
    note: str | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return _clean_name(value)

    @field_validator("id")
    @classmethod
    def _id(cls, value: str | None) -> str | None:
        return None if value is None else _clean_id(value)


class ChoreUpdate(CamelModel):
    """부분 수정. 보낸 필드만 바꾼다. 바꿀 수 없는 필드(id, createdAt 등)는 422로 거부한다."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = None
    interval_days: IntervalDays | None = None
    last_done_at: DateOnly | None = None
    icon: str | None = None
    note: str | None = None

    @field_validator("name", "interval_days", "last_done_at", mode="before")
    @classmethod
    def _required_not_null(cls, value: Any) -> Any:
        # 필수 필드는 생략은 가능하지만 null로 지울 수는 없다. (icon/note는 null로 지울 수 있다.)
        if value is None:
            raise ValueError("null로 바꿀 수 없는 필드다")
        return value

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return _clean_name(value)


class ChoreRead(CamelModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    interval_days: int
    last_done_at: date
    icon: str | None
    note: str | None
    created_at: UtcDatetime
    updated_at: UtcDatetime
    deleted_at: UtcDatetime | None


# --- 기본 집안일 목록 (routers/presets.py) ---

PRESET_NAME_MAX_LENGTH = 50
"""카테고리·항목 이름 길이 상한. web의 lib/presets.ts와 같은 값이다."""
PRESET_EMOJI_MAX_LENGTH = 16
"""이모지·아이콘 길이 상한(코드 포인트). ZWJ로 이은 이모지(👨‍👩‍👧 등)도 들어가는 넉넉한 값이다."""
PRESET_NOTE_MAX_LENGTH = 200

DEFAULT_CATEGORY_EMOJI = "📁"
DEFAULT_ITEM_ICON = "🧹"


def _clean_preset_name(value: str) -> str:
    name = _clean_name(value)
    if len(name) > PRESET_NAME_MAX_LENGTH:
        raise ValueError(f"이름은 {PRESET_NAME_MAX_LENGTH}자 이하여야 한다")
    return name


def _clean_emoji(value: str | None, default: str) -> str:
    """앞뒤 공백을 지운다. 비어 있으면 기본값을 쓴다."""
    stripped = (value or "").strip()
    if len(stripped) > PRESET_EMOJI_MAX_LENGTH:
        raise ValueError(f"이모지는 {PRESET_EMOJI_MAX_LENGTH}자 이하여야 한다")
    return stripped or default


def _clean_note(value: str | None) -> str | None:
    """앞뒤 공백을 지운다. 비어 있으면 메모 없음(null)이다."""
    if value is None:
        return None
    stripped = value.strip()
    if len(stripped) > PRESET_NOTE_MAX_LENGTH:
        raise ValueError(f"메모는 {PRESET_NOTE_MAX_LENGTH}자 이하여야 한다")
    return stripped or None


def _not_null(value: Any) -> Any:
    if value is None:
        raise ValueError("null로 바꿀 수 없는 필드다")
    return value


class PresetCategoryCreate(CamelModel):
    id: str | None = None
    name: str
    emoji: str | None = Field(default=None, validate_default=True)
    """없거나 비어 있으면 📁"""

    @field_validator("id")
    @classmethod
    def _id(cls, value: str | None) -> str | None:
        return None if value is None else _clean_id(value)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return _clean_preset_name(value)

    @field_validator("emoji")
    @classmethod
    def _emoji(cls, value: str | None) -> str:
        return _clean_emoji(value, DEFAULT_CATEGORY_EMOJI)


class PresetCategoryUpdate(CamelModel):
    """이름과 이모지만 바꿀 수 있다. 다른 필드(id, sortOrder 등)는 422로 거부한다."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = None
    emoji: str | None = None

    @field_validator("name", "emoji", mode="before")
    @classmethod
    def _required_not_null(cls, value: Any) -> Any:
        return _not_null(value)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return _clean_preset_name(value)

    @field_validator("emoji")
    @classmethod
    def _emoji(cls, value: str) -> str:
        return _clean_emoji(value, DEFAULT_CATEGORY_EMOJI)


class PresetItemCreate(CamelModel):
    id: str | None = None
    name: str
    icon: str | None = Field(default=None, validate_default=True)
    """없거나 비어 있으면 🧹"""
    interval_days: IntervalDays
    note: str | None = None

    @field_validator("id")
    @classmethod
    def _id(cls, value: str | None) -> str | None:
        return None if value is None else _clean_id(value)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return _clean_preset_name(value)

    @field_validator("icon")
    @classmethod
    def _icon(cls, value: str | None) -> str:
        return _clean_emoji(value, DEFAULT_ITEM_ICON)

    @field_validator("note")
    @classmethod
    def _note(cls, value: str | None) -> str | None:
        return _clean_note(value)


class PresetItemUpdate(CamelModel):
    """이름, 아이콘, 주기, 메모만 바꿀 수 있다. 메모는 null이나 빈 문자열로 지운다."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = None
    icon: str | None = None
    interval_days: IntervalDays | None = None
    note: str | None = None

    @field_validator("name", "icon", "interval_days", mode="before")
    @classmethod
    def _required_not_null(cls, value: Any) -> Any:
        return _not_null(value)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return _clean_preset_name(value)

    @field_validator("icon")
    @classmethod
    def _icon(cls, value: str) -> str:
        return _clean_emoji(value, DEFAULT_ITEM_ICON)

    @field_validator("note")
    @classmethod
    def _note(cls, value: str | None) -> str | None:
        return _clean_note(value)


class PresetItemRead(CamelModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    icon: str
    interval_days: int
    note: str | None
    is_builtin: bool


class PresetCategoryRead(CamelModel):
    id: str
    name: str
    emoji: str
    is_builtin: bool
    items: list[PresetItemRead]


class CompletionCreate(CamelModel):
    """완료 체크 요청. id는 재시도에 안전하도록 클라이언트가 정한다."""

    id: str | None = None
    done_on: DateOnly | None = None
    """완료한 날짜. 없으면 서버의 오늘. 오늘보다 미래면 422"""

    @field_validator("id")
    @classmethod
    def _id(cls, value: str | None) -> str | None:
        return None if value is None else _clean_id(value)


class CompletionRead(CamelModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    chore_id: str
    done_at: UtcDatetime
    done_on: date
    due_on: date
    previous_last_done_at: date
    deleted_at: UtcDatetime | None


class CompletionResult(CamelModel):
    """완료 체크 응답. 갱신된 집안일을 함께 돌려줘 화면이 바로 반영하게 한다."""

    completion: CompletionRead
    chore: ChoreRead
