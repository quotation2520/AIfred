# AIFred

주기적인 집안일을 게이지와 D-n / D+n으로 보여주는 개인용 대시보드 (PC 로컬 서버 + React PWA).

## 폴더 구조

```
AIfred/
├─ docs/          PRD(원본), 요청·계획(user_request.md), UX 피드백(ux/)
├─ shared/        server와 web 테스트가 함께 쓰는 상태 계산 케이스
├─ server/        Python 3.12 · FastAPI · SQLModel(SQLite)
│  ├─ app/        main.py, routers/(API), schemas.py(camelCase 입출력), models.py, status.py, clock.py
│  └─ tests/      pytest
└─ web/           React · TypeScript · Vite · vite-plugin-pwa · Dexie
   ├─ src/        화면 코드와 vitest 테스트
   └─ screens/    Playwright 스크린샷 시나리오 (web/README.md)
```

## 서버 (PowerShell)

```powershell
cd server
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"

# 실행 (http://127.0.0.1:8000/api/health)
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000

# 테스트
.\.venv\Scripts\python.exe -m pytest
```

설정은 환경변수로 덮어쓴다.

| 환경변수 | 기본값 | 설명 |
| --- | --- | --- |
| `AIFRED_DB_PATH` | `server/data/aifred.db` | SQLite DB 파일 경로 |
| `AIFRED_TIMEZONE` | `Asia/Seoul` | 서버가 "오늘"을 계산하는 시간대 |

비밀값(VAPID 키, 토큰 등)은 코드에 넣지 않고 환경변수 또는 `.env`(커밋 금지)로 주입한다.

## 웹 (PowerShell)

```powershell
cd web
npm install

npm run dev         # 개발 서버, /api 요청은 http://127.0.0.1:8000 으로 프록시
npm test            # vitest
npm run typecheck   # tsc
npm run lint        # oxlint
npm run build       # 프로덕션 빌드 (dist/)
npm run screens     # 화면 스크린샷 (UX 리뷰용, web/README.md)
```
