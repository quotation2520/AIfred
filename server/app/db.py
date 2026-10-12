from collections.abc import Iterator
from pathlib import Path

from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine

from app.config import settings


def make_engine(database_url: str) -> Engine:
    # FastAPI는 요청을 여러 스레드에서 처리하므로 SQLite 스레드 검사를 끈다.
    return create_engine(database_url, connect_args={"check_same_thread": False})


engine = make_engine(settings.database_url)


def create_db_and_tables(target: Engine | None = None) -> None:
    # 테이블 등록을 위해 모델을 불러온다.
    from app import models  # noqa: F401

    target = target or engine
    db_file = target.url.database
    if db_file and db_file != ":memory:":
        Path(db_file).parent.mkdir(parents=True, exist_ok=True)
    SQLModel.metadata.create_all(target)


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
