import json
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path

import pytest

from app.models import Chore
from app.status import remaining_days, status_of, todo_summary

CASES_PATH = Path(__file__).resolve().parents[2] / "shared" / "status-cases.json"
CASES = json.loads(CASES_PATH.read_text(encoding="utf-8"))["cases"]


def test_shared_cases_exist():
    assert len(CASES) > 0


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_shared_status_cases(case):
    remaining = remaining_days(
        date.fromisoformat(case["lastDoneAt"]),
        case["intervalDays"],
        date.fromisoformat(case["today"]),
    )
    assert remaining == case["remainingDays"]
    assert status_of(remaining) == case["status"]


@pytest.mark.parametrize("interval", [0, -1, 1.5, True])
def test_remaining_days_rejects_invalid_interval(interval):
    with pytest.raises(ValueError):
        remaining_days(date(2026, 10, 5), interval, date(2026, 10, 6))


@dataclass
class FakeChore:
    name: str
    interval_days: int
    last_done_at: date
    deleted_at: datetime | None = None


TODAY = date(2026, 10, 14)


def make_chores():
    # TODAY 기준 남은 일수를 주석에 적는다.
    return [
        FakeChore("화분 물주기", 7, date(2026, 10, 5)),  # -2
        FakeChore("걸레질", 3, date(2026, 10, 11)),  # 0
        FakeChore("냉장고 청소", 30, date(2026, 10, 1)),  # 17
        FakeChore("빨래", 2, date(2026, 10, 12)),  # 0
        FakeChore("분리수거", 7, date(2026, 10, 1)),  # -6
        FakeChore("이불 빨래", 14, date(2026, 10, 1)),  # 1
        FakeChore(
            "욕실 청소", 7, date(2026, 9, 1), deleted_at=datetime(2026, 10, 10, tzinfo=timezone.utc)
        ),  # 삭제됨 (-36)
    ]


def test_todo_summary_counts_and_top3():
    summary = todo_summary(make_chores(), TODAY)
    # N은 밀린 일 M을 포함한다. 삭제된 욕실 청소는 세지 않는다.
    assert summary.todo == 4
    assert summary.overdue == 2
    # 남은 일수 오름차순, 같으면 이름 오름차순. 상위 3개만.
    assert summary.top_names == ["분리수거", "화분 물주기", "걸레질"]
    assert not summary.is_empty


def test_todo_summary_name_tiebreak():
    chores = [
        FakeChore("빨래", 2, date(2026, 10, 12)),  # 0
        FakeChore("걸레질", 3, date(2026, 10, 11)),  # 0
    ]
    assert todo_summary(chores, TODAY).top_names == ["걸레질", "빨래"]


def test_todo_summary_excludes_deleted_even_if_overdue():
    chores = [
        FakeChore("욕실 청소", 7, date(2026, 9, 1), deleted_at=datetime(2026, 10, 10)),
        FakeChore("화분 물주기", 7, date(2026, 10, 5)),
    ]
    summary = todo_summary(chores, TODAY)
    assert (summary.todo, summary.overdue, summary.top_names) == (1, 1, ["화분 물주기"])


def test_todo_summary_zero():
    chores = [
        FakeChore("냉장고 청소", 30, date(2026, 10, 1)),
        FakeChore("이불 빨래", 14, date(2026, 10, 1)),
        FakeChore("욕실 청소", 7, date(2026, 9, 1), deleted_at=datetime(2026, 10, 10)),
    ]
    summary = todo_summary(chores, TODAY)
    assert summary.todo == 0
    assert summary.overdue == 0
    assert summary.top_names == []
    assert summary.is_empty


def test_todo_summary_empty_input():
    assert todo_summary([], TODAY).is_empty


def test_todo_summary_accepts_model_chore():
    chores = [
        Chore(name="화분 물주기", interval_days=7, last_done_at=date(2026, 10, 5)),
        Chore(name="냉장고 청소", interval_days=30, last_done_at=date(2026, 10, 1)),
    ]
    summary = todo_summary(chores, TODAY)
    assert (summary.todo, summary.overdue, summary.top_names) == (1, 1, ["화분 물주기"])
