from datetime import date

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db import create_db_and_tables, make_engine
from app.models import Chore


def test_health_returns_ok(tmp_path, monkeypatch):
    # 앱 시작 시 기본 DB 파일 대신 임시 DB를 쓰도록 엔진을 교체한다.
    import app.db as db

    temp_engine = make_engine(f"sqlite:///{(tmp_path / 'app.db').as_posix()}")
    monkeypatch.setattr(db, "engine", temp_engine)

    from app.main import app

    with TestClient(app) as client:
        response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_create_tables_and_save_chore(tmp_path):
    engine = make_engine(f"sqlite:///{(tmp_path / 'test.db').as_posix()}")
    create_db_and_tables(engine)

    with Session(engine) as session:
        chore = Chore(name="화분 물주기", interval_days=7, last_done_at=date(2026, 10, 5))
        session.add(chore)
        session.commit()
        chore_id = chore.id

    with Session(engine) as session:
        loaded = session.exec(select(Chore).where(Chore.id == chore_id)).one()

    assert len(loaded.id) == 36
    assert loaded.name == "화분 물주기"
    assert loaded.interval_days == 7
    assert loaded.last_done_at == date(2026, 10, 5)
    assert loaded.deleted_at is None
