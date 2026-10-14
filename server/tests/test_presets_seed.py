"""기본 집안일 목록의 초기 데이터 채우기(app/presets.py). 사용자 DB는 건드리지 않고 tmp_path에서만 확인한다."""

import json
import sqlite3

from fastapi.testclient import TestClient
from sqlalchemy import inspect
from sqlmodel import Session, select

from app.db import create_db_and_tables, make_engine
from app.models import PresetCategory, PresetItem
from app.presets import PRESETS_PATH, seed_presets
from app.schemas import MAX_INTERVAL_DAYS, PRESET_EMOJI_MAX_LENGTH, PRESET_NAME_MAX_LENGTH

DATA = json.loads(PRESETS_PATH.read_text(encoding="utf-8"))["categories"]


def new_engine(tmp_path, name="app.db"):
    engine = make_engine(f"sqlite:///{(tmp_path / name).as_posix()}")
    create_db_and_tables(engine)
    return engine


def counts(engine) -> tuple[int, int]:
    with Session(engine) as session:
        return (
            len(session.exec(select(PresetCategory)).all()),
            len(session.exec(select(PresetItem)).all()),
        )


def start_app(engine, monkeypatch) -> list[dict]:
    """앱을 한 번 시작했다가 끝내고, 그동안 GET /api/presets 결과를 돌려준다."""
    import app.db as db
    from app.main import app

    monkeypatch.setattr(db, "engine", engine)
    with TestClient(app) as client:
        return client.get("/api/presets").json()


def test_shared_presets_json_is_valid_seed_data():
    assert PRESETS_PATH.name == "presets.json" and PRESETS_PATH.parent.name == "shared"
    items = [item for category in DATA for item in category["items"]]
    assert len(DATA) == 7
    assert len(items) == 40
    for category in DATA:
        assert "optional" not in category
        assert 0 < len(category["name"]) <= PRESET_NAME_MAX_LENGTH
        assert 0 < len(category["emoji"]) <= PRESET_EMOJI_MAX_LENGTH
        names = [item["name"] for item in category["items"]]
        assert len(set(names)) == len(names)
    for item in items:
        assert item["name"] == item["name"].strip()
        assert 0 < len(item["name"]) <= PRESET_NAME_MAX_LENGTH
        assert 0 < len(item["icon"]) <= PRESET_EMOJI_MAX_LENGTH
        assert 1 <= item["intervalDays"] <= MAX_INTERVAL_DAYS


def test_empty_db_is_seeded_with_7_categories_and_40_items_in_json_order(tmp_path):
    engine = new_engine(tmp_path)

    assert seed_presets(engine) is True

    assert counts(engine) == (7, 40)
    with Session(engine) as session:
        categories = session.exec(select(PresetCategory).order_by(PresetCategory.sort_order)).all()
        assert [c.name for c in categories] == [c["name"] for c in DATA]
        assert all(c.is_builtin for c in categories)
        kitchen = categories[0]
        items = session.exec(
            select(PresetItem).where(PresetItem.category_id == kitchen.id).order_by(PresetItem.sort_order)
        ).all()
        assert [i.name for i in items] == [i["name"] for i in DATA[0]["items"]]
        assert [i.sort_order for i in items] == list(range(len(items)))
        assert all(i.is_builtin for i in items)
        food = next(i for i in items if i.name == "음식물 쓰레기 버리기")
        assert (food.icon, food.interval_days, food.note) == ("🥬", 2, "여름에는 매일 권장")
        assert items[0].note is None


def test_seed_runs_only_once(tmp_path):
    engine = new_engine(tmp_path)
    assert seed_presets(engine) is True

    assert seed_presets(engine) is False

    assert counts(engine) == (7, 40)


def test_app_startup_seeds_and_restart_does_not_duplicate(tmp_path, monkeypatch):
    engine = make_engine(f"sqlite:///{(tmp_path / 'app.db').as_posix()}")

    first = start_app(engine, monkeypatch)
    second = start_app(engine, monkeypatch)

    assert len(first) == 7
    assert sum(len(c["items"]) for c in first) == 40
    assert second == first
    assert counts(engine) == (7, 40)


def test_deleted_presets_do_not_come_back_after_restart(tmp_path, monkeypatch):
    import app.db as db
    from app.main import app

    engine = make_engine(f"sqlite:///{(tmp_path / 'app.db').as_posix()}")
    monkeypatch.setattr(db, "engine", engine)
    with TestClient(app) as client:
        for category in client.get("/api/presets").json():
            assert client.delete(f"/api/preset-categories/{category['id']}").status_code == 204
        assert client.get("/api/presets").json() == []

    assert start_app(engine, monkeypatch) == []
    # 지운 행은 soft delete로 남아 있다.
    assert counts(engine) == (7, 40)


def test_deleting_one_builtin_item_survives_restart(tmp_path, monkeypatch):
    import app.db as db
    from app.main import app

    engine = make_engine(f"sqlite:///{(tmp_path / 'app.db').as_posix()}")
    monkeypatch.setattr(db, "engine", engine)
    with TestClient(app) as client:
        kitchen = client.get("/api/presets").json()[0]
        dishes = kitchen["items"][0]
        assert dishes["name"] == "설거지"
        assert client.delete(f"/api/preset-items/{dishes['id']}").status_code == 204

    kitchen = start_app(engine, monkeypatch)[0]
    assert "설거지" not in [i["name"] for i in kitchen["items"]]
    assert len(kitchen["items"]) == 8


def test_old_db_without_preset_tables_gets_them_on_startup(tmp_path, monkeypatch):
    # 기본 목록 이전의 DB: chore 테이블만 있다. create_all이 새 테이블을 만들고 채운다. 기존 행은 그대로다.
    db_path = tmp_path / "old.db"
    with sqlite3.connect(db_path) as conn:
        conn.executescript(
            """
            CREATE TABLE chore (
                id VARCHAR NOT NULL, name VARCHAR NOT NULL, interval_days INTEGER NOT NULL,
                last_done_at DATE NOT NULL, icon VARCHAR, note VARCHAR,
                created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, deleted_at DATETIME,
                PRIMARY KEY (id)
            );
            INSERT INTO chore VALUES (
                'c0ffee00-0000-4000-8000-000000000001', '화분 물주기', 7, '2026-10-05', NULL, NULL,
                '2026-10-01 00:00:00.000000', '2026-10-01 00:00:00.000000', NULL
            );
            """
        )
    conn.close()
    engine = make_engine(f"sqlite:///{db_path.as_posix()}")
    assert not inspect(engine).has_table("preset_category")

    presets = start_app(engine, monkeypatch)

    tables = set(inspect(engine).get_table_names())
    assert {"preset_category", "preset_item"} <= tables
    assert len(presets) == 7
    with sqlite3.connect(db_path) as conn:
        assert conn.execute("SELECT count(*) FROM chore").fetchone() == (1,)
    conn.close()
