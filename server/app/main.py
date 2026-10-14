from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.db import create_db_and_tables
from app.routers import chores, completions


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    # 테이블을 만들고, 기존 DB에 없는 열을 추가한다(db.add_missing_columns).
    create_db_and_tables()
    yield


app = FastAPI(title="AIFred", lifespan=lifespan)
app.include_router(chores.router)
app.include_router(completions.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
