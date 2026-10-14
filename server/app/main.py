from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.db import create_db_and_tables
from app.presets import seed_presets
from app.routers import chores, completions, presets


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    # 테이블을 만들고, 기존 DB에 없는 열을 추가한다(db.add_missing_columns).
    create_db_and_tables()
    # 기본 집안일 목록이 한 번도 채워진 적이 없으면 shared/presets.json으로 채운다.
    seed_presets()
    yield


app = FastAPI(title="AIFred", lifespan=lifespan)
app.include_router(chores.router)
app.include_router(completions.router)
app.include_router(presets.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
