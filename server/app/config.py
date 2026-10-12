"""서버 설정값.

기본값은 개발용이며, 환경변수로 덮어쓴다. 비밀값(VAPID 키, 도착 신호 토큰 등)은
코드에 넣지 않고 환경변수나 .env(커밋 금지)로만 주입한다.
"""

import os
from dataclasses import dataclass
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = SERVER_DIR / "data" / "aifred.db"


@dataclass(frozen=True)
class Settings:
    db_path: Path

    @property
    def database_url(self) -> str:
        return f"sqlite:///{self.db_path.as_posix()}"


def load_settings() -> Settings:
    db_path = Path(os.environ.get("AIFRED_DB_PATH", str(DEFAULT_DB_PATH)))
    return Settings(db_path=db_path)


settings = load_settings()
