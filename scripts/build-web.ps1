# AIFred 웹을 빌드한다(web/dist). 상시 실행 서버에 화면 업데이트를 배포하는 명령이다.
# 서버는 요청마다 web/dist에서 파일을 읽으므로, 화면만 바뀌었다면 서버를 다시 시작할 필요가 없다.
# 사용: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-web.ps1

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$webDir = Join-Path $repoRoot 'web'

if (-not (Test-Path (Join-Path $webDir 'node_modules'))) {
    Write-Host "web\node_modules가 없습니다. 먼저 web\에서 npm install을 실행하세요." -ForegroundColor Red
    exit 1
}

Push-Location $webDir
try {
    & npm.cmd run build
    $code = $LASTEXITCODE
} finally {
    Pop-Location
}

if ($code -ne 0) {
    Write-Host "빌드 실패 (exit $code)" -ForegroundColor Red
    exit $code
}

$index = Join-Path $webDir 'dist\index.html'
if (-not (Test-Path $index)) {
    Write-Host "빌드는 끝났지만 $index 가 없습니다." -ForegroundColor Red
    exit 1
}
Write-Host "빌드 완료: $(Join-Path $webDir 'dist')" -ForegroundColor Green
Write-Host "폰에서 앱을 새로 열면 새 화면이 나옵니다. 서버 코드를 바꿨다면 서버를 다시 시작하세요(README '매일 쓰기')."
