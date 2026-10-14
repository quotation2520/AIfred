"""빌드된 웹(web/dist)을 API와 같은 서버에서 제공한다.

상시 실행 서버는 FastAPI 하나가 / 에서 웹을, /api 에서 API를 함께 준다.
- /api 라우트가 항상 우선한다. 웹은 모든 라우트를 등록한 뒤 맨 마지막에 / 에 붙인다.
- 화면 이동은 주소 해시(#/add 등)라서 SPA fallback(모르는 경로에 index.html)은 넣지 않는다.
- 캐시: 파일 이름에 해시가 붙은 assets/ 는 오래 캐시하고, 나머지(index.html, sw.js,
  registerSW.js, manifest)는 no-cache로 매번 확인하게 한다. 그래야 다시 빌드한 뒤
  폰에 옛 화면이 남지 않는다.
"""

import logging
from pathlib import Path

from fastapi import FastAPI
from starlette.responses import Response
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

logger = logging.getLogger("aifred.web")

HASHED_ASSETS_DIR = "assets"
ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable"
DEFAULT_CACHE_CONTROL = "no-cache"


class WebStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope: Scope) -> Response:
        response = await super().get_response(path, scope)
        if response.status_code in (200, 304):
            parts = Path(path).parts
            hashed = len(parts) > 1 and parts[0] == HASHED_ASSETS_DIR
            response.headers["Cache-Control"] = ASSET_CACHE_CONTROL if hashed else DEFAULT_CACHE_CONTROL
        return response


def mount_web(app: FastAPI, dist_dir: Path | None) -> bool:
    """dist_dir에 index.html이 있으면 / 에 웹을 붙인다. 붙였으면 True.

    없으면 경고만 남기고 API만 제공한다. 반드시 모든 API 라우트를 등록한 뒤에 부른다.
    """
    if dist_dir is None:
        logger.info("웹 제공이 꺼져 있다(AIFRED_WEB_DIST). API만 제공한다.")
        return False
    if not (dist_dir / "index.html").is_file():
        logger.warning(
            "빌드된 웹이 없어 API만 제공한다: %s (web/에서 npm run build 또는 scripts/build-web.ps1)",
            dist_dir,
        )
        return False
    app.mount("/", WebStaticFiles(directory=dist_dir, html=True), name="web")
    return True
