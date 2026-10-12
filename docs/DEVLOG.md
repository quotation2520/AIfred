# AIFred 개발 일지

> 2026-10-13부터 이 일지는 더 쓰지 않는다. 이후 변경 이력은 `git log`의 커밋 메시지(무엇을, 왜, 검증 결과)로 남긴다. 아래는 그 이전 기록이다.

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

### 2026-10-13 · UX 피드백 반영 (dashboard-v1)
- **커밋**: ab8f241
- **범위**: web | docs
- **내용**: 화면 작업 흐름(developer → ux-designer → developer → reviewer → logger)을 처음 거친 건이다. ux-designer 피드백 `docs/ux/2026-10-13-dashboard-v1.md`의 U1~U5, U7~U10을 반영했다(U6은 F3로 이월). 사용자 결정에 따라 요약을 "오늘 할 일 N개 (밀린 일 M개 포함)"으로, 아래 영역을 중복 없는 "그 밖의 집안일"로 바꾸고(모두 오늘 할 일이면 숨김) PRD 6·7장 문구도 고쳤다. 앞으로 올 때 날짜를 다시 계산하는 `useToday`(U1), 불투명 하단 고정 막대 안의 "+"(U2), 오류 문구 한국어화(`errorMessages`, `ErrorNotice`)를 추가했다.
- **변경 파일**: `web/src/lib/useToday.ts`, `web/src/lib/useToday.test.ts`, `web/src/lib/errorMessages.ts`, `web/src/lib/errorMessages.test.ts`, `web/src/components/ErrorNotice.tsx`, `web/src/App.tsx`, `web/src/App.test.tsx`, `web/src/components/Dashboard.tsx`, `web/src/components/ChoreCard.tsx`, `web/src/components/ChoreForm.tsx`, `web/src/index.css`, `web/src/lib/choreStatus.ts`(주석), `web/screens/scenarios.ts`, `web/screens/screens.pw.ts`, `web/screens/sampleData.ts`, `web/README.md`, `docs/PRD.md`, `docs/ux/2026-10-13-dashboard-v1.md`
- **검증**: npm test 78 passed, typecheck/lint/build 통과, npm run screens 20 passed
- **리뷰**: APPROVE (ux-designer 피드백 docs/ux/2026-10-13-dashboard-v1.md 반영, U6은 F3로 이월)
- **남은 이슈**: server/app/status.py docstring에 옛 요약 문구가 남아 있음(F7에서 맞출 것); U2: 체크 버튼과 "+" 사이 세로 간격이 20px라 ux-designer 재검토 필요; 앞으로 올 때 목록을 다시 받지 않음(F8에서 결정); 취소 확인 회귀 테스트 2건 없음(바꿨다가 되돌린 뒤 취소, 저장 성공 뒤 확인 창 미표시); PRD 원본(Claude Docs) 동기화 필요; 참고: 주기 입력 "1e3"을 1000으로 받아들임, 빈 상태에서 "집안일 추가" 버튼과 하단 "+"가 함께 보임

### 2026-10-13 · 화면 스크린샷 도구 (`npm run screens`)
- **커밋**: d38a202
- **범위**: web | infra
- **내용**: ux-designer가 코드 없이 화면만 보고 피드백할 수 있도록 web에 `npm run screens`를 추가했다. Playwright + 설치된 Chrome으로 별도 포트 5174에서 앱을 띄우고, `/api`는 가짜 응답으로 가로채(실제 서버·DB 미사용) 시계를 2026-10-13 KST로 고정한 뒤 7개 시나리오 × 모바일/데스크톱 = PNG 14장을 `web/screenshots/`(git 제외)에 저장한다.
- **변경 파일**: `web/package.json`, `web/package-lock.json`, `web/playwright.config.ts`, `web/screens/screens.pw.ts`, `web/screens/scenarios.ts`, `web/screens/sampleData.ts`, `web/screens/globalSetup.ts`, `web/screens/globalTeardown.ts`, `web/screens/paths.ts`, `web/tsconfig.screens.json`, `web/tsconfig.json`, `web/README.md`, `.gitignore`(screenshots·Playwright 산출물 제외)
- **검증**: npm run screens 14 passed, npm test 64 passed, typecheck/lint/build 통과; 5173 dev 서버 유지·5174 정상 종료 확인
- **리뷰**: APPROVE (결함 없음; `/api`만 가로채고 실제 서버로 새지 않음, 시계 고정이 로컬 날짜에 반영됨 확인)
- **남은 이슈**: 모바일에서 고정 "+" 버튼이 카드 완료 버튼을 가림(ux-designer 확인 대상); 앱 문구가 바뀌면 캡처 시나리오도 같이 수정 필요; NO_COLOR/FORCE_COLOR 경고

### 2026-10-13 · ux-designer 에이전트 추가와 화면 작업 흐름 정리
- **커밋**: 58980bf
- **범위**: infra
- **내용**: 화면이 바뀌는 작업은 developer → ux-designer → developer → reviewer → logger 순서를 거치도록 했다. ux-designer는 코드를 읽지 않고 스크린샷과 앱 개요만으로 `docs/ux/`에 피드백을 남긴다.
- **변경 파일**: `.claude/agents/ux-designer.md`, `.claude/agents/developer.md`, `.claude/agents/logger.md`, `docs/DEVLOG.md`
- **검증**: 해당 없음 (코드 없음)
- **리뷰**: 해당 없음 (프로세스 설정, 사용자 승인으로 직접 커밋)
- **남은 이슈**: 없음

### 2026-10-13 · 대시보드와 집안일 추가·편집 화면 (F1, F2, F4, F5)
- **커밋**: 5f16558
- **범위**: web | server
- **내용**: web에 대시보드(F2/F4/F5)와 집안일 추가·편집 화면(F1)을 만들고 `/api/chores`에 연결했다. 완료 체크(F3) 버튼은 disabled 자리만 둔다. 리뷰에서 발견된 결함(주기 상한 없음으로 timedelta overflow 500) 수정으로 서버 스키마에 주기 ≤ 36500(`MAX_INTERVAL_DAYS`), lastDoneAt 2000-01-01~2100-12-31 범위 검증을 추가하고 web 폼에도 같은 검증을 넣었다.
- **변경 파일**: `web/src/api/chores.ts`, `web/src/api/chores.test.ts`, `web/src/components/ChoreCard.tsx`, `web/src/components/Dashboard.tsx`, `web/src/components/ChoreForm.tsx`, `web/src/lib/formatDate.ts`, `web/src/lib/formatDate.test.ts`, `web/src/test/fetchMock.ts`, `web/src/App.tsx`, `web/src/App.test.tsx`, `web/src/index.css`, `web/package.json`, `web/package-lock.json`(dev 의존성 @testing-library/react, dom, user-event, jsdom 추가), `server/app/schemas.py`, `server/tests/test_chores_api.py`
- **검증**: pytest 94 passed, npm test 64 passed, typecheck/lint/build 통과
- **리뷰**: APPROVE (1차 REQUEST_CHANGES: 주기 상한 없음 → 서버·web에 주기 ≤36500, lastDoneAt 2000~2100 범위 검증 추가)
- **남은 이슈**: 실제 브라우저(360px/데스크톱) 미확인; 게이지가 버튼 안에 있어 스크린리더 노출 문제 가능; 자정 넘김 시 재렌더 전까지 날짜 고정; 서버 422 메시지 원문(영어) 표시; 범위 밖 기존 DB 데이터 미방어

### 2026-10-13 · 집안일 CRUD API (F1)
- **커밋**: 9020f5d
- **범위**: server
- **내용**: `/api/chores`에 목록·단건 GET, POST, PATCH, DELETE(soft delete)를 추가했다. DB는 snake_case, API JSON은 camelCase alias(사용자 결정)이며 시각은 UTC 오프셋 포함으로 응답한다. 서버의 "오늘"은 설정 시간대(`AIFRED_TIMEZONE`, 기본 Asia/Seoul) 날짜로 계산한다.
- **변경 파일**: `server/app/routers/__init__.py`, `server/app/routers/chores.py`, `server/app/schemas.py`, `server/app/clock.py`, `server/app/config.py`, `server/app/status.py`, `server/app/main.py`, `server/pyproject.toml`, `server/tests/conftest.py`, `server/tests/test_chores_api.py`
- **검증**: pytest 73 passed (기존 httpx deprecation 경고 1건)
- **리뷰**: APPROVE (결함 없음)
- **남은 이슈**: POST는 모르는 필드를 무시함(PATCH만 거부); 잘못된 `AIFRED_TIMEZONE`은 요청 시점 500(시작 시 검증 권장); 빈 PATCH도 updatedAt 갱신(F8에서 재검토); 미래 lastDoneAt 허용; 린터(ruff 등) 미도입

### 2026-10-13 · 집안일 상태 계산과 오늘 할 일 선택 (PRD 4장, F5)
- **커밋**: dbec43c
- **범위**: server | web
- **내용**: PRD 4장(남은 일수·게이지·상태·배지)과 F5(오늘 할 일 선택·정렬) 계산을 web(TS)과 server(Python)에 같은 규칙으로 구현했다. 오늘 할 일은 남은 일수 ≤ 0(밀린 일 포함), 삭제된 집안일 제외, 남은 일수 오름차순 후 이름 오름차순 정렬. 양쪽 테스트가 공유 케이스 `shared/status-cases.json`(19케이스)을 읽는다. UI/API/DB는 범위 밖.
- **변경 파일**: `shared/status-cases.json`, `web/src/lib/choreStatus.ts`, `web/src/lib/choreStatus.test.ts`, `server/app/status.py`, `server/tests/test_status.py`, `web/src/smoke.test.ts`(삭제, 실제 테스트로 대체)
- **검증**: pytest 32 passed (기존 httpx deprecation 경고 1건), npm test 34 passed, typecheck/lint/build 통과; TZ=Asia/Seoul, America/Los_Angeles에서도 vitest 34 passed
- **리뷰**: APPROVE (결함 없음)
- **남은 이슈**: 이름 정렬이 코드 단위 비교라 이모지 등 BMP 밖 문자에서 JS/Python 순서가 드물게 다를 수 있음; 이름 동률 정렬 케이스가 공유 JSON에 없고 양쪽 개별 테스트로만 확인됨

### 2026-10-12 · 프로젝트 뼈대(scaffold)
- **커밋**: bfe26b2
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
