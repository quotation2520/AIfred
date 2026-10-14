from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import func, inspect, select, text
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.schema import CreateColumn, Table
from sqlmodel import Session, SQLModel, create_engine

from app.config import settings


def make_engine(database_url: str) -> Engine:
    # FastAPI는 요청을 여러 스레드에서 처리하므로 SQLite 스레드 검사를 끈다.
    return create_engine(database_url, connect_args={"check_same_thread": False})


engine = make_engine(settings.database_url)


class SchemaUpgradeError(RuntimeError):
    """기존 행이 있는 테이블에 값을 정할 수 없는 NOT NULL 열을 추가해야 할 때."""


def create_db_and_tables(target: Engine | None = None) -> None:
    # 테이블 등록을 위해 모델을 불러온다.
    from app import models  # noqa: F401

    target = target or engine
    db_file = target.url.database
    if db_file and db_file != ":memory:":
        Path(db_file).parent.mkdir(parents=True, exist_ok=True)
    SQLModel.metadata.create_all(target)
    add_missing_columns(target)


def add_missing_columns(target: Engine) -> list[str]:
    """모델에는 있지만 기존 테이블에 없는 열을 추가한다. 마이그레이션 도구 대신 쓰는 간단한 점검이다.

    - NULL을 허용하는 열: ALTER TABLE ... ADD COLUMN으로 추가한다. 기존 행의 값은 NULL이다.
    - NOT NULL 열(서버 기본값 없음): SQLite는 기본값 없는 NOT NULL 열을 ADD COLUMN할 수 없고,
      기존 행에 넣을 올바른 값(예: 완료 기록의 due_on)도 정할 수 없다.
      - 테이블이 비어 있으면 테이블을 지우고 모델 스키마대로 다시 만든다(잃을 데이터가 없다).
      - 행이 있으면 데이터를 바꾸지 않고 SchemaUpgradeError로 시작을 멈춘다.

    바뀐 내용을 "table.column" 목록으로 돌려준다(테스트·로그용).
    """
    from app import models  # noqa: F401

    changes: list[str] = []
    inspector = inspect(target)
    with target.begin() as conn:
        for table in SQLModel.metadata.sorted_tables:
            if not inspector.has_table(table.name):
                continue
            existing = {column["name"] for column in inspector.get_columns(table.name)}
            missing = [column for column in table.columns if column.name not in existing]
            if not missing:
                continue
            names = [f"{table.name}.{column.name}" for column in missing]
            required = [c for c in missing if not c.nullable and c.server_default is None]
            if required:
                _recreate_empty_table(conn, table, [c.name for c in required])
            else:
                for column in missing:
                    ddl = CreateColumn(column).compile(dialect=conn.dialect)
                    conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN {ddl}'))
                for index in table.indexes:
                    if any(column in missing for column in index.columns):
                        index.create(conn, checkfirst=True)
            changes.extend(names)
    return changes


def _recreate_empty_table(conn: Connection, table: Table, required: list[str]) -> None:
    rows = conn.execute(select(func.count()).select_from(text(f'"{table.name}"'))).scalar_one()
    if rows:
        raise SchemaUpgradeError(
            f"{table.name} 테이블에 행이 {rows}개 있어 NOT NULL 열({', '.join(required)})을 추가할 수 없다. "
            "기존 행의 값을 정해 직접 옮긴 뒤 다시 시작해야 한다."
        )
    table.drop(conn)
    table.create(conn)


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
