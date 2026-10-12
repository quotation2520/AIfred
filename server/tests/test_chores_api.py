from datetime import date, datetime, timedelta, timezone

import pytest
from sqlmodel import Session

from app.clock import get_now, get_today, today_in
from app.main import app
from app.models import Chore
from app.schemas import MAX_DATE, MAX_INTERVAL_DAYS, MIN_DATE

FIXED_TODAY = date(2026, 10, 12)  # conftest.client 픽스처가 고정한 오늘

CAMEL_KEYS = {
    "id",
    "name",
    "intervalDays",
    "lastDoneAt",
    "icon",
    "note",
    "createdAt",
    "updatedAt",
    "deletedAt",
}

CLIENT_ID = "3f2b8c1e-9a4d-4e6b-8f0a-1c2d3e4f5a6b"


class FakeClock:
    """get_now 대신 쓰는 시계. tick()으로 시간을 앞으로 보낸다."""

    def __init__(self, start: datetime) -> None:
        self.now = start

    def __call__(self) -> datetime:
        return self.now

    def tick(self, seconds: int = 60) -> None:
        self.now += timedelta(seconds=seconds)


@pytest.fixture
def clock(client):
    fake = FakeClock(datetime(2026, 10, 12, 9, 0, tzinfo=timezone.utc))
    app.dependency_overrides[get_now] = fake
    return fake


def create(client, **body):
    payload = {"name": "화분 물주기", "intervalDays": 7, **body}
    response = client.post("/api/chores", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def parse_utc(value: str) -> datetime:
    assert value.endswith("Z") or value.endswith("+00:00"), value
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    assert parsed.utcoffset() == timedelta(0)
    return parsed


# --- 생성 ---


def test_create_uses_camel_case_and_defaults_last_done_to_today(client):
    response = client.post(
        "/api/chores", json={"name": "  화분 물주기  ", "intervalDays": 7, "icon": "🪴"}
    )

    assert response.status_code == 201
    body = response.json()
    assert set(body) == CAMEL_KEYS
    assert body["name"] == "화분 물주기"
    assert body["intervalDays"] == 7
    assert body["lastDoneAt"] == FIXED_TODAY.isoformat()
    assert body["icon"] == "🪴"
    assert body["note"] is None
    assert body["deletedAt"] is None
    assert len(body["id"]) == 36


def test_create_with_last_done_at(client):
    body = create(client, lastDoneAt="2026-10-05", note="베란다")

    assert body["lastDoneAt"] == "2026-10-05"
    assert body["note"] == "베란다"


def test_response_times_have_utc_offset(client):
    body = create(client)

    created = parse_utc(body["createdAt"])
    updated = parse_utc(body["updatedAt"])
    assert created == updated

    # GET은 SQLite에서 다시 읽은(naive) 값이므로 여기서도 오프셋이 붙어야 한다.
    fetched = client.get(f"/api/chores/{body['id']}").json()
    assert parse_utc(fetched["createdAt"]) == created
    assert parse_utc(client.get("/api/chores").json()[0]["updatedAt"]) == updated


@pytest.mark.parametrize(
    "payload",
    [
        {"name": "", "intervalDays": 7},
        {"name": "   ", "intervalDays": 7},
        {"intervalDays": 7},
        {"name": "청소", "intervalDays": 0},
        {"name": "청소", "intervalDays": -3},
        {"name": "청소", "intervalDays": "7"},
        {"name": "청소", "intervalDays": 1.5},
        {"name": "청소", "intervalDays": True},
        {"name": "청소"},
        {"name": "청소", "intervalDays": 7, "lastDoneAt": "10/05/2026"},
        {"name": "청소", "intervalDays": 7, "lastDoneAt": "2026-10-05T00:00:00"},
        {"name": "청소", "intervalDays": 7, "lastDoneAt": "2026-02-30"},
        {"name": "청소", "intervalDays": 7, "lastDoneAt": 1760000000},
        {"name": "청소", "intervalDays": 7, "id": "not-a-uuid"},
        {"name": "청소", "intervalDays": 7, "id": "3f2b8c1e9a4d4e6b8f0a1c2d3e4f5a6b"},
    ],
)
def test_create_rejects_invalid_input(client, payload):
    response = client.post("/api/chores", json=payload)

    assert response.status_code == 422


def test_create_with_client_id_and_conflict(client):
    body = create(client, id=CLIENT_ID)
    assert body["id"] == CLIENT_ID

    response = client.post("/api/chores", json={"id": CLIENT_ID, "name": "다른 일", "intervalDays": 3})
    assert response.status_code == 409


def test_create_conflicts_with_deleted_chore_id(client):
    create(client, id=CLIENT_ID)
    assert client.delete(f"/api/chores/{CLIENT_ID}").status_code == 204

    response = client.post("/api/chores", json={"id": CLIENT_ID, "name": "다시", "intervalDays": 3})
    assert response.status_code == 409


def test_create_accepts_max_interval_and_list_still_works(client):
    body = create(client, intervalDays=MAX_INTERVAL_DAYS)

    assert body["intervalDays"] == 36500
    response = client.get("/api/chores")
    assert response.status_code == 200
    assert [c["id"] for c in response.json()] == [body["id"]]


@pytest.mark.parametrize("interval", [MAX_INTERVAL_DAYS + 1, 3_000_000, 10**19])
def test_create_rejects_interval_over_max(client, interval):
    response = client.post("/api/chores", json={"name": "청소", "intervalDays": interval})

    assert response.status_code == 422
    assert client.get("/api/chores").json() == []


def test_date_range_constants():
    assert MIN_DATE == date(2000, 1, 1)
    assert MAX_DATE == date(2100, 12, 31)


@pytest.mark.parametrize("last_done_at", ["2000-01-01", "2100-12-31"])
def test_create_accepts_last_done_at_boundaries(client, last_done_at):
    # 상한 날짜 + 최대 주기도 계산할 수 있어야 한다.
    body = create(client, intervalDays=MAX_INTERVAL_DAYS, lastDoneAt=last_done_at)

    assert body["lastDoneAt"] == last_done_at
    assert client.get("/api/chores").status_code == 200


@pytest.mark.parametrize("last_done_at", ["1999-12-31", "2101-01-01", "9999-12-31", "0001-01-01"])
def test_create_rejects_last_done_at_out_of_range(client, last_done_at):
    response = client.post(
        "/api/chores", json={"name": "청소", "intervalDays": 7, "lastDoneAt": last_done_at}
    )

    assert response.status_code == 422
    list_response = client.get("/api/chores")
    assert list_response.status_code == 200
    assert list_response.json() == []


# --- 조회 ---


def test_get_one_and_404(client):
    body = create(client)

    assert client.get(f"/api/chores/{body['id']}").json() == body
    assert client.get(f"/api/chores/{CLIENT_ID}").status_code == 404


def test_list_sorted_by_urgency_and_excludes_deleted(client):
    # 오늘 = 2026-10-12
    create(client, name="화분 물주기", intervalDays=7, lastDoneAt="2026-10-05")  # 0 (D-Day)
    create(client, name="빨래", intervalDays=3, lastDoneAt="2026-10-07")  # -2 (D+2)
    create(client, name="가습기", intervalDays=1, lastDoneAt="2026-10-12")  # 1
    create(client, name="걸레질", intervalDays=7, lastDoneAt="2026-10-05")  # 0, 이름순으로 화분 앞
    gone = create(client, name="버린 일", intervalDays=1, lastDoneAt="2026-09-01")
    client.delete(f"/api/chores/{gone['id']}")

    names = [c["name"] for c in client.get("/api/chores").json()]

    assert names == ["빨래", "걸레질", "화분 물주기", "가습기"]


def test_list_empty(client):
    assert client.get("/api/chores").json() == []


# --- 수정 ---


def test_patch_updates_fields_and_updated_at(client, clock):
    body = create(client, icon="🪴", note="베란다")
    clock.tick()

    response = client.patch(
        f"/api/chores/{body['id']}",
        json={"name" : " 화분 물 주기 ", "intervalDays": 5, "lastDoneAt": "2026-10-10", "note": None},
    )

    assert response.status_code == 200
    patched = response.json()
    assert set(patched) == CAMEL_KEYS
    assert patched["name"] == "화분 물 주기"
    assert patched["intervalDays"] == 5
    assert patched["lastDoneAt"] == "2026-10-10"
    assert patched["icon"] == "🪴"  # 보내지 않은 필드는 그대로
    assert patched["note"] is None  # null로 지울 수 있다
    assert patched["createdAt"] == body["createdAt"]
    assert parse_utc(patched["updatedAt"]) > parse_utc(body["updatedAt"])
    assert client.get(f"/api/chores/{body['id']}").json() == patched


@pytest.mark.parametrize(
    "payload",
    [
        {"name": ""},
        {"name": None},
        {"intervalDays": 0},
        {"intervalDays": "7"},
        {"intervalDays": None},
        {"lastDoneAt": None},
        {"id": CLIENT_ID},
        {"createdAt": "2026-01-01T00:00:00Z"},
        {"updatedAt": "2026-01-01T00:00:00Z"},
        {"deletedAt": "2026-01-01T00:00:00Z"},
        {"unknown": 1},
    ],
)
def test_patch_rejects_invalid_or_immutable_fields(client, payload):
    body = create(client)

    response = client.patch(f"/api/chores/{body['id']}", json=payload)

    assert response.status_code == 422
    assert client.get(f"/api/chores/{body['id']}").json() == body


def test_patch_accepts_max_interval(client):
    body = create(client)

    response = client.patch(f"/api/chores/{body['id']}", json={"intervalDays": MAX_INTERVAL_DAYS})

    assert response.status_code == 200
    assert response.json()["intervalDays"] == 36500
    assert client.get("/api/chores").status_code == 200


@pytest.mark.parametrize("interval", [MAX_INTERVAL_DAYS + 1, 3_000_000, 10**19])
def test_patch_rejects_interval_over_max(client, interval):
    body = create(client)

    response = client.patch(f"/api/chores/{body['id']}", json={"intervalDays": interval})

    assert response.status_code == 422
    assert client.get(f"/api/chores/{body['id']}").json() == body
    assert client.get("/api/chores").status_code == 200


@pytest.mark.parametrize("last_done_at", ["2000-01-01", "2100-12-31"])
def test_patch_accepts_last_done_at_boundaries(client, last_done_at):
    body = create(client)

    response = client.patch(f"/api/chores/{body['id']}", json={"lastDoneAt": last_done_at})

    assert response.status_code == 200
    assert response.json()["lastDoneAt"] == last_done_at
    assert client.get("/api/chores").status_code == 200


@pytest.mark.parametrize("last_done_at", ["1999-12-31", "2101-01-01", "9999-12-31", "0001-01-01"])
def test_patch_rejects_last_done_at_out_of_range(client, last_done_at):
    body = create(client)

    response = client.patch(f"/api/chores/{body['id']}", json={"lastDoneAt": last_done_at})

    assert response.status_code == 422
    assert client.get(f"/api/chores/{body['id']}").json() == body
    assert client.get("/api/chores").status_code == 200


def test_patch_missing_or_deleted_is_404(client):
    assert client.patch(f"/api/chores/{CLIENT_ID}", json={"name": "x"}).status_code == 404

    body = create(client)
    client.delete(f"/api/chores/{body['id']}")
    assert client.patch(f"/api/chores/{body['id']}", json={"name": "x"}).status_code == 404


# --- 삭제 ---


def test_delete_is_soft(client, clock, engine):
    body = create(client)
    clock.tick()

    response = client.delete(f"/api/chores/{body['id']}")

    assert response.status_code == 204
    assert response.content == b""
    assert client.get(f"/api/chores/{body['id']}").status_code == 404
    assert client.get("/api/chores").json() == []

    with Session(engine) as session:
        row = session.get(Chore, body["id"])
    assert row is not None
    assert row.deleted_at is not None
    assert row.deleted_at == row.updated_at
    assert row.updated_at.replace(tzinfo=timezone.utc) == clock.now


def test_delete_twice_or_missing_is_404(client):
    body = create(client)

    assert client.delete(f"/api/chores/{body['id']}").status_code == 204
    assert client.delete(f"/api/chores/{body['id']}").status_code == 404
    assert client.delete(f"/api/chores/{CLIENT_ID}").status_code == 404


# --- 서버의 "오늘" ---


def test_today_in_uses_kst_date():
    # UTC 10/11 15:30 = KST 10/12 00:30. tzdata가 있어야 Windows에서도 Asia/Seoul을 찾는다.
    instant = datetime(2026, 10, 11, 15, 30, tzinfo=timezone.utc)

    assert today_in("Asia/Seoul", now=instant) == date(2026, 10, 12)
    assert today_in("UTC", now=instant) == date(2026, 10, 11)


def test_get_today_defaults_to_seoul():
    from app.config import settings

    assert settings.timezone == "Asia/Seoul"
    assert isinstance(get_today(), date)


def test_post_default_follows_overridden_today(client):
    app.dependency_overrides[get_today] = lambda: date(2026, 10, 5)

    assert create(client)["lastDoneAt"] == "2026-10-05"
