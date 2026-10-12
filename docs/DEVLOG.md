# AIFred 개발 일지

작업 하나가 `developer → reviewer → logger` 순서를 거쳐 커밋될 때마다 logger가 항목을 추가한다. 최신 항목이 위에 온다.

## 항목 템플릿

```markdown
### YYYY-MM-DD · <작업 제목>
- **커밋**: <해시 또는 "다음 기록 때 채움">
- **범위**: server | web | docs | infra
- **내용**: 무엇을 왜 바꿨는지 1~3줄
- **변경 파일**: `path/a`, `path/b`
- **검증**: 테스트 명령과 결과 (예: pytest 12 passed)
- **리뷰**: APPROVE (지적 후 수정한 사항이 있으면 한 줄로)
- **남은 이슈**: 없음 | 내용
```

## 기록

### 2026-10-12 · 프로젝트 뼈대(scaffold)
- **커밋**: 다음 기록 때 채움
- **범위**: server | web | infra
- **내용**: server/(FastAPI + SQLModel + SQLite, `/api/health`, Chore/Completion/Device 모델, pytest)와 web/(React+TS+Vite, vite-plugin-pwa, Dexie, vitest, `/api` 프록시) 뼈대를 만들고 루트 README.md와 .gitignore를 보강했다. 기능 구현은 범위 밖. 시스템 Python 3.12 설치가 깨져 있어 uv 관리 CPython 3.12.15로 server/.venv를 만들었다.
- **변경 파일**: `.gitignore`, `README.md`, `server/pyproject.toml`, `server/app/__init__.py`, `server/app/config.py`, `server/app/db.py`, `server/app/models.py`, `server/app/main.py`, `server/tests/test_health.py`, `web/package.json`, `web/package-lock.json`, `web/vite.config.ts`, `web/index.html`, `web/src/App.tsx`, `web/src/main.tsx`, `web/src/index.css`, `web/src/smoke.test.ts`, `web/tsconfig.json`, `web/tsconfig.app.json`, `web/tsconfig.node.json`, `web/.oxlintrc.json`
- **검증**: pytest 2 passed (경고 1건), npm test 1 passed, typecheck/build/lint 통과
- **리뷰**: APPROVE (결함 없음)
- **남은 이슈**: 모델 필드 snake_case vs PRD camelCase (동기화 API에서 JSON alias 결정 필요); PWA 아이콘 없음; Starlette TestClient httpx deprecation 경고; table 모델은 생성 시 검증하지 않으므로 interval_days ≥ 1 검증을 API 스키마나 CHECK 제약으로 해야 함; SQLite datetime이 naive로 반환되므로 UTC 정규화 규칙 필요; SQLite 외래키 강제가 꺼져 있음

### 2026-10-12 · 개발 프로세스 설정
- **커밋**: 514a2f8
- **범위**: infra
- **내용**: developer / reviewer / logger 서브에이전트를 정의하고 개발 일지와 PRD 사본(`docs/PRD.md`)을 만들었다. 개발 환경(Python 3.12.10, Node.js 24.20.0, Git 2.55.0)을 설치하고 git 저장소를 초기화했다.
- **변경 파일**: `.claude/agents/developer.md`, `.claude/agents/reviewer.md`, `.claude/agents/logger.md`, `docs/DEVLOG.md`, `docs/PRD.md`, `.gitignore`
- **검증**: 해당 없음 (코드 없음)
- **리뷰**: 해당 없음 (프로세스 설정 커밋이라 reviewer/logger를 거치지 않고 직접 커밋)
- **남은 이슈**: 없음
