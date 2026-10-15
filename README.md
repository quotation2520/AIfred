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
npm run icons       # 앱 아이콘 PNG·favicon을 icons-src/*.svg에서 다시 만든다 (public/, 설치된 Chrome 사용)
```

## 매일 쓰기 (상시 실행)

운영 서버는 **집 PC**에서 돈다(이 저장소를 OneDrive 밖, 예: `C:\dev\AIfred`에 clone). 집 PC에 로그온하면 서버가 창 없이 자동으로 HTTPS로 뜨고, 폰은 `https://<집PC IP>:8080`을 홈 화면에 앱(PWA)으로 설치해 쓴다. FastAPI 하나가 빌드된 웹(`web/dist`)과 `/api`를 함께 제공하고, 실제 데이터 `server/data/aifred.db`를 쓴다. 개발 서버(8000, 5173, `dev.db`)와 따로 돈다.

**처음 설치**(프로그램 설치, clone, 데이터 옮기기, mkcert 인증서, 폰에 CA 설치, 자동 실행, 방화벽, 앱 설치, 문제 해결)는 [docs/host-setup.md](docs/host-setup.md)를 따른다. 이 절에는 설치 뒤 매일 쓰는 명령만 둔다.

스크립트는 저장소 루트에서 실행한다. 실행 정책 때문에 막히면 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\...ps1` 형태로 실행한다.
`scripts\run-server.ps1`은 `certs\aifred.pem`과 `certs\aifred-key.pem`이 둘 다 있으면 HTTPS로, 없으면 HTTP로 뜨고(`-CertFile`, `-KeyFile`로 경로를 바꿀 수 있다), 어느 쪽인지 `run-server.log`에 남긴다.

### 업데이트

```powershell
# 화면(web/)만 바뀌었으면 빌드만 하면 된다. 서버가 요청마다 web/dist를 읽는다.
.\scripts\build-web.ps1

# 서버 코드(server/)가 바뀌었거나, 서버가 web/dist 없이 시작됐다면 서버를 다시 시작한다.
Stop-ScheduledTask -TaskName "AIFred Server"
Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
Start-ScheduledTask -TaskName "AIFred Server"
```

서버를 다시 시작하면 시작할 때 실제 DB에 스키마 변경(없는 열 추가)이 적용된다. 집 PC에서 `git pull`부터 하는 전체 순서는 [docs/host-setup.md](docs/host-setup.md) "6. 업데이트 방법".
앱(서비스 워커)은 새 버전을 받아 두었다가, 하던 일(시트·메뉴, 저장 중, 실행 취소 알림, 게이지 조절)이 없고 잠깐 조작이 없을 때 저절로 새로고침한다. 뒤에 두었던 앱은 다시 꺼낼 때 새 버전을 확인한다(`web/src/lib/appUpdate.ts`).

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

작업 스케줄러 없이 직접 띄워 보려면 `.\scripts\run-server.ps1`을 실행한다(`-Port`, `-DbPath`, `-LogDir`, `-CertFile`, `-KeyFile`로 바꿀 수 있다). 8080이 이미 쓰이고 있으면 기록만 남기고 끝난다.

## 폰에서 접속 (개발용, 집 Wi-Fi)

매일 쓰는 앱은 위 "매일 쓰기"의 8080 주소로 연다. 이 절은 개발 중인 화면을 폰에서 확인하는 방법이다.

1. 서버는 평소처럼 `127.0.0.1:8000`으로 실행한다(개발용 DB `dev.db`). 폰의 `/api` 요청은 PC의 Vite가 받아 PC 안에서 서버로 넘기므로 서버를 밖으로 열 필요가 없다.
2. `web/`에서 `npm run dev:lan`을 실행한다. Vite가 모든 네트워크 주소(5173 포트)에서 접속을 받는다.
3. PC IP를 확인한다: PowerShell에서 `ipconfig`를 실행하고 Wi-Fi 어댑터의 "IPv4 주소"(예: `192.168.0.10`)를 본다. 실행 화면에 나오는 `Network:` 주소도 같다.
4. 폰(같은 Wi-Fi)의 Chrome에서 `http://<PC IP>:5173`을 연다.
5. 접속이 안 되면 Windows 방화벽을 확인한다. 처음 실행할 때 뜨는 허용 창에서 "개인 네트워크"를 허용하거나, 관리자 PowerShell에서 5173 포트를 연다:
   `New-NetFirewallRule -DisplayName "AIFred dev 5173" -Direction Inbound -Protocol TCP -LocalPort 5173 -Action Allow -Profile Private`
   Wi-Fi 네트워크 프로필이 "공용"이면 "개인"으로 바꿔야 한다.

개발 서버는 HTTP로 접속하므로 홈 화면 설치(PWA)와 서비스 워커가 동작하지 않는다. 앱 설치는 HTTPS로 뜨는 운영 서버([docs/host-setup.md](docs/host-setup.md))에서 한다.
