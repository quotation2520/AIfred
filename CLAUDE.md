# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

AIFred는 주기적인 집안일을 게이지와 D-n / D-Day / D+n으로 보여주는 개인용 대시보드다. PC에서 도는 로컬 서버(FastAPI + SQLite)와 Android 폰에서 쓰는 React PWA로 구성된다. 요구사항 원본은 `docs/PRD.md`다.

## 명령 (Windows, PowerShell 5.1)

PowerShell 5.1에서는 `&&`가 동작하지 않는다. 명령을 이을 때는 `;`와 `if ($?) { ... }`를 쓴다.

```powershell
# server/ — 항상 venv의 python을 직접 호출한다
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
$env:AIFRED_DB_PATH = "data\dev.db"; .\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000   # 개발 서버(개발용 DB)
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m pytest tests/test_chores_api.py -k "patch"   # 일부만

# 상시 실행(운영, 저장소 루트에서) — 자세한 내용은 README "매일 쓰기"
.\scriptsuild-web.ps1          # 웹 빌드(배포)
.\scriptsun-server.ps1         # 운영 서버 0.0.0.0:8080, 실제 DB server\dataifred.db, 로그 server\logs.\scripts\install-autostart.ps1  # 작업 스케줄러 "AIFred Server"(로그온 시 실행) 등록 / uninstall-autostart.ps1로 해제

# web/
npm run dev          # 5173, /api → http://127.0.0.1:8000 프록시
npm run dev:lan      # 같은 Wi-Fi의 폰에서 http://<PC IP>:5173 으로 접속 (README "폰에서 접속")
npm test             # vitest run
npx vitest run src/lib/choreStatus.test.ts -t "PRD"                      # 일부만
npm run typecheck    # tsc -b (app, node, screens 세 프로젝트)
npm run lint         # oxlint
npm run build
npm run screens      # Playwright 스크린샷 → web/screenshots/ (자세한 내용은 web/README.md)
npm run screens -- -g edit-form                                          # 시나리오 하나만
```

- 서버 린터는 아직 없다.
- PowerShell 5.1의 `Invoke-RestMethod`는 UTF-8 응답의 한글을 깨뜨려 보여 준다. 데이터 자체는 정상이다.
- 실제 데이터(`server/data/aifred.db`)는 8080 운영 서버만 쓴다. 개발 서버는 `AIFRED_DB_PATH=data\dev.db`로 띄운다. 운영 서버를 다시 시작하면 스키마 변경(`add_missing_columns`)과 프리셋 시드가 실제 DB에 적용된다. 업데이트 배포 순서: 테스트 통과 → `build-web.ps1` → 운영 서버 재시작(README).
- `scripts/*.ps1`은 UTF-8 BOM으로 저장한다. PowerShell 5.1이 BOM이 없는 한글 스크립트를 CP949로 읽기 때문이다.
- 한글이나 따옴표가 들어간 커밋 메시지는 파일에 써서 `git commit -F`로 넘긴다.

## 아키텍처

### 상태 계산은 두 곳에 같은 규칙으로 있다
- PRD 4장의 계산 규칙(남은 일수, 게이지, 상태, 배지, 오늘 할 일, 정렬)은 `web/src/lib/choreStatus.ts`가 기준 구현이다. 서버의 `server/app/status.py`는 알림에 필요한 개수, 정렬, 상위 3개 이름만 계산한다.
- `shared/status-cases.json`을 vitest와 pytest가 함께 읽어서 두 구현이 어긋나지 않는지 검증한다. 계산 규칙을 바꾸면 양쪽 코드와 이 JSON을 같이 고친다.
- 오늘 할 일 = 남은 일수 ≤ 0, 밀린 일 = 남은 일수 < 0. 밀린 일은 오늘 할 일 개수에 포함된다. 정렬은 남은 일수 오름차순이고, 같으면 이름순(코드 단위 비교)이다. 삭제된 항목(`deletedAt`)은 모든 목록과 개수에서 뺀다.
- 화면 계산은 날짜 문자열(`YYYY-MM-DD`)과 `Date.UTC`로 한다. "오늘"은 항상 인자로 받는다. 웹은 `useToday`가 기기 로컬 날짜를 쓰고, 자정이나 앱이 다시 보일 때 갱신한다. 서버는 설정한 시간대(`AIFRED_TIMEZONE`, 기본 Asia/Seoul)를 쓴다.

### 서버 API 규칙
- DB 모델(`models.py`)의 필드는 snake_case다. API 요청·응답은 `schemas.py`의 별도 pydantic 모델이 camelCase(`alias_generator=to_camel`)로 바꾼다. 새 API도 같은 방식으로 만든다.
- 시각은 UTC로 저장한다. SQLite는 naive datetime을 돌려주므로 `schemas.py`의 `UtcDatetime`에서 UTC로 정규화해 응답한다.
- 현재 시각과 오늘 날짜는 `clock.py`의 FastAPI 의존성(`get_now`, `get_today`)으로만 얻는다. 테스트는 `dependency_overrides`로 이 값을 고정한다. `tests/conftest.py`의 `client` 픽스처는 tmp_path SQLite를 쓰고 오늘을 2026-10-12로 고정한다.
- 삭제는 soft delete(`deleted_at`)다. 나중에 동기화(F8)로 삭제를 전달하기 위해서다. id는 클라이언트가 지정할 수 있는 UUID다(오프라인 생성 대비).
- 완료 기록(`routers/completions.py`): 완료하면 `due_on`(그때의 예정일)과 `previous_last_done_at`을 저장하고, chore의 `last_done_at`을 max(기존, done_on)로 올린다. 실행 취소는 soft delete이고, `last_done_at`을 max(previous_last_done_at, 남은 기록의 done_on)로 되돌린다. 이 규칙은 가장 최근 완료만 취소한다고 가정한다. 이력(F6)이나 동기화(F8)에서 오래된 기록을 취소할 수 있게 되면 다시 설계해야 한다. 웹은 완료할 때 `doneOn`을 보내지 않고 서버의 오늘을 쓴다.
- 프리셋: `app/presets.py`의 `seed_presets()`는 preset_category가 삭제된 행까지 0행일 때만 `shared/presets.json`(원본 문서 `docs/chore_presets.md`)으로 채운다. 그래서 지운 기본 항목은 되살아나지 않는다. 이름 중복은 같은 카테고리 안의 항목끼리, 카테고리끼리 비교해 409를 낸다(trim, NFC, casefold). 길이 상한 `PRESET_*_MAX_LENGTH`는 schemas.py와 웹 `lib/presets.ts`에 같은 값으로 있다.
- `DELETE /api/chores/{id}/completions/today`는 done_on이 서버의 오늘인 기록 중 done_at이 가장 늦은 것을 같은 `_undo()`로 취소한다(없으면 404). `POST /api/chores/{id}/restore`는 삭제를 되돌린다(삭제 안 됐으면 409). 완료 기록은 삭제할 때 건드리지 않으므로 되살리면 그대로 이어진다.
- 웹 제공: `app/web.py`의 `mount_web`가 `create_app` 맨 마지막에 web/dist를 `/`에 붙인다. 그래서 새 API 라우트는 그보다 먼저 등록한다. index.html과 sw.js는 no-cache, assets/는 immutable이다. `AIFRED_WEB_DIST`로 경로를 바꾸거나 끌 수 있다.
- 같은 id로 다시 POST하면 기존 기록을 200으로 돌려준다(재시도에 안전).
- 스키마 변경: 마이그레이션 도구가 없다. `db.py`의 `add_missing_columns()`가 시작할 때 없는 열을 추가한다. NOT NULL 열은 테이블이 비어 있을 때만 테이블을 다시 만들고, 행이 있으면 `SchemaUpgradeError`로 멈춘다.
- 입력 범위는 서버(`schemas.py`)와 웹(`ChoreForm.tsx`)에 같은 값으로 들어 있다. 주기는 1~36500일, 마지막 수행일은 2000-01-01~2100-12-31이다. 이 범위가 없으면 날짜 계산이 overflow로 500을 낸다. 한쪽을 바꾸면 다른 쪽도 바꾼다.

### 웹 구조
- 화면은 대시보드 하나이고, 추가(기본 목록 `PresetPicker` → 폼)와 편집은 그 위에 뜨는 바텀 시트(`Sheet`, 데스크톱은 가운데 대화상자)다. 주소 해시(`lib/routes.ts`: `#/`, `#/add`, `#/add/form`, `#/edit/<id>`)와 방문 기록(`lib/historyStack.ts`)으로 폰의 뒤로 가기가 맨 위에 열린 것 하나만 닫는다. 메뉴, 폼, 모드처럼 닫을 수 있는 층을 새로 만들면 반드시 `useBackLayer(open, onBack)`로 등록한다. onBack이 false를 돌려주면 닫지 않는다(입력 중 확인 창 취소). 저장해서 닫은 층은 기록에서 걷어 낸다.
- 목록은 App의 `useChores`가 갖는다. 앱을 열 때 한 번 불러오고, 그 뒤로는 저장·완료·삭제 응답으로 고친다. 앱이 다시 보일 때(visibilitychange) 마지막으로 불러온 지 30초가 지났으면 조용히 다시 불러온다. 그 사이 화면에서 고친 것이 있으면 받은 목록을 버린다.
- 카드의 "⋯" 메뉴(`ChoreMenu`)에는 편집과 삭제가 있다. 삭제와 오늘 완료 취소(초록 체크 다시 누르기)는 확인 창 없이 처리하고 실행 취소 알림을 띄운다(`POST /api/chores/{id}/restore`, `DELETE /api/chores/{id}/completions/today`).
- 기본 집안일 목록(프리셋)은 서버 DB에서 `GET /api/presets`(`api/presets.ts`)로 받는다. 선택 화면(`PresetPicker`)은 카테고리 아코디언이다. 펼침 상태는 localStorage `aifred.presetOpen`에 기억한다. "편집" 모드에서 카테고리와 항목을 고치거나 지운다. 추가·수정·삭제는 서버 응답을 받은 뒤 화면에 반영한다(409 가능). 등록된 집안일과 이름이 같은 항목은 "추가됨"으로 막는다(`presetNameKey`, 서버 name_key와 같은 규칙).
- "그 밖의 집안일" 중 남은 일수가 `LATER_THRESHOLD_DAYS`(7, `lib/dashboardLayout.ts`) 이상인 것은 "나중에 할 일"로 접는다. 펼침 상태는 localStorage `aifred.laterOpen`에 기억하고, 읽지 못하면 접힌다. 요약 개수는 숨김과 관계없다.
- `App`의 `today` prop은 테스트에서 날짜를 고정하는 용도다. 앱에서는 이 prop 없이 `useToday()`를 쓴다.
- 완료 체크와 게이지 조절은 화면을 먼저 바꾸고(낙관적 갱신) 서버 응답으로 확정한다. 둘 다 `UndoToast`로 실행 취소를 제공한다. 카드는 항상 정렬 위치에 있고, 위치가 바뀌면 `useFlip`이 이동 애니메이션을 준다. 이동 중인 카드는 250ms 동안 체크를 받지 않는다. 애니메이션 시간은 `lib/motion.ts`에 있고, `prefers-reduced-motion`이면 끈다.
- 게이지(`GaugeSlider`)는 끌어서 잔여일을 0~주기로 고치는 슬라이더다. PATCH { lastDoneAt }로 저장하고 완료 기록은 만들지 않는다(보정). 가로로 10px 이상 움직여야 조절을 시작해서 세로 스크롤과 구분한다.
- 폰은 HTTP(운영 `http://<PC IP>:8080`, 개발 `:5173`)로 접속하므로 HTTPS 전용 브라우저 API(`crypto.randomUUID`, 서비스 워커, 클립보드 등)를 쓸 수 없다. UUID는 `api/chores.ts`의 `uuidV4()`를 쓴다.
- 컴포넌트 테스트(`App.test.tsx`)는 jsdom에서 `src/test/fetchMock.ts`로 fetch를 가짜로 대신한다. 선택 화면을 여는 테스트는 `presetRoutes()`를 mockFetch 경로에 넣는다. jsdom의 history는 테스트 사이에 남으므로 App.test의 afterEach가 기록 처리를 기다린 뒤 `/`로 되돌린다. 뒤로 가기는 `pressBack()`으로 누른다. vitest를 동시에 두 개 돌리면 history 테스트가 시간 초과로 실패할 수 있다. afterEach에서 localStorage를 비우므로, 접힌 카드까지 모두 보여야 하는 테스트는 `rememberLaterOpen()`을 쓴다.
- 스크린샷 도구(`web/screens/`)는 `/api`를 가짜 응답으로 처리하고, 시계를 2026-10-13 09:00 KST로 고정한다. 시나리오가 화면 문구에 의존하므로, 문구를 바꾸면 `screens/scenarios.ts`도 함께 고친다.

### 아직 없는 것 (PRD 기준)
- 수행 이력(F6)
- 정기 알림(F7: APScheduler, pywebpush, `/api/arrived`)
- 오프라인과 동기화(F8: Dexie)
- HTTPS(mkcert)

의존성은 이미 설치돼 있지만 아직 쓰는 코드가 없다.

## 개발 흐름

절차는 작업 크기에 맞춰 가볍게 간다.
- **작은 수정**(문구, 스타일, 설정): 메인 세션이 직접 고치고 테스트한 뒤 커밋한다.
- **기능 작업**: `developer` 서브에이전트가 구현한다. 커밋은 메인 세션이 한다.
- **reviewer**: 위험한 변경에만 부른다. 서버 API, DB 모델, 날짜·상태 계산, 동기화, 알림, 보안이 여기에 해당한다. 테스트를 직접 실행하고 APPROVE 또는 REQUEST_CHANGES로 판정한다.
- **ux-designer**: 사용자가 요청할 때만 부른다. 이때 developer에게 "UX 리뷰 자료"(`npm run screens` 스크린샷, 사용자 관점 앱 개요)를 요청해 넘긴다. 피드백(`docs/ux/`)이 나오면 요약만 보고하고 멈춘다. 반영할 항목은 사용자가 고른 뒤에 작업한다.
- **커밋**: 파일 이름을 지정해 stage한다. 메시지는 Conventional Commits(`feat(web): ...`) 형식이고, 본문에 무엇을, 왜 바꿨는지와 검증 결과를 적는다. `docs/DEVLOG.md`는 더 쓰지 않는다.
- **문서**: PRD 원본은 `docs/PRD.md`다. 요구가 바뀌면 이 파일을 고친다. 진행 중인 요청과 계획은 `docs/user_request.md`에 있다.
