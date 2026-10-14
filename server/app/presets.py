"""기본 집안일 목록의 초기 데이터.

shared/presets.json(원본 문서 docs/chore_presets.md)은 처음 설치할 때 채우는 기본값이다.
preset_category 테이블에 행이 하나도 없을 때(삭제된 행 포함)만 채운다. 한 번 채운 뒤에는 다시 채우지 않아서,
사용자가 지운 기본 항목이 서버를 다시 시작해도 되살아나지 않는다.
"""

import json
import uuid
from pathlib import Path
from typing import Any

from sqlalchemy import func
from sqlalchemy.engine import Engine
from sqlmodel import Session, select

from app.models import PresetCategory, PresetItem, utc_now

PRESETS_PATH = Path(__file__).resolve().parents[2] / "shared" / "presets.json"

_SEED_NAMESPACE = uuid.UUID("5b0c7f8e-2d1a-4c3b-9e6f-a1b2c3d4e5f6")
"""기본 항목 id를 JSON 내용에서 정해진 값(uuid5)으로 만든다. 다시 채워도 같은 id가 나온다."""


def _seed_id(*parts: str) -> str:
    return str(uuid.uuid5(_SEED_NAMESPACE, "/".join(parts)))


def load_preset_data(path: Path = PRESETS_PATH) -> list[dict[str, Any]]:
    return json.loads(path.read_text(encoding="utf-8"))["categories"]


def seed_presets(target: Engine | None = None, path: Path = PRESETS_PATH) -> bool:
    """preset_category가 완전히 비어 있으면 JSON으로 채운다. 채웠으면 True."""
    if target is None:
        from app import db

        target = db.engine

    with Session(target) as session:
        existing = session.exec(select(func.count()).select_from(PresetCategory)).one()
        if existing:
            return False

        now = utc_now()
        for category_order, category in enumerate(load_preset_data(path)):
            category_id = _seed_id("category", category["id"])
            session.add(
                PresetCategory(
                    id=category_id,
                    name=category["name"],
                    emoji=category["emoji"],
                    sort_order=category_order,
                    is_builtin=True,
                    created_at=now,
                    updated_at=now,
                )
            )
            for item_order, item in enumerate(category["items"]):
                session.add(
                    PresetItem(
                        id=_seed_id("item", category["id"], item["name"]),
                        category_id=category_id,
                        name=item["name"],
                        icon=item["icon"],
                        interval_days=item["intervalDays"],
                        note=item.get("note"),
                        sort_order=item_order,
                        is_builtin=True,
                        created_at=now,
                        updated_at=now,
                    )
                )
        session.commit()
    return True
