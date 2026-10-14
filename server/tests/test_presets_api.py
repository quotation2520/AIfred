"""기본 집안일 목록 API (routers/presets.py). client 픽스처의 tmp DB는 시작할 때 shared/presets.json으로 채워진다."""

from datetime import datetime, timezone

import pytest
from sqlmodel import Session

from app.clock import get_now
from app.main import app
from app.models import PresetCategory, PresetItem
from app.schemas import MAX_INTERVAL_DAYS, PRESET_NAME_MAX_LENGTH

CATEGORY_KEYS = {"id", "name", "emoji", "isBuiltin", "items"}
ITEM_KEYS = {"id", "name", "icon", "intervalDays", "note", "isBuiltin"}

CLIENT_ID = "3f2b8c1e-9a4d-4e6b-8f0a-1c2d3e4f5a6b"
OTHER_ID = "7d1e0c2b-5a4f-4b3c-9d8e-0f1a2b3c4d5e"
MISSING_ID = "00000000-0000-4000-8000-000000000000"

NOW = datetime(2026, 10, 12, 9, 0, tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def fixed_now(client):
    app.dependency_overrides[get_now] = lambda: NOW


def presets(client) -> list[dict]:
    response = client.get("/api/presets")
    assert response.status_code == 200, response.text
    return response.json()


def category_named(client, name: str) -> dict:
    return next(c for c in presets(client) if c["name"] == name)


def add_category(client, **body) -> dict:
    response = client.post("/api/preset-categories", json={"name": "베란다", **body})
    assert response.status_code == 201, response.text
    return response.json()


def add_item(client, category_id: str, **body) -> dict:
    payload = {"name": "방충망 닦기", "intervalDays": 30, **body}
    response = client.post(f"/api/preset-categories/{category_id}/items", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


# --- 조회 ---


def test_list_returns_seeded_categories_in_order_with_camel_case(client):
    body = presets(client)

    assert [c["name"] for c in body] == ["주방", "청소", "욕실", "세탁", "쓰레기", "생활·관리", "반려동물"]
    for category in body:
        assert set(category) == CATEGORY_KEYS
        assert category["isBuiltin"] is True
        for item in category["items"]:
            assert set(item) == ITEM_KEYS
    kitchen = body[0]
    assert kitchen["emoji"] == "🍳"
    assert [i["name"] for i in kitchen["items"]][:3] == ["설거지", "음식물 쓰레기 버리기", "냉장고 정리"]
    assert kitchen["items"][1] == {
        "id": kitchen["items"][1]["id"],
        "name": "음식물 쓰레기 버리기",
        "icon": "🥬",
        "intervalDays": 2,
        "note": "여름에는 매일 권장",
        "isBuiltin": True,
    }
    assert kitchen["items"][0]["note"] is None


# --- 카테고리 추가 ---


def test_create_category_goes_last_with_default_emoji(client):
    created = add_category(client, name="  베란다  ")

    assert set(created) == CATEGORY_KEYS
    assert created["name"] == "베란다"
    assert created["emoji"] == "📁"
    assert created["isBuiltin"] is False
    assert created["items"] == []
    assert len(created["id"]) == 36
    assert presets(client)[-1] == created


def test_create_category_with_client_id_and_emoji(client):
    created = add_category(client, id=CLIENT_ID.upper(), emoji=" 🌿 ")

    assert created["id"] == CLIENT_ID
    assert created["emoji"] == "🌿"


@pytest.mark.parametrize("emoji", [None, "", "   "])
def test_create_category_blank_emoji_uses_default(client, emoji):
    assert add_category(client, emoji=emoji)["emoji"] == "📁"


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"name": ""},
        {"name": "   "},
        {"name": None},
        {"name": "가" * (PRESET_NAME_MAX_LENGTH + 1)},
        {"name": "베란다", "emoji": "🌿" * 17},
        {"name": "베란다", "id": "not-a-uuid"},
        {"name": "베란다", "id": CLIENT_ID.replace("-", "")},
    ],
)
def test_create_category_rejects_invalid_body(client, payload):
    assert client.post("/api/preset-categories", json=payload).status_code == 422


def test_create_category_name_length_limit_is_inclusive(client):
    assert add_category(client, name="가" * PRESET_NAME_MAX_LENGTH)["name"] == "가" * PRESET_NAME_MAX_LENGTH


@pytest.mark.parametrize("name", ["주방", " 주방 "])
def test_create_category_duplicate_name_is_409(client, name):
    response = client.post("/api/preset-categories", json={"name": name})

    assert response.status_code == 409
    assert len(presets(client)) == 7


def test_category_name_compare_ignores_case(client):
    add_category(client, name="Garage")

    assert client.post("/api/preset-categories", json={"name": "garage"}).status_code == 409


def test_deleted_category_name_can_be_reused(client):
    kitchen = category_named(client, "주방")
    client.delete(f"/api/preset-categories/{kitchen['id']}")

    created = add_category(client, name="주방")

    assert created["id"] != kitchen["id"]
    assert created["items"] == []


def test_create_category_duplicate_id_is_409_even_if_deleted(client):
    add_category(client, id=CLIENT_ID)
    assert client.post("/api/preset-categories", json={"id": CLIENT_ID, "name": "다른 이름"}).status_code == 409

    client.delete(f"/api/preset-categories/{CLIENT_ID}")
    assert client.post("/api/preset-categories", json={"id": CLIENT_ID, "name": "다른 이름"}).status_code == 409


# --- 카테고리 수정 ---


def test_patch_category_name_and_emoji(client):
    kitchen = category_named(client, "주방")

    response = client.patch(f"/api/preset-categories/{kitchen['id']}", json={"name": " 부엌 ", "emoji": "🥘"})

    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["name"], body["emoji"]) == ("부엌", "🥘")
    assert body["isBuiltin"] is True
    assert body["items"] == kitchen["items"]
    assert presets(client)[0]["name"] == "부엌"


def test_patch_category_keeps_its_own_name(client):
    kitchen = category_named(client, "주방")

    response = client.patch(f"/api/preset-categories/{kitchen['id']}", json={"name": "주방", "emoji": "🥘"})

    assert response.status_code == 200


def test_patch_category_to_other_name_is_409(client):
    kitchen = category_named(client, "주방")

    response = client.patch(f"/api/preset-categories/{kitchen['id']}", json={"name": "청소"})

    assert response.status_code == 409
    assert category_named(client, "주방")["id"] == kitchen["id"]


@pytest.mark.parametrize(
    "payload",
    [
        {"name": ""},
        {"name": None},
        {"emoji": None},
        {"id": CLIENT_ID},
        {"isBuiltin": False},
        {"sortOrder": 3},
        {"items": []},
    ],
)
def test_patch_category_rejects_invalid_or_unknown_fields(client, payload):
    kitchen = category_named(client, "주방")

    assert client.patch(f"/api/preset-categories/{kitchen['id']}", json=payload).status_code == 422


def test_patch_missing_or_deleted_category_is_404(client):
    assert client.patch(f"/api/preset-categories/{MISSING_ID}", json={"name": "x"}).status_code == 404
    created = add_category(client)
    client.delete(f"/api/preset-categories/{created['id']}")
    assert client.patch(f"/api/preset-categories/{created['id']}", json={"name": "x"}).status_code == 404


# --- 카테고리 삭제 ---


def test_delete_category_soft_deletes_its_items(client, engine):
    kitchen = category_named(client, "주방")

    response = client.delete(f"/api/preset-categories/{kitchen['id']}")

    assert response.status_code == 204
    assert response.content == b""
    assert "주방" not in [c["name"] for c in presets(client)]
    # 안의 항목도 함께 사라져, 수정/삭제하면 404다.
    item_id = kitchen["items"][0]["id"]
    assert client.patch(f"/api/preset-items/{item_id}", json={"name": "x"}).status_code == 404
    assert client.delete(f"/api/preset-items/{item_id}").status_code == 404
    with Session(engine) as session:
        category = session.get(PresetCategory, kitchen["id"])
        assert category is not None and category.deleted_at is not None
        for item in kitchen["items"]:
            row = session.get(PresetItem, item["id"])
            assert row is not None and row.deleted_at is not None


def test_delete_missing_or_deleted_category_is_404(client):
    assert client.delete(f"/api/preset-categories/{MISSING_ID}").status_code == 404
    kitchen = category_named(client, "주방")
    assert client.delete(f"/api/preset-categories/{kitchen['id']}").status_code == 204
    assert client.delete(f"/api/preset-categories/{kitchen['id']}").status_code == 404


# --- 항목 추가 ---


def test_create_item_goes_last_in_category_with_defaults(client):
    kitchen = category_named(client, "주방")

    created = add_item(client, kitchen["id"], name="  오븐 청소 ", intervalDays=60)

    assert set(created) == ITEM_KEYS
    assert created["name"] == "오븐 청소"
    assert created["icon"] == "🧹"
    assert created["intervalDays"] == 60
    assert created["note"] is None
    assert created["isBuiltin"] is False
    assert category_named(client, "주방")["items"][-1] == created


def test_create_item_with_all_fields(client):
    category = add_category(client)

    created = add_item(client, category["id"], id=CLIENT_ID, icon="🪟", note="  봄, 가을  ")
    second = add_item(client, category["id"], id=OTHER_ID, name="화분 분갈이", intervalDays=365, note="  ")

    assert created["id"] == CLIENT_ID
    assert created["icon"] == "🪟"
    assert created["note"] == "봄, 가을"
    assert second["note"] is None
    assert [i["id"] for i in category_named(client, "베란다")["items"]] == [CLIENT_ID, OTHER_ID]


@pytest.mark.parametrize(
    "payload",
    [
        {"intervalDays": 7},
        {"name": "  ", "intervalDays": 7},
        {"name": "가" * (PRESET_NAME_MAX_LENGTH + 1), "intervalDays": 7},
        {"name": "청소"},
        {"name": "청소", "intervalDays": 0},
        {"name": "청소", "intervalDays": MAX_INTERVAL_DAYS + 1},
        {"name": "청소", "intervalDays": "7"},
        {"name": "청소", "intervalDays": 1.5},
        {"name": "청소", "intervalDays": True},
        {"name": "청소", "intervalDays": 7, "note": "가" * 201},
        {"name": "청소", "intervalDays": 7, "id": "not-a-uuid"},
    ],
)
def test_create_item_rejects_invalid_body(client, payload):
    kitchen = category_named(client, "주방")

    response = client.post(f"/api/preset-categories/{kitchen['id']}/items", json=payload)

    assert response.status_code == 422


def test_create_item_interval_limits_are_inclusive(client):
    kitchen = category_named(client, "주방")

    assert add_item(client, kitchen["id"], name="a", intervalDays=1)["intervalDays"] == 1
    assert add_item(client, kitchen["id"], name="b", intervalDays=MAX_INTERVAL_DAYS)["intervalDays"] == MAX_INTERVAL_DAYS


def test_create_item_duplicate_name_in_same_category_is_409(client):
    kitchen = category_named(client, "주방")

    response = client.post(
        f"/api/preset-categories/{kitchen['id']}/items", json={"name": " 설거지 ", "intervalDays": 2}
    )

    assert response.status_code == 409
    assert len(category_named(client, "주방")["items"]) == 9


def test_same_item_name_is_allowed_in_another_category(client):
    other = add_category(client)

    assert add_item(client, other["id"], name="설거지", intervalDays=1)["name"] == "설거지"


def test_deleted_item_name_can_be_reused(client):
    kitchen = category_named(client, "주방")
    client.delete(f"/api/preset-items/{kitchen['items'][0]['id']}")

    assert add_item(client, kitchen["id"], name="설거지", intervalDays=2)["intervalDays"] == 2


def test_create_item_duplicate_id_is_409(client):
    kitchen = category_named(client, "주방")
    add_item(client, kitchen["id"], id=CLIENT_ID)

    response = client.post(
        f"/api/preset-categories/{kitchen['id']}/items",
        json={"id": CLIENT_ID, "name": "다른 이름", "intervalDays": 3},
    )

    assert response.status_code == 409


def test_create_item_in_missing_or_deleted_category_is_404(client):
    body = {"name": "x", "intervalDays": 3}
    assert client.post(f"/api/preset-categories/{MISSING_ID}/items", json=body).status_code == 404
    kitchen = category_named(client, "주방")
    client.delete(f"/api/preset-categories/{kitchen['id']}")
    assert client.post(f"/api/preset-categories/{kitchen['id']}/items", json=body).status_code == 404


# --- 항목 수정 ---


def test_patch_item_changes_only_sent_fields(client):
    kitchen = category_named(client, "주방")
    food = kitchen["items"][1]

    response = client.patch(f"/api/preset-items/{food['id']}", json={"intervalDays": 1, "icon": "🥕"})

    assert response.status_code == 200, response.text
    body = response.json()
    assert body == {**food, "intervalDays": 1, "icon": "🥕"}
    assert category_named(client, "주방")["items"][1] == body


@pytest.mark.parametrize("note", [None, "", "  "])
def test_patch_item_clears_note(client, note):
    food = category_named(client, "주방")["items"][1]

    response = client.patch(f"/api/preset-items/{food['id']}", json={"note": note})

    assert response.status_code == 200
    assert response.json()["note"] is None


def test_patch_item_rename_and_duplicate(client):
    kitchen = category_named(client, "주방")
    dishes = kitchen["items"][0]

    assert client.patch(f"/api/preset-items/{dishes['id']}", json={"name": "설거지"}).status_code == 200
    assert client.patch(f"/api/preset-items/{dishes['id']}", json={"name": "냉장고 정리"}).status_code == 409
    renamed = client.patch(f"/api/preset-items/{dishes['id']}", json={"name": " 그릇 씻기 "})
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "그릇 씻기"


@pytest.mark.parametrize(
    "payload",
    [
        {"name": ""},
        {"name": None},
        {"icon": None},
        {"intervalDays": None},
        {"intervalDays": 0},
        {"intervalDays": MAX_INTERVAL_DAYS + 1},
        {"id": CLIENT_ID},
        {"categoryId": MISSING_ID},
        {"isBuiltin": False},
        {"sortOrder": 1},
    ],
)
def test_patch_item_rejects_invalid_or_unknown_fields(client, payload):
    dishes = category_named(client, "주방")["items"][0]

    assert client.patch(f"/api/preset-items/{dishes['id']}", json=payload).status_code == 422


def test_patch_missing_item_is_404(client):
    assert client.patch(f"/api/preset-items/{MISSING_ID}", json={"name": "x"}).status_code == 404


# --- 항목 삭제 ---


def test_delete_item(client, engine):
    kitchen = category_named(client, "주방")
    dishes = kitchen["items"][0]

    response = client.delete(f"/api/preset-items/{dishes['id']}")

    assert response.status_code == 204
    names = [i["name"] for i in category_named(client, "주방")["items"]]
    assert "설거지" not in names and len(names) == 8
    assert client.delete(f"/api/preset-items/{dishes['id']}").status_code == 404
    assert client.patch(f"/api/preset-items/{dishes['id']}", json={"name": "x"}).status_code == 404
    with Session(engine) as session:
        row = session.get(PresetItem, dishes["id"])
        assert row is not None and row.deleted_at is not None
        assert row.deleted_at.replace(tzinfo=timezone.utc) == NOW


def test_delete_missing_item_is_404(client):
    assert client.delete(f"/api/preset-items/{MISSING_ID}").status_code == 404
