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

# 개발 실행 (http://127.0.0.1:8000/api/health). 실제 데이터(aifred.db) 대신 개발용 DB를 쓴다.
$env:AIFRED_DB_PATH = "data\dev.db"; .\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000

# 테스트
.\.venv\Scripts\python.exe -m pytest
```

설정은 환경변수로 덮어쓴다.

| 환경변수 | 기본값 | 설명 |
| --- | --- | --- |
| `AIFRED_DB_PATH` | `server/data/aifred.db` | SQLite DB 파일 경로. 실제 데이터는 기본값, 개발은 `server/data/dev.db` |
| `AIFRED_TIMEZONE` | `Asia/Seoul` | 서버가 "오늘"을 계산하는 시간대 |
| `AIFRED_WEB_DIST` | `web/dist` | 서버가 `/`에서 제공할 빌드된 웹 폴더. `off`(또는 빈 값)면 API만 제공한다. 폴더가 없어도 경고만 남기고 API는 정상 동작한다 |

개발 서버는 `--reload` 없이 띄운다(CLAUDE.md 참고). 상대 경로 `data\dev.db`는 `server\`에서 실행할 때 기준이다.

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

## 매일 쓰기 (상시 실행)

PC에 로그온하면 운영 서버가 창 없이 자동으로 뜨고, 폰은 `http://<PC IP>:8080`으로 접속한다. FastAPI 하나가 빌드된 웹(`web/dist`)과 `/api`를 함께 제공하고, 실제 데이터 `server/data/aifred.db`를 쓴다. 개발 서버(8000, 5173, `dev.db`)와 따로 돈다.

스크립트는 저장소 루트에서 실행한다. 실행 정책 때문에 막히면 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\...ps1` 형태로 실행한다.

### 처음 설치

```powershell
# 1. 웹 빌드 (web/dist). server venv와 web node_modules는 위 절에서 설치해 둔다.
.\scripts\build-web.ps1

# 2. 자동 실행 등록: 작업 스케줄러에 "AIFred Server"(로그온 시, 창 없음, 실패하면 1분 간격 3회 재시작,
#    배터리에서도 실행, 시간 제한 없음). 관리자 권한은 필요 없다. -StartNow를 붙이면 바로 시작한다.
.\scripts\install-autostart.ps1 -StartNow

# 3. 방화벽: 관리자 PowerShell에서 한 번 (2번을 관리자로 실행했다면 이미 추가됐다)
New-NetFirewallRule -DisplayName "AIFred Server 8080" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow -Profile Private
```

Wi-Fi 네트워크 프로필이 "공용"이면 "개인"으로 바꿔야 폰에서 접속된다.

### 폰 주소

`http://<PC IP>:8080` (PC IP는 `ipconfig`의 Wi-Fi "IPv4 주소"). PC에서는 `http://localhost:8080`.

### 업데이트

```powershell
# 화면(web/)만 바뀌었으면 빌드만 하면 된다. 서버가 요청마다 web/dist를 읽는다. 폰에서 앱을 새로 열면 반영된다.
.\scripts\build-web.ps1

# 서버 코드(server/)가 바뀌었거나, 서버가 web/dist 없이 시작됐다면 서버를 다시 시작한다.
Stop-ScheduledTask -TaskName "AIFred Server"
Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
Start-ScheduledTask -TaskName "AIFred Server"
```

서버를 다시 시작하면 시작할 때 실제 DB에 스키마 변경(없는 열 추가)이 적용된다.
PC의 브라우저(`localhost`)에서는 서비스 워커가 화면을 캐시하므로, 업데이트 뒤 한 번 더 새로 고쳐야 새 화면이 나올 수 있다. 폰(HTTP)에서는 서비스 워커가 동작하지 않고, `index.html`은 매번 서버에 확인하므로 다시 열면 바로 반영된다.

### 로그

`server\logs\`
- `server.log`: 서버 로그(시작, 오류). 1MB마다 회전, 5개까지 보관
- `access.log`: 요청 기록. 1MB마다 회전, 3개까지 보관
- `run-server.log`: 시작·종료 시각과 종료 코드, 포트가 이미 쓰이는 경우
- `stderr.log`, `stdout.log`: 로깅이 설정되기 전 오류(실행할 때마다 새로 쓴다)

### 중지 · 해제

```powershell
# 잠깐 멈추기 (다음 로그온 때 다시 시작된다)
Stop-ScheduledTask -TaskName "AIFred Server"
Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }

# 자동 실행 해제 (작업 삭제, 실행 중인 서버 중지. 방화벽 규칙은 관리자 PowerShell에서 실행하면 함께 지운다)
.\scripts\uninstall-autostart.ps1
```

작업 스케줄러 없이 직접 띄워 보려면 `.\scripts\run-server.ps1`을 실행한다(`-Port`, `-DbPath`, `-LogDir`로 바꿀 수 있다). 8080이 이미 쓰이고 있으면 기록만 남기고 끝난다.

## 폰에서 접속 (개발용, 집 Wi-Fi)

매일 쓰는 앱은 위 "매일 쓰기"의 8080 주소로 연다. 이 절은 개발 중인 화면을 폰에서 확인하는 방법이다.

1. 서버는 평소처럼 `127.0.0.1:8000`으로 실행한다(개발용 DB `dev.db`). 폰의 `/api` 요청은 PC의 Vite가 받아 PC 안에서 서버로 넘기므로 서버를 밖으로 열 필요가 없다.
2. `web/`에서 `npm run dev:lan`을 실행한다. Vite가 모든 네트워크 주소(5173 포트)에서 접속을 받는다.
3. PC IP를 확인한다: PowerShell에서 `ipconfig`를 실행하고 Wi-Fi 어댑터의 "IPv4 주소"(예: `192.168.0.10`)를 본다. 실행 화면에 나오는 `Network:` 주소도 같다.
4. 폰(같은 Wi-Fi)의 Chrome에서 `http://<PC IP>:5173`을 연다.
5. 접속이 안 되면 Windows 방화벽을 확인한다. 처음 실행할 때 뜨는 허용 창에서 "개인 네트워크"를 허용하거나, 관리자 PowerShell에서 5173 포트를 연다:
   `New-NetFirewallRule -DisplayName "AIFred dev 5173" -Direction Inbound -Protocol TCP -LocalPort 5173 -Action Allow -Profile Private`
   Wi-Fi 네트워크 프로필이 "공용"이면 "개인"으로 바꿔야 한다.

HTTP로 접속하므로 홈 화면 설치(PWA), 오프라인 실행, 푸시 알림은 아직 동작하지 않는다. 이 기능들은 HTTPS(mkcert)가 필요하며 알림·동기화(F7, F8) 단계에서 다룬다.
