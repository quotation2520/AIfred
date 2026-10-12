"""PRD 4장 상태 계산 중 알림(7장)에 필요한 부분.

게이지와 배지는 화면(web/src/lib/choreStatus.ts)에서 계산한다. 서버는 오늘 할 일/밀린 일 개수와
상위 이름만 계산한다. 두 구현은 shared/status-cases.json으로 함께 검증한다.
"오늘"은 항상 인자로 받는다. 이 모듈은 현재 시각을 읽지 않는다.
"""

from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Literal, Protocol

StatusKind = Literal["ok", "soon", "today", "overdue"]

TOP_N = 3


class ChoreLike(Protocol):
    """models.Chore 또는 같은 속성을 가진 객체."""

    name: str
    interval_days: int
    last_done_at: date
    deleted_at: object | None


@dataclass(frozen=True)
class TodoSummary:
    todo: int
    """오늘 할 일 개수 N (밀린 일 포함)"""
    overdue: int
    """밀린 일 개수 M"""
    top_names: list[str] = field(default_factory=list)
    """정렬 기준 상위 3개 이름"""

    @property
    def is_empty(self) -> bool:
        """할 일이 0개이면 알림을 보내지 않는다 (PRD 7장)."""
        return self.todo == 0


def remaining_days(last_done_at: date, interval_days: int, today: date) -> int:
    """남은 일수 = (마지막 수행일 + 주기) - 오늘."""
    if isinstance(interval_days, bool) or not isinstance(interval_days, int) or interval_days < 1:
        raise ValueError(f"주기는 1 이상의 정수여야 한다: {interval_days!r}")
    due_date = last_done_at + timedelta(days=interval_days)
    return (due_date - today).days


def status_of(remaining: int) -> StatusKind:
    if remaining >= 2:
        return "ok"
    if remaining == 1:
        return "soon"
    if remaining == 0:
        return "today"
    return "overdue"


def _sorted_active[C: ChoreLike](chores: Iterable[C], today: date) -> list[tuple[int, C]]:
    """삭제되지 않은 집안일을 남은 일수 오름차순, 같으면 이름 오름차순으로 정렬한다."""
    entries = [
        (remaining_days(c.last_done_at, c.interval_days, today), c)
        for c in chores
        if c.deleted_at is None
    ]
    entries.sort(key=lambda e: (e[0], e[1].name))
    return entries


def sorted_by_urgency[C: ChoreLike](chores: Iterable[C], today: date) -> list[C]:
    """삭제되지 않은 집안일을 긴급도 순서(남은 일수 오름차순, 같으면 이름 오름차순)로 돌려준다."""
    return [c for _, c in _sorted_active(chores, today)]


def todo_summary(chores: Iterable[ChoreLike], today: date) -> TodoSummary:
    """알림 문구 "오늘 할 일 N개 · 밀린 일 M개"와 상위 3개 이름."""
    todo_entries = [(r, c) for r, c in _sorted_active(chores, today) if r <= 0]
    overdue = sum(1 for r, _ in todo_entries if r < 0)
    return TodoSummary(
        todo=len(todo_entries),
        overdue=overdue,
        top_names=[c.name for _, c in todo_entries[:TOP_N]],
    )
