"""서버의 "오늘"과 현재 시각.

FastAPI 의존성으로 제공해 테스트에서 dependency_overrides로 고정할 수 있게 한다.
"""

from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from app.config import settings


def today_in(tz_name: str, now: datetime | None = None) -> date:
    """주어진 IANA 시간대 기준 오늘 날짜. now(tz-aware)를 주면 그 시각 기준."""
    zone = ZoneInfo(tz_name)
    return (now.astimezone(zone) if now else datetime.now(zone)).date()


def get_today() -> date:
    """서버의 "오늘" (설정 시간대, 기본 Asia/Seoul)."""
    return today_in(settings.timezone)


def get_now() -> datetime:
    """현재 시각 (UTC, tz-aware). createdAt/updatedAt/deletedAt 기록용."""
    return datetime.now(timezone.utc)
