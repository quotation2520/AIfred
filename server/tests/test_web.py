"""서버가 빌드된 웹(web/dist)을 함께 제공하는지 확인한다. 가짜 dist를 tmp_path에 만든다."""

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import DEFAULT_WEB_DIST, load_settings
from app.main import create_app

INDEX_HTML = "<!doctype html><title>AIFred</title>"
ASSET_JS = "console.log('aifred')"


@pytest.fixture
def fake_dist(tmp_path) -> Path:
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text(INDEX_HTML, encoding="utf-8")
    (dist / "assets" / "x.js").write_text(ASSET_JS, encoding="utf-8")
    (dist / "sw.js").write_text("// sw", encoding="utf-8")
    return dist


def _client(dist: Path | None) -> Iterator[TestClient]:
    with TestClient(create_app(dist)) as test_client:
        yield test_client


@pytest.fixture
def web_client(engine, fake_dist) -> Iterator[TestClient]:
    yield from _client(fake_dist)


@pytest.fixture
def api_only_client(engine, tmp_path) -> Iterator[TestClient]:
    yield from _client(tmp_path / "no-dist")


def test_root_serves_index_html_without_cache(web_client):
    response = web_client.get("/")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert response.text == INDEX_HTML
    assert response.headers["cache-control"] == "no-cache"


def test_hashed_assets_are_cached_long(web_client):
    response = web_client.get("/assets/x.js")

    assert response.status_code == 200
    assert response.text == ASSET_JS
    assert "immutable" in response.headers["cache-control"]


def test_service_worker_is_not_cached(web_client):
    response = web_client.get("/sw.js")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-cache"


def test_api_takes_priority_over_web(web_client):
    response = web_client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

    chores = web_client.get("/api/chores")
    assert chores.status_code == 200
    assert chores.json() == []


def test_unknown_path_is_404_without_spa_fallback(web_client):
    # 화면 이동은 해시(#/add)라서 모르는 경로에 index.html을 주지 않는다.
    assert web_client.get("/add").status_code == 404
    assert web_client.get("/api/nope").status_code == 404


def test_revalidation_keeps_no_cache_header(web_client):
    first = web_client.get("/")
    etag = first.headers["etag"]

    second = web_client.get("/", headers={"If-None-Match": etag})

    assert second.status_code == 304
    assert second.headers["cache-control"] == "no-cache"


def test_without_dist_api_works_and_root_is_404(api_only_client):
    assert api_only_client.get("/api/health").json() == {"status": "ok"}
    assert api_only_client.get("/").status_code == 404


def test_missing_dist_logs_warning(engine, tmp_path, caplog):
    with caplog.at_level("WARNING", logger="aifred.web"):
        create_app(tmp_path / "no-dist")

    assert any("API만 제공" in record.getMessage() for record in caplog.records)


def test_web_disabled_with_none(engine):
    with TestClient(create_app(None)) as client:
        assert client.get("/api/health").status_code == 200
        assert client.get("/").status_code == 404


@pytest.mark.parametrize("value", ["", "off", "OFF", "none", "0", "false"])
def test_setting_can_turn_web_off(monkeypatch, value):
    monkeypatch.setenv("AIFRED_WEB_DIST", value)

    assert load_settings().web_dist is None


def test_setting_points_to_custom_dist(monkeypatch, fake_dist):
    monkeypatch.setenv("AIFRED_WEB_DIST", str(fake_dist))

    assert load_settings().web_dist == fake_dist


def test_default_dist_is_repo_web_dist_regardless_of_cwd(monkeypatch, tmp_path):
    monkeypatch.delenv("AIFRED_WEB_DIST", raising=False)
    monkeypatch.chdir(tmp_path)

    web_dist = load_settings().web_dist
    assert web_dist == DEFAULT_WEB_DIST
    assert web_dist.is_absolute()
    assert web_dist.parts[-2:] == ("web", "dist")
