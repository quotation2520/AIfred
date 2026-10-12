# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

AIFred는 주기적인 집안일을 게이지와 D-n / D-Day / D+n으로 보여주는 개인용 대시보드다. PC에서 도는 로컬 서버(FastAPI + SQLite)와 Android 폰에서 쓰는 React PWA로 구성된다. 요구사항은 `docs/PRD.md`에 있다. 이 파일은 Claude Docs "AIFred PRD 초안"의 사본이고, 원본이 바뀌면 함께 갱신한다.

## 명령 (Windows, PowerShell 5.1)

PowerShell 5.1에서는 `&&`가 동작하지 않는다. 명령을 이을 때는 `;`와 `if ($?) { ... }`를 쓴다.

```powershell
# server/ — 항상 venv의 python을 직접 호출한다
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m pytest tests/test_chores_api.py -k "patch"   # 일부만

# web/
npm run dev          # 5173, /api → http://127.0.0.1:8000 프록시
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
- 입력 범위는 서버(`schemas.py`)와 웹(`ChoreForm.tsx`)에 같은 값으로 들어 있다. 주기는 1~36500일, 마지막 수행일은 2000-01-01~2100-12-31이다. 이 범위가 없으면 날짜 계산이 overflow로 500을 낸다. 한쪽을 바꾸면 다른 쪽도 바꾼다.

### 웹 구조
- 라우터 없이 `App.tsx`의 상태로 대시보드와 추가·편집 화면을 오간다. 대시보드로 돌아올 때 목록을 다시 불러온다.
- `App`의 `today` prop은 테스트에서 날짜를 고정하는 용도다. 앱에서는 이 prop 없이 `useToday()`를 쓴다.
- 컴포넌트 테스트(`App.test.tsx`)는 jsdom에서 `src/test/fetchMock.ts`로 fetch를 가짜로 대신한다.
- 스크린샷 도구(`web/screens/`)는 `/api`를 가짜 응답으로 처리하고, 시계를 2026-10-13 09:00 KST로 고정한다. 시나리오가 화면 문구에 의존하므로, 문구를 바꾸면 `screens/scenarios.ts`도 함께 고친다.

### 아직 없는 것 (PRD 기준)
- 완료 체크와 실행 취소(F3)
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
