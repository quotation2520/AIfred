# AIFred 운영 서버를 실행한다. FastAPI 하나가 빌드된 웹(web/dist)과 /api를 함께 제공한다.
# 작업 스케줄러("AIFred Server", scripts\install-autostart.ps1)가 로그온할 때 이 스크립트를 실행한다.
#
# 사용: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-server.ps1
#       [-Port 8080] [-BindHost 0.0.0.0] [-DbPath server\data\aifred.db] [-LogDir server\logs]
#       [-CertFile certs\aifred.pem] [-KeyFile certs\aifred-key.pem]
#
# - HTTPS: 인증서(-CertFile)와 키(-KeyFile)가 둘 다 있으면 HTTPS로, 아니면 HTTP로 뜬다.
#   기본 경로는 저장소 루트의 certs\aifred.pem, certs\aifred-key.pem(mkcert로 만든다, docs\host-setup.md).
#   어느 쪽으로 떴는지 run-server.log에 남긴다. certs\와 *.pem은 Git에 넣지 않는다(.gitignore).
# - --reload 없이 실행한다.
# - 로그: <LogDir>\server.log(서버), access.log(요청). 각각 1MB가 넘으면 회전하고 몇 개만 남긴다.
#   run-server.log에는 이 스크립트의 시작·종료 기록, stderr.log에는 로깅이 설정되기 전 오류가 남는다.
# - 포트가 이미 사용 중이면 기록을 남기고 exit 1로 끝난다.

param(
    [int]$Port = 8080,
    [string]$BindHost = '0.0.0.0',
    [string]$DbPath = '',
    [string]$LogDir = '',
    [string]$CertFile = '',
    [string]$KeyFile = ''
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$serverDir = Join-Path $repoRoot 'server'
$python = Join-Path $serverDir '.venv\Scripts\python.exe'
if (-not $DbPath) { $DbPath = Join-Path $serverDir 'data\aifred.db' }
if (-not $LogDir) { $LogDir = Join-Path $serverDir 'logs' }
if (-not $CertFile) { $CertFile = Join-Path $repoRoot 'certs\aifred.pem' }
if (-not $KeyFile) { $KeyFile = Join-Path $repoRoot 'certs\aifred-key.pem' }
$DbPath = [System.IO.Path]::GetFullPath($DbPath)
$LogDir = [System.IO.Path]::GetFullPath($LogDir)
$CertFile = [System.IO.Path]::GetFullPath($CertFile)
$KeyFile = [System.IO.Path]::GetFullPath($KeyFile)

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$runLog = Join-Path $LogDir 'run-server.log'

function Write-RunLog([string]$message) {
    # run-server.log도 너무 커지지 않게 1MB가 넘으면 한 번 밀어낸다.
    if ((Test-Path $runLog) -and ((Get-Item $runLog).Length -gt 1MB)) {
        Move-Item -Force $runLog "$runLog.1"
    }
    $line = "{0} {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $message
    Add-Content -Path $runLog -Value $line -Encoding UTF8
    Write-Host $line
}

if (-not (Test-Path $python)) {
    Write-RunLog "실패: $python 이 없습니다. server\에서 venv를 만들고 의존성을 설치하세요(README)."
    exit 1
}

$listening = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listening) {
    $owners = ($listening | Select-Object -ExpandProperty OwningProcess -Unique) -join ', '
    Write-RunLog "포트 $Port 이 이미 사용 중입니다(PID $owners). 서버를 시작하지 않고 종료합니다."
    exit 1
}

# uvicorn --log-config에 넘길 logging 설정. 파일 경로를 절대 경로로 넣기 위해 실행할 때 만든다.
$logConfig = @{
    version = 1
    disable_existing_loggers = $false
    formatters = @{
        default = @{
            '()' = 'uvicorn.logging.DefaultFormatter'
            fmt = '%(asctime)s %(levelprefix)s %(name)s: %(message)s'
            use_colors = $false
        }
        access = @{
            '()' = 'uvicorn.logging.AccessFormatter'
            fmt = '%(asctime)s %(client_addr)s "%(request_line)s" %(status_code)s'
            use_colors = $false
        }
    }
    handlers = @{
        server = @{
            class = 'logging.handlers.RotatingFileHandler'
            formatter = 'default'
            filename = (Join-Path $LogDir 'server.log')
            maxBytes = 1048576
            backupCount = 5
            encoding = 'utf-8'
        }
        access = @{
            class = 'logging.handlers.RotatingFileHandler'
            formatter = 'access'
            filename = (Join-Path $LogDir 'access.log')
            maxBytes = 1048576
            backupCount = 3
            encoding = 'utf-8'
        }
    }
    loggers = @{
        'uvicorn' = @{ handlers = @('server'); level = 'INFO'; propagate = $false }
        'uvicorn.error' = @{ level = 'INFO' }
        'uvicorn.access' = @{ handlers = @('access'); level = 'INFO'; propagate = $false }
    }
    root = @{ handlers = @('server'); level = 'INFO' }
}
$logConfigPath = Join-Path $LogDir 'logging.json'
# Python json은 BOM을 읽지 못하므로 BOM 없는 UTF-8로 쓴다.
[System.IO.File]::WriteAllText($logConfigPath, ($logConfig | ConvertTo-Json -Depth 6), (New-Object System.Text.UTF8Encoding($false)))

$env:AIFRED_DB_PATH = $DbPath
$env:PYTHONUTF8 = '1'

$arguments = "-m uvicorn app.main:app --host $BindHost --port $Port --log-config `"$logConfigPath`""

$hasCert = Test-Path -PathType Leaf $CertFile
$hasKey = Test-Path -PathType Leaf $KeyFile
if ($hasCert -and $hasKey) {
    $arguments += " --ssl-certfile `"$CertFile`" --ssl-keyfile `"$KeyFile`""
    $scheme = 'https'
    $tlsNote = "HTTPS 인증서=$CertFile 키=$KeyFile"
} else {
    $scheme = 'http'
    if ($hasCert -or $hasKey) {
        $missing = if ($hasCert) { $KeyFile } else { $CertFile }
        $tlsNote = "HTTP (주의: 인증서와 키 중 하나가 없습니다: $missing)"
    } else {
        $tlsNote = "HTTP (인증서 없음: $CertFile)"
    }
}
Write-RunLog "시작: ${scheme}://${BindHost}:$Port  $tlsNote  DB=$DbPath  로그=$LogDir"

$process = Start-Process -FilePath $python -ArgumentList $arguments -WorkingDirectory $serverDir `
    -NoNewWindow -PassThru `
    -RedirectStandardOutput (Join-Path $LogDir 'stdout.log') `
    -RedirectStandardError (Join-Path $LogDir 'stderr.log')
$null = $process.Handle  # ExitCode를 읽으려면 핸들을 미리 잡아 둬야 한다(PowerShell 5.1).
$process.WaitForExit()
$code = $process.ExitCode

Write-RunLog "종료: exit $code (자세한 내용은 server.log, stderr.log)"
exit $code
