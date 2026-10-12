from collections.abc import Iterator
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.engine import Engine

from app.db import make_engine

FIXED_TODAY = date(2026, 10, 12)


@pytest.fixture
def engine(tmp_path, monkeypatch) -> Engine:
    """앱이 기본 DB 파일 대신 tmp_path의 SQLite를 쓰도록 엔진을 교체한다."""
    import app.db as db

    temp_engine = make_engine(f"sqlite:///{(tmp_path / 'app.db').as_posix()}")
    monkeypatch.setattr(db, "engine", temp_engine)
    return temp_engine


@pytest.fixture
def client(engine) -> Iterator[TestClient]:
    """"오늘"을 FIXED_TODAY로 고정한 테스트 클라이언트."""
    from app.clock import get_today
    from app.main import app

    app.dependency_overrides[get_today] = lambda: FIXED_TODAY
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()
