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
npm run dev:lan     # 같은 Wi-Fi의 폰에서 접속할 수 있게 연다 (아래 "폰에서 접속")
npm test            # vitest
npm run typecheck   # tsc
npm run lint        # oxlint
npm run build       # 프로덕션 빌드 (dist/)
npm run screens     # 화면 스크린샷 (UX 리뷰용, web/README.md)
```

## 폰에서 접속 (개발용, 집 Wi-Fi)

1. 서버는 평소처럼 `127.0.0.1:8000`으로 실행한다. 폰의 `/api` 요청은 PC의 Vite가 받아 PC 안에서 서버로 넘기므로 서버를 밖으로 열 필요가 없다.
2. `web/`에서 `npm run dev:lan`을 실행한다. Vite가 모든 네트워크 주소(5173 포트)에서 접속을 받는다.
3. PC IP를 확인한다: PowerShell에서 `ipconfig`를 실행하고 Wi-Fi 어댑터의 "IPv4 주소"(예: `192.168.0.10`)를 본다. 실행 화면에 나오는 `Network:` 주소도 같다.
4. 폰(같은 Wi-Fi)의 Chrome에서 `http://<PC IP>:5173`을 연다.
5. 접속이 안 되면 Windows 방화벽을 확인한다. 처음 실행할 때 뜨는 허용 창에서 "개인 네트워크"를 허용하거나, 관리자 PowerShell에서 5173 포트를 연다:
   `New-NetFirewallRule -DisplayName "AIFred dev 5173" -Direction Inbound -Protocol TCP -LocalPort 5173 -Action Allow -Profile Private`
   Wi-Fi 네트워크 프로필이 "공용"이면 "개인"으로 바꿔야 한다.

HTTP로 접속하므로 홈 화면 설치(PWA), 오프라인 실행, 푸시 알림은 아직 동작하지 않는다. 이 기능들은 HTTPS(mkcert)가 필요하며 알림·동기화(F7, F8) 단계에서 다룬다.
