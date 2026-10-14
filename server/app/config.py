"""서버 설정값.

기본값은 개발용이며, 환경변수로 덮어쓴다. 비밀값(VAPID 키, 도착 신호 토큰 등)은
코드에 넣지 않고 환경변수나 .env(커밋 금지)로만 주입한다.
"""

import os
from dataclasses import dataclass
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = SERVER_DIR / "data" / "aifred.db"
DEFAULT_WEB_DIST = SERVER_DIR.parent / "web" / "dist"
"""빌드된 웹(web/에서 npm run build). cwd와 관계없이 저장소 위치로 찾는다."""

WEB_DIST_OFF_VALUES = {"", "0", "off", "none", "false"}
"""AIFRED_WEB_DIST가 이 값이면 웹을 제공하지 않고 API만 연다."""


DEFAULT_TIMEZONE = "Asia/Seoul"


@dataclass(frozen=True)
class Settings:
    db_path: Path
    timezone: str = DEFAULT_TIMEZONE
    """서버의 "오늘"을 정하는 IANA 시간대 이름"""
    web_dist: Path | None = DEFAULT_WEB_DIST
    """서버가 / 에서 제공할 빌드된 웹 폴더. None이면 웹을 제공하지 않는다."""

    @property
    def database_url(self) -> str:
        return f"sqlite:///{self.db_path.as_posix()}"


def _load_web_dist() -> Path | None:
    raw = os.environ.get("AIFRED_WEB_DIST")
    if raw is None:
        return DEFAULT_WEB_DIST
    if raw.strip().lower() in WEB_DIST_OFF_VALUES:
        return None
    return Path(raw)


def load_settings() -> Settings:
    db_path = Path(os.environ.get("AIFRED_DB_PATH", str(DEFAULT_DB_PATH)))
    timezone = os.environ.get("AIFRED_TIMEZONE", DEFAULT_TIMEZONE)
    return Settings(db_path=db_path, timezone=timezone, web_dist=_load_web_dist())


settings = load_settings()
