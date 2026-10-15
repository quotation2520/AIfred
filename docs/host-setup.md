# 집 PC에 AIFred 운영 서버 설치하기

AIFred 운영 서버를 **집 PC**에 처음부터 설치하는 안내다. 이 문서만 보고 따라 할 수 있게 썼다.
설치가 끝나면 집 PC는 로그온할 때마다 서버를 HTTPS로 띄우고, 폰은 같은 Wi-Fi에서 `https://<집PC IP>:8080`으로 접속해 홈 화면에 앱(PWA)으로 설치해 쓴다.

- 서버 하나(FastAPI, 8080)가 화면(`web/dist`)과 API(`/api`)를 함께 제공한다. 데이터는 `server\data\aifred.db`(SQLite) 하나다.
- 폰 Chrome은 HTTPS에서만 앱 설치를 허락한다. 그래서 mkcert로 집 안에서만 쓰는 인증 기관(CA)과 인증서를 만들고, 폰에 그 CA를 한 번 설치한다.
- 이 문서의 명령은 모두 **집 PC**의 PowerShell에서 실행한다. 관리자 권한이 필요한 단계는 따로 표시했다.
- PowerShell 5.1에서는 `&&`가 동작하지 않는다. 명령은 한 줄씩 실행한다.

## 0. 전제

- Windows 10/11 PC, 폰과 같은 집 공유기(Wi-Fi)에 연결되어 있다. PC는 유선이어도 된다.
- 폰은 Android + Chrome.
- **집 PC는 항상 켜 둔다.** 절전(대기 모드)에 들어가면 폰에서 열리지 않는다. 전원 연결 시 절전을 끄는 것을 권장한다.
  ```powershell
  powercfg /change standby-timeout-ac 0
  powercfg /change hibernate-timeout-ac 0
  ```
  모니터 끄기(`monitor-timeout-ac`)는 괜찮다.
- 서버는 **Windows에 로그온해야** 뜬다(작업 스케줄러의 "로그온할 때" 실행). 재부팅(Windows 업데이트 포함) 뒤에는 한 번 로그인해 둔다.
- **공유기에서 집 PC IP를 고정(DHCP 예약)하는 것을 권장한다.** 인증서에 집 PC IP를 넣기 때문에, IP가 바뀌면 인증서를 다시 만들어야 하고(4단계) 폰 주소도 바뀐다. 공유기 관리 화면(보통 `192.168.0.1` 또는 `192.168.1.1`)의 "DHCP 고정 할당/주소 예약"에서 집 PC의 MAC 주소에 지금 IP를 묶는다.

집 PC IP 확인:
```powershell
ipconfig
```
Wi-Fi(또는 이더넷) 어댑터의 "IPv4 주소"(예: `192.168.0.20`)다. 이 문서에서는 `<집PC IP>`로 쓴다.

## 1. 필요한 프로그램

| 프로그램 | 확인 명령 | 없으면 설치 (winget) |
| --- | --- | --- |
| Python 3.12 | `py -3.12 --version` | `winget install -e --id Python.Python.3.12` |
| Node.js LTS | `node --version`, `npm --version` | `winget install -e --id OpenJS.NodeJS.LTS` |
| Git | `git --version` | `winget install -e --id Git.Git` |
| mkcert | `mkcert -version` | `winget install -e --id FiloSottile.mkcert` (4단계에서 설치해도 된다) |

설치한 뒤에는 **PowerShell 창을 새로 열어야** 새 프로그램이 경로(PATH)에 잡힌다.
`py`가 없다고 나오면 Python 설치가 끝나지 않은 것이다. `python`만 치면 Microsoft Store가 열릴 수 있으니 이 문서에서는 `py -3.12`를 쓴다.

## 2. 코드 받기

GitHub 비공개 저장소에서 **OneDrive 밖** 폴더로 clone한다. 이 문서는 `C:\dev\AIfred`를 기준으로 쓴다.

```powershell
New-Item -ItemType Directory -Force C:\dev
cd C:\dev
git clone https://github.com/quotation2520/AIfred.git AIfred
cd C:\dev\AIfred
```

- 비공개 저장소라 처음 clone할 때 GitHub 로그인 창(Git Credential Manager)이 뜬다. 브라우저로 로그인하면 이후에는 묻지 않는다.

**OneDrive 폴더(바탕 화면, 문서 등) 안에서 운영 서버를 돌리지 않는다.**
- Python 가상환경(`server\.venv`)은 만든 경로에 묶여 있다. OneDrive가 폴더를 다른 PC로 동기화하거나 경로가 바뀌면 동작하지 않는다.
- OneDrive가 쓰는 중인 SQLite 파일(`aifred.db`)을 동기화하면 파일이 깨지거나, 다른 PC의 옛 파일로 덮일 위험이 있다.
- `node_modules`처럼 파일이 아주 많은 폴더를 동기화하느라 PC가 느려진다.

이후 명령은 모두 저장소 루트(`C:\dev\AIfred`)에서 실행한다.

## 3. 데이터 옮기기 (선택)

노트북에서 쓰던 데이터를 이어 쓰려면, 운영 서버를 **처음 띄우기 전에** 노트북의 DB 파일을 한 번 복사한다. 새로 시작해도 된다(서버가 빈 DB를 만들고 기본 집안일 목록을 채운다).

노트북의 `server\data\aifred.db`는 OneDrive를 통해 집 PC에서도 보일 수 있다.
`<사용자 폴더>\OneDrive\Desktop\claude_projects\AIfred\server\data\aifred.db`

```powershell
New-Item -ItemType Directory -Force C:\dev\AIfred\server\data
Copy-Item "$env:USERPROFILE\OneDrive\Desktop\claude_projects\AIfred\server\data\aifred.db" C:\dev\AIfred\server\data\aifred.db
```

- OneDrive 경로가 다르면(`OneDrive - 개인` 등) 파일 탐색기에서 위치를 확인해 경로를 고친다. 파일이 "온라인 전용"(구름 아이콘)이면 먼저 열거나 "항상 이 디바이스에 유지"로 내려받는다.
- 노트북에서 운영 서버가 돌고 있지 않은 상태의 파일을 복사한다. 같은 폴더에 `aifred.db-journal`이 있으면 쓰기 도중이라는 뜻이니 잠시 뒤 다시 복사한다.
- **한 번만** 복사한다. 이후로는 집 PC의 `C:\dev\AIfred\server\data\aifred.db`가 진짜 데이터다. OneDrive의 파일은 더 이상 쓰이지 않는다.
- 이미 운영 서버를 띄운 뒤라면, 서버를 멈추고(README "중지 · 해제") 복사한 뒤 다시 시작한다.

## 4. 설치 순서

### 4-1. 서버 가상환경과 패키지

```powershell
cd C:\dev\AIfred\server
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -e .
cd C:\dev\AIfred
```

운영에는 테스트용 패키지(`.[dev]`)가 필요 없다.

### 4-2. 웹 패키지

```powershell
cd C:\dev\AIfred\web
npm ci
cd C:\dev\AIfred
```

`npm ci`는 `package-lock.json` 그대로 설치한다. 빌드 도구가 devDependencies에 있으므로 `--omit=dev`를 붙이지 않는다.

### 4-3. 웹 빌드

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-web.ps1
```

"빌드 완료"가 나오면 `web\dist`가 만들어진 것이다.

### 4-4. HTTPS 인증서 (mkcert)

```powershell
winget install -e --id FiloSottile.mkcert
```
설치 뒤 **PowerShell 창을 새로 열고** `cd C:\dev\AIfred`로 돌아온다.

```powershell
mkcert -install
```
집 PC에 로컬 인증 기관(CA)을 만들고 Windows에 등록한다. **"보안 경고 … 이 인증서를 설치하시겠습니까?" 창이 뜨면 "예"를 누른다.** 이제 집 PC의 브라우저는 mkcert 인증서를 믿는다.

인증서 만들기(`<집PC IP>`를 실제 IP로 바꾼다):
```powershell
New-Item -ItemType Directory -Force certs
mkcert -cert-file certs\aifred.pem -key-file certs\aifred-key.pem <집PC IP> localhost 127.0.0.1
```
예: `mkcert -cert-file certs\aifred.pem -key-file certs\aifred-key.pem 192.168.0.20 localhost 127.0.0.1`

- `scripts\run-server.ps1`은 `certs\aifred.pem`과 `certs\aifred-key.pem`이 둘 다 있으면 HTTPS로, 없으면 HTTP로 뜬다.
- `certs\`와 `*.pem`은 Git에 올라가지 않는다(`.gitignore`). 다른 사람에게 보내지 않는다.

### 4-5. 폰에 CA 설치 (한 번만)

폰이 집 PC의 인증서를 믿게 하려면 mkcert의 **CA 인증서**(`rootCA.pem`)를 폰에 설치한다.

1. CA 폴더 열기:
   ```powershell
   mkcert -CAROOT
   explorer (mkcert -CAROOT)
   ```
   폴더 안에 `rootCA.pem`과 `rootCA-key.pem`이 있다.
2. **`rootCA.pem`만** 폰으로 옮긴다(USB 케이블, 나에게 메일 보내기, 메신저 "나와의 채팅" 등). 폰의 "다운로드" 폴더에 저장한다.
   > **`rootCA-key.pem`은 절대 옮기거나 공유하지 않는다.** 이 키가 있으면 누구든 내 폰이 믿는 가짜 인증서를 만들어 어떤 사이트든 흉내 낼 수 있다. 집 PC 밖으로 내보내지 않는다.
3. 폰에서 CA 인증서로 설치한다. 메뉴 이름은 제조사와 Android 버전마다 다르다. 설정 검색창에 **"인증서"** 또는 **"CA 인증서"**를 검색하면 빠르다.
   - 삼성: 설정 → 보안 및 개인정보 보호 → 기타 보안 설정 → 기기에 저장된 인증서 설치(기기 저장소에서 설치) → **CA 인증서**
   - 픽셀: 설정 → 보안 및 개인정보 보호 → 기타 보안 및 개인 정보 보호 → 암호화 및 사용자 인증 정보 → 인증서 설치 → **CA 인증서**
   - "CA 인증서"를 고르면 경고가 나온다. "그래도 설치"를 누르고 화면 잠금(PIN 등)을 확인한 뒤 `rootCA.pem`을 고른다.
   - 파일 선택 화면에 `rootCA.pem`이 안 보이면 이름을 `rootCA.crt`로 바꿔서 다시 옮긴다.
   - "VPN 및 앱 사용자 인증서"나 "Wi-Fi 인증서"가 아니라 **CA 인증서**로 설치해야 한다.
4. 확인: 같은 메뉴의 "사용자 인증서 보기/신뢰할 수 있는 인증서 → 사용자" 탭에 `mkcert …`가 보이면 된다.

CA는 한 번만 설치하면 된다. IP가 바뀌어 인증서(4-4의 두 번째 명령)를 다시 만들 때도 같은 CA를 쓰므로 폰에 다시 설치할 필요가 없다. 단, 집 PC에서 `mkcert -install`을 다른 사용자 계정이나 새 Windows에서 다시 하면 CA가 새로 생기므로 폰에도 다시 설치한다.

### 4-6. 자동 실행 등록

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-autostart.ps1 -StartNow
```

- 작업 스케줄러에 "AIFred Server"를 등록한다: 로그온할 때 창 없이 실행, 실패하면 1분 간격 3회 재시작, 시간 제한 없음. 관리자 권한은 필요 없다.
- `-StartNow`로 지금 바로 서버를 띄운다. "지금 서버를 시작했습니다: https://localhost:8080"이 나와야 한다. `http://`로 나오면 4-4의 인증서 파일 이름과 위치(`C:\dev\AIfred\certs\`)를 확인한다.
- 방화벽 규칙은 관리자 권한이 필요하다고 안내가 나온다. 다음 단계에서 추가한다.

### 4-7. 네트워크 프로필과 방화벽 (관리자 PowerShell)

시작 메뉴에서 "PowerShell"을 오른쪽 클릭 → **관리자 권한으로 실행**한 창에서:

```powershell
# 지금 연결된 네트워크와 프로필(Public/Private) 확인
Get-NetConnectionProfile

# 집 네트워크를 "개인"으로. "Wi-Fi"는 위 결과의 InterfaceAlias로 바꾼다(유선이면 보통 "이더넷").
Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private

# 개인 네트워크에서 8080 들어오는 연결 허용
New-NetFirewallRule -DisplayName "AIFred Server 8080" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow -Profile Private
```

- 네트워크가 "공용(Public)"이면 방화벽 규칙이 적용되지 않아 폰에서 열리지 않는다. 집 공유기에만 "개인"을 쓴다.
- 규칙이 이미 있으면 `New-NetFirewallRule`이 같은 이름의 규칙을 하나 더 만든다. 확인은 `Get-NetFirewallRule -DisplayName "AIFred Server 8080"`.

### 4-8. 폰에서 열고 앱 설치

1. 폰이 집 Wi-Fi에 연결되어 있는지 확인한다(모바일 데이터 아님).
2. 폰 Chrome에서 `https://<집PC IP>:8080`을 연다. 예: `https://192.168.0.20:8080`
3. 주소창 왼쪽에 경고 없이 열리면(자물쇠 또는 설정 아이콘) 인증서가 제대로 된 것이다.
4. Chrome 메뉴(⋮) → **"앱 설치"** 또는 **"홈 화면에 추가"** → 설치.
5. 홈 화면의 AIFred 아이콘(파란 바탕에 집과 체크)으로 연다. 주소창 없이 앱처럼 열린다.

## 5. 확인 체크리스트

- [ ] 집 PC 브라우저에서 `https://localhost:8080`이 경고 없이 열리고 대시보드가 보인다.
- [ ] 집 PC 브라우저에서 `https://localhost:8080/api/health`가 `{"status":"ok"}`를 보여 준다.
- [ ] 폰 Chrome에서 `https://<집PC IP>:8080`이 열린다.
- [ ] 폰 주소창에 "주의 요함"/"안전하지 않음" 경고가 없다(자물쇠 표시).
- [ ] 폰에서 앱 설치(홈 화면 아이콘)가 되고, 아이콘으로 열면 주소창 없이 열린다.
- [ ] 집안일 하나를 완료 체크해 보고, 집 PC 브라우저에서 새로 고쳐도 같은 상태다.
- [ ] 집 PC를 재부팅하고 로그인한 뒤 1~2분 안에 폰에서 다시 열린다(자동 실행).
- [ ] `server\logs\run-server.log` 마지막 "시작:" 줄이 `https://0.0.0.0:8080  HTTPS …`이다.

## 6. 업데이트 방법

노트북에서 고친 코드를 GitHub에 올린 뒤, 집 PC에서:

```powershell
cd C:\dev\AIfred
git pull

# 서버 의존성(server\pyproject.toml)이 바뀌었으면
.\server\.venv\Scripts\python.exe -m pip install -e .\server

# 웹 의존성(web\package-lock.json)이 바뀌었으면
cd web; npm ci; cd ..

# 화면 빌드
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-web.ps1
```

그다음 **운영 서버를 다시 시작한다.** 명령은 README의 "매일 쓰기 → 업데이트"에 있다(작업 중지 → 8080 프로세스 종료 → 작업 시작).
화면(`web/`)만 바뀌었으면 빌드만으로 충분하지만, 어느 쪽이 바뀌었는지 모르겠으면 다시 시작하면 된다. 서버를 다시 시작하면 실제 DB에 스키마 변경(없는 열 추가)이 적용된다.

폰의 앱은 새 버전을 알아서 받는다. 앱이 열려 있으면 하던 일(시트·메뉴, 저장 중, 실행 취소 알림, 게이지 조절)이 없을 때 저절로 새로고침되고, 뒤에 두었던 앱은 다시 꺼낼 때 새 화면이 된다.

## 7. 문제 해결

### 폰에서 안 열린다 (시간 초과, 연결할 수 없음)

1. 집 PC에서 `https://localhost:8080`이 열리는지 먼저 본다. 안 열리면 서버 문제다 → 아래 "서버 로그".
2. 폰이 같은 Wi-Fi에 있는지 본다. 게스트 Wi-Fi나 5GHz/2.4GHz가 다른 네트워크로 분리된 공유기면 PC와 같은 네트워크에 연결한다.
3. 집 PC IP가 바뀌지 않았는지 `ipconfig`로 본다. 바뀌었으면 폰 주소를 새 IP로 열고, 인증서도 다시 만든다(아래 "IP가 바뀌었을 때").
4. 네트워크 프로필: `Get-NetConnectionProfile`의 `NetworkCategory`가 `Private`인지 본다. `Public`이면 4-7의 `Set-NetConnectionProfile`.
5. 방화벽 규칙: `Get-NetFirewallRule -DisplayName "AIFred Server 8080" | Select-Object DisplayName, Enabled, Profile`. 없으면 4-7의 `New-NetFirewallRule`.
6. 다른 백신/보안 프로그램이 자체 방화벽을 쓰면 거기서도 8080을 허용한다.
7. 주소를 `http://`로 열었는지 본다. 운영 서버가 HTTPS로 떠 있으면 `http://`로는 열리지 않는다. `https://`로 연다.

### 인증서 경고가 뜬다 ("연결이 비공개로 설정되어 있지 않습니다", NET::ERR_CERT_…)

- `ERR_CERT_AUTHORITY_INVALID`: 폰에 CA가 설치되지 않았다. 4-5를 다시 한다. "CA 인증서"로 설치했는지, 옮긴 파일이 `rootCA.pem`(키 파일 아님)인지 확인한다.
- `ERR_CERT_COMMON_NAME_INVALID`: 주소의 IP가 인증서에 없다. IP가 바뀌었거나 다른 주소로 열었다. 아래 "IP가 바뀌었을 때".
- 집 PC 브라우저에서 경고가 뜨면 `mkcert -install`을 다시 실행한다.
- 경고를 무시하고 들어가면 화면은 보이지만 앱 설치와 서비스 워커가 동작하지 않는다. 경고 없이 열리게 고친다.

### IP가 바뀌었을 때

```powershell
cd C:\dev\AIfred
mkcert -cert-file certs\aifred.pem -key-file certs\aifred-key.pem <새 집PC IP> localhost 127.0.0.1
```
그다음 운영 서버를 다시 시작한다(README "매일 쓰기 → 업데이트"의 재시작 명령). 폰에 CA를 다시 설치할 필요는 없다. 폰에 설치한 앱은 옛 주소를 가리키므로, 새 주소로 연 뒤 앱을 다시 설치한다. 다시 바뀌지 않게 공유기에서 DHCP 예약을 해 둔다(0. 전제).

### 서버 로그

`C:\dev\AIfred\server\logs\`
- `run-server.log`: 시작·종료 시각, HTTPS/HTTP 중 어느 쪽으로 떴는지, 종료 코드, 포트가 이미 쓰이는 경우
- `server.log`: 서버 로그(시작, 오류)
- `access.log`: 요청 기록. 폰 요청이 여기 안 찍히면 요청이 PC까지 오지 않은 것이다(방화벽·네트워크 문제)
- `stderr.log`, `stdout.log`: 로깅이 설정되기 전 오류(인증서 파일을 읽지 못한 경우 등)

자동 실행 작업 상태: `Get-ScheduledTask -TaskName "AIFred Server" | Get-ScheduledTaskInfo` (LastTaskResult 0이면 정상, 실행 중이면 267009).
작업 스케줄러 없이 직접 띄워 보기(창에 오류가 보인다): `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-server.ps1`. 8080이 이미 쓰이고 있으면 기록만 남기고 끝난다.

중지·해제 방법은 README "매일 쓰기 → 중지 · 해제"에 있다.
