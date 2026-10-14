"""서버 시작 시 기존 DB에 없는 열을 추가하는 점검(db.add_missing_columns).

옛 스키마는 단계 1 이전의 server/data/aifred.db와 같다. 사용자 DB는 건드리지 않고 tmp_path에서만 확인한다.
"""

import sqlite3

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import inspect

from app.db import SchemaUpgradeError, add_missing_columns, create_db_and_tables, make_engine

OLD_SCHEMA = """
CREATE TABLE chore (
    id VARCHAR NOT NULL,
    name VARCHAR NOT NULL,
    interval_days INTEGER NOT NULL,
    last_done_at DATE NOT NULL,
    icon VARCHAR,
    note VARCHAR,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    deleted_at DATETIME,
    PRIMARY KEY (id)
);
CREATE TABLE device (
    id VARCHAR NOT NULL,
    local_ip VARCHAR,
    push_subscription JSON,
    last_sync_at DATETIME,
    last_notified_on DATE,
    PRIMARY KEY (id)
);
CREATE TABLE completion (
    id VARCHAR NOT NULL,
    chore_id VARCHAR NOT NULL,
    done_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(chore_id) REFERENCES chore (id)
);
CREATE INDEX ix_completion_chore_id ON completion (chore_id);
INSERT INTO chore VALUES (
    'c0ffee00-0000-4000-8000-000000000001', '화분 물주기', 7, '2026-10-05', NULL, NULL,
    '2026-10-01 00:00:00.000000', '2026-10-01 00:00:00.000000', NULL
);
"""

NEW_COMPLETION_COLUMNS = {"done_on", "due_on", "previous_last_done_at", "deleted_at"}
CHORE_ID = "c0ffee00-0000-4000-8000-000000000001"


def make_old_db(path, extra_sql: str = "") -> None:
    with sqlite3.connect(path) as conn:
        conn.executescript(OLD_SCHEMA + extra_sql)
    conn.close()


def columns(engine, table: str) -> dict[str, dict]:
    return {c["name"]: c for c in inspect(engine).get_columns(table)}


def test_app_startup_adds_completion_columns_to_old_db(tmp_path, monkeypatch):
    import app.db as db
    from app.clock import get_today
    from app.main import app

    db_path = tmp_path / "old.db"
    make_old_db(db_path)
    old_engine = make_engine(f"sqlite:///{db_path.as_posix()}")
    monkeypatch.setattr(db, "engine", old_engine)
    assert NEW_COMPLETION_COLUMNS.isdisjoint(columns(old_engine, "completion"))

    from datetime import date

    app.dependency_overrides[get_today] = lambda: date(2026, 10, 14)
    try:
        with TestClient(app) as client:
            cols = columns(old_engine, "completion")
            assert NEW_COMPLETION_COLUMNS <= set(cols)
            # 빈 테이블은 모델 스키마대로 다시 만들어 NOT NULL 제약도 그대로다.
            assert cols["done_on"]["nullable"] is False
            assert cols["due_on"]["nullable"] is False
            assert cols["deleted_at"]["nullable"] is True
            assert "ix_completion_chore_id" in {i["name"] for i in inspect(old_engine).get_indexes("completion")}

            # 기존 집안일은 그대로 남고, 새 API가 동작한다.
            chores = client.get("/api/chores").json()
            assert [c["id"] for c in chores] == [CHORE_ID]
            response = client.post(f"/api/chores/{CHORE_ID}/completions", json={})
            assert response.status_code == 201, response.text
            assert response.json()["completion"]["dueOn"] == "2026-10-12"
    finally:
        app.dependency_overrides.clear()


def test_second_startup_changes_nothing(tmp_path):
    db_path = tmp_path / "old.db"
    make_old_db(db_path)
    engine = make_engine(f"sqlite:///{db_path.as_posix()}")

    create_db_and_tables(engine)

    assert add_missing_columns(engine) == []


def test_nullable_column_is_added_with_alter_and_rows_are_kept(tmp_path):
    # chore 테이블에서 nullable 열(deleted_at)이 빠진 DB: 행이 있어도 ALTER TABLE로 추가한다.
    db_path = tmp_path / "old.db"
    with sqlite3.connect(db_path) as conn:
        conn.executescript(
            f"""
            CREATE TABLE chore (
                id VARCHAR NOT NULL,
                name VARCHAR NOT NULL,
                interval_days INTEGER NOT NULL,
                last_done_at DATE NOT NULL,
                icon VARCHAR,
                note VARCHAR,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL,
                PRIMARY KEY (id)
            );
            INSERT INTO chore VALUES (
                '{CHORE_ID}', '화분 물주기', 7, '2026-10-05', NULL, NULL,
                '2026-10-01 00:00:00.000000', '2026-10-01 00:00:00.000000'
            );
            """
        )
    conn.close()
    engine = make_engine(f"sqlite:///{db_path.as_posix()}")
    assert "deleted_at" not in columns(engine, "chore")

    changes = add_missing_columns(engine)

    assert "chore.deleted_at" in changes
    assert columns(engine, "chore")["deleted_at"]["nullable"] is True
    with sqlite3.connect(db_path) as conn:
        rows = conn.execute("SELECT id, deleted_at FROM chore").fetchall()
    conn.close()
    assert rows == [(CHORE_ID, None)]


def test_not_null_column_on_non_empty_table_stops_startup(tmp_path):
    # 옛 완료 기록이 있으면 done_on/due_on 값을 정할 수 없으므로 데이터를 바꾸지 않고 멈춘다.
    db_path = tmp_path / "old.db"
    make_old_db(
        db_path,
        f"INSERT INTO completion VALUES ('d0ne0000-0000-4000-8000-000000000001', '{CHORE_ID}', "
        "'2026-10-10 09:00:00.000000');",
    )
    engine = make_engine(f"sqlite:///{db_path.as_posix()}")

    with pytest.raises(SchemaUpgradeError, match="completion"):
        create_db_and_tables(engine)

    assert NEW_COMPLETION_COLUMNS.isdisjoint(columns(engine, "completion"))
    with sqlite3.connect(db_path) as conn:
        assert conn.execute("SELECT count(*) FROM completion").fetchone() == (1,)
    conn.close()
