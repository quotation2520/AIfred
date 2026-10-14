from datetime import date, datetime, timedelta, timezone

import pytest
from sqlmodel import Session, select

from app.clock import get_now, get_today
from app.main import app
from app.models import Completion

FIXED_TODAY = date(2026, 10, 12)  # conftest.client 픽스처가 고정한 오늘

COMPLETION_KEYS = {"id", "choreId", "doneAt", "doneOn", "dueOn", "previousLastDoneAt", "deletedAt"}
CHORE_KEYS = {
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

DONE_ID = "0b6c1f9e-2a3d-4c5b-9e8f-7a6b5c4d3e2f"
DONE_ID_2 = "1c7d2a0f-3b4e-4d6c-8f9a-8b7c6d5e4f3a"
MISSING_ID = "3f2b8c1e-9a4d-4e6b-8f0a-1c2d3e4f5a6b"


class FakeClock:
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


def set_today(value: date) -> None:
    app.dependency_overrides[get_today] = lambda: value


def create_chore(client, **body):
    payload = {"name": "화분 물주기", "intervalDays": 7, "lastDoneAt": "2026-10-05", **body}
    response = client.post("/api/chores", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def complete(client, chore_id, expected_status=201, **body):
    response = client.post(f"/api/chores/{chore_id}/completions", json=body)
    assert response.status_code == expected_status, response.text
    return response.json()


def completion_rows(engine, chore_id):
    with Session(engine) as session:
        return session.exec(select(Completion).where(Completion.chore_id == chore_id)).all()


# --- 완료 ---


def test_prd_example_complete_overdue_chore(client, clock):
    # PRD 4장: 주기 7일, 10/05 수행 → 10/12 D-Day, 10/14 D+2. 10/14에 완료한다.
    chore = create_chore(client)
    set_today(date(2026, 10, 14))
    clock.tick()

    body = complete(client, chore["id"], id=DONE_ID)

    assert set(body) == {"completion", "chore"}
    completion = body["completion"]
    assert set(completion) == COMPLETION_KEYS
    assert completion["id"] == DONE_ID
    assert completion["choreId"] == chore["id"]
    assert completion["doneOn"] == "2026-10-14"
    assert completion["dueOn"] == "2026-10-12"
    assert completion["previousLastDoneAt"] == "2026-10-05"
    assert completion["deletedAt"] is None
    assert completion["doneAt"].endswith("Z") or completion["doneAt"].endswith("+00:00")

    updated = body["chore"]
    assert set(updated) == CHORE_KEYS
    assert updated["lastDoneAt"] == "2026-10-14"
    assert updated["updatedAt"] != chore["updatedAt"]
    assert client.get(f"/api/chores/{chore['id']}").json() == updated


def test_done_on_defaults_to_server_today_and_id_is_generated(client):
    chore = create_chore(client)

    body = complete(client, chore["id"])

    assert body["completion"]["doneOn"] == FIXED_TODAY.isoformat()
    assert len(body["completion"]["id"]) == 36
    assert body["chore"]["lastDoneAt"] == FIXED_TODAY.isoformat()


def test_early_completion_reschedules_from_done_date(client):
    # 10/05 + 7일 = 10/12 예정. 10/09에 일찍 하면 다음 예정일은 10/16이다.
    chore = create_chore(client)
    set_today(date(2026, 10, 9))

    body = complete(client, chore["id"])

    assert body["completion"]["dueOn"] == "2026-10-12"
    assert body["completion"]["doneOn"] == "2026-10-09"
    assert body["chore"]["lastDoneAt"] == "2026-10-09"
    due = date.fromisoformat(body["chore"]["lastDoneAt"]) + timedelta(days=body["chore"]["intervalDays"])
    assert due == date(2026, 10, 16)


def test_past_done_on_before_last_done_keeps_last_done(client):
    chore = create_chore(client, lastDoneAt="2026-10-10")

    body = complete(client, chore["id"], doneOn="2026-10-08")

    assert body["completion"]["doneOn"] == "2026-10-08"
    assert body["completion"]["dueOn"] == "2026-10-17"
    assert body["chore"]["lastDoneAt"] == "2026-10-10"  # max(기존, 완료일)


def test_same_id_returns_existing_with_200_and_no_duplicate(client, clock, engine):
    chore = create_chore(client)
    first = complete(client, chore["id"], id=DONE_ID)
    clock.tick()

    again = complete(client, chore["id"], expected_status=200, id=DONE_ID, doneOn="2026-10-11")

    assert again["completion"] == first["completion"]
    assert again["chore"] == first["chore"]  # updatedAt도 바뀌지 않는다
    assert len(completion_rows(engine, chore["id"])) == 1


def test_same_id_for_other_chore_is_409(client):
    chore = create_chore(client)
    other = create_chore(client, name="걸레질")
    complete(client, chore["id"], id=DONE_ID)

    response = client.post(f"/api/chores/{other['id']}/completions", json={"id": DONE_ID})

    assert response.status_code == 409


def test_future_done_on_is_422(client, engine):
    chore = create_chore(client)

    response = client.post(f"/api/chores/{chore['id']}/completions", json={"doneOn": "2026-10-13"})

    assert response.status_code == 422
    assert completion_rows(engine, chore["id"]) == []
    assert client.get(f"/api/chores/{chore['id']}").json() == chore


@pytest.mark.parametrize(
    "payload",
    [
        {"doneOn": "1999-12-31"},
        {"doneOn": "2026-10-12T09:00:00"},
        {"doneOn": "2026-02-30"},
        {"doneOn": 20261012},
        {"id": "not-a-uuid"},
    ],
)
def test_invalid_body_is_422(client, payload):
    chore = create_chore(client)

    response = client.post(f"/api/chores/{chore['id']}/completions", json=payload)

    assert response.status_code == 422


def test_missing_or_deleted_chore_is_404(client):
    assert client.post(f"/api/chores/{MISSING_ID}/completions", json={}).status_code == 404

    chore = create_chore(client)
    client.delete(f"/api/chores/{chore['id']}")

    response = client.post(f"/api/chores/{chore['id']}/completions", json={"id": DONE_ID})
    assert response.status_code == 404


# --- 실행 취소 ---


def test_undo_restores_previous_last_done_at(client, clock, engine):
    chore = create_chore(client)
    done = complete(client, chore["id"], id=DONE_ID)
    clock.tick()

    response = client.delete(f"/api/completions/{DONE_ID}")

    assert response.status_code == 200
    restored = response.json()
    assert set(restored) == CHORE_KEYS
    assert restored["lastDoneAt"] == "2026-10-05"
    assert restored["updatedAt"] != done["chore"]["updatedAt"]
    assert client.get(f"/api/chores/{chore['id']}").json() == restored

    [row] = completion_rows(engine, chore["id"])
    assert row.deleted_at is not None
    assert row.deleted_at.replace(tzinfo=timezone.utc) == clock.now


def test_undo_twice_or_missing_is_404(client):
    chore = create_chore(client)
    complete(client, chore["id"], id=DONE_ID)

    assert client.delete(f"/api/completions/{DONE_ID}").status_code == 200
    assert client.delete(f"/api/completions/{DONE_ID}").status_code == 404
    assert client.delete(f"/api/completions/{MISSING_ID}").status_code == 404


def test_retry_after_undo_does_not_recreate(client, engine):
    chore = create_chore(client)
    complete(client, chore["id"], id=DONE_ID)
    client.delete(f"/api/completions/{DONE_ID}")

    again = complete(client, chore["id"], expected_status=200, id=DONE_ID)

    assert again["completion"]["deletedAt"] is not None
    assert again["chore"]["lastDoneAt"] == "2026-10-05"
    assert len(completion_rows(engine, chore["id"])) == 1


def test_two_completions_undo_latest_only(client):
    chore = create_chore(client)
    set_today(date(2026, 10, 12))
    complete(client, chore["id"], id=DONE_ID)  # 10/05 → 10/12
    set_today(date(2026, 10, 14))
    second = complete(client, chore["id"], id=DONE_ID_2)  # 10/12 → 10/14
    assert second["completion"]["previousLastDoneAt"] == "2026-10-12"
    assert second["completion"]["dueOn"] == "2026-10-19"

    restored = client.delete(f"/api/completions/{DONE_ID_2}").json()

    assert restored["lastDoneAt"] == "2026-10-12"


def test_undo_older_completion_keeps_latest_done_on(client):
    # 나중 기록이 남아 있으면 그 날짜가 마지막 수행일이다 (PRD 7장: 완료 기록 중 가장 늦은 날짜).
    chore = create_chore(client)
    set_today(date(2026, 10, 12))
    complete(client, chore["id"], id=DONE_ID)
    set_today(date(2026, 10, 14))
    complete(client, chore["id"], id=DONE_ID_2)

    restored = client.delete(f"/api/completions/{DONE_ID}").json()

    assert restored["lastDoneAt"] == "2026-10-14"


def test_undo_for_deleted_chore_is_404(client):
    chore = create_chore(client)
    complete(client, chore["id"], id=DONE_ID)
    client.delete(f"/api/chores/{chore['id']}")

    assert client.delete(f"/api/completions/{DONE_ID}").status_code == 404
