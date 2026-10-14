from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from app.config import settings
from app.db import create_db_and_tables
from app.presets import seed_presets
from app.routers import chores, completions, presets
from app.web import mount_web


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    # 테이블을 만들고, 기존 DB에 없는 열을 추가한다(db.add_missing_columns).
    create_db_and_tables()
    # 기본 집안일 목록이 한 번도 채워진 적이 없으면 shared/presets.json으로 채운다.
    seed_presets()
    yield


def health() -> dict[str, str]:
    return {"status": "ok"}


def create_app(web_dist: Path | None = settings.web_dist) -> FastAPI:
    application = FastAPI(title="AIFred", lifespan=lifespan)
    application.include_router(chores.router)
    application.include_router(completions.router)
    application.include_router(presets.router)
    application.add_api_route("/api/health", health, methods=["GET"])
    # 웹은 / 전체를 받으므로 API 라우트를 모두 등록한 뒤 맨 마지막에 붙인다.
    mount_web(application, web_dist)
    return application


app = create_app()
