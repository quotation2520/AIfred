# 현재 사용자가 로그온하면 AIFred 운영 서버(scripts\run-server.ps1)를 창 없이 실행하도록
# Windows 작업 스케줄러에 "AIFred Server" 작업을 등록한다. 다시 실행하면 기존 작업을 덮어쓴다.
# 관리자 권한 없이 등록한다. 방화벽 규칙(8080, 개인 프로필)은 관리자 권한일 때만 추가하고,
# 아니면 관리자 PowerShell에서 실행할 명령을 안내한다.
#
# 사용: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-autostart.ps1 [-Port 8080] [-StartNow]

param(
    [int]$Port = 8080,
    [switch]$StartNow
)

$ErrorActionPreference = 'Stop'

$taskName = 'AIFred Server'
$firewallRuleName = "AIFred Server $Port"
$repoRoot = Split-Path -Parent $PSScriptRoot
$runScript = Join-Path $repoRoot 'scripts\run-server.ps1'
$userId = "$env:USERDOMAIN\$env:USERNAME"

if (-not (Test-Path $runScript)) {
    Write-Host "$runScript 이 없습니다." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path (Join-Path $repoRoot 'web\dist\index.html'))) {
    Write-Host "주의: web\dist가 없습니다. 서버는 API만 제공합니다. 먼저 scripts\build-web.ps1을 실행하세요." -ForegroundColor Yellow
}

# -WindowStyle Hidden: 콘솔 창을 숨긴다(로그온 직후 아주 잠깐 보일 수 있다).
$psArgs = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$runScript`" -Port $Port"
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $psArgs -WorkingDirectory $repoRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew `
    -StartWhenAvailable

try {
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal `
        -Settings $settings -Description 'AIFred 운영 서버 (http://<PC IP>:8080). scripts\run-server.ps1' `
        -Force | Out-Null
} catch {
    Write-Host "작업 스케줄러 등록 실패: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "관리자 PowerShell에서 이 스크립트를 다시 실행해 보세요."
    exit 1
}
Write-Host "작업 '$taskName' 을 등록했습니다. 다음 로그온부터 서버가 자동으로 시작됩니다." -ForegroundColor Green

if ($StartNow) {
    Start-ScheduledTask -TaskName $taskName
    Write-Host "지금 서버를 시작했습니다: http://localhost:$Port"
} else {
    Write-Host "지금 바로 시작하려면: Start-ScheduledTask -TaskName '$taskName'"
}

# 방화벽: 개인(Private) 프로필에서 TCP $Port 인바운드 허용. 규칙을 만들려면 관리자 권한이 필요하다.
$firewallCommand = "New-NetFirewallRule -DisplayName '$firewallRuleName' -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Private"
$identity = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
$isAdmin = $identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if ($isAdmin) {
    Get-NetFirewallRule -DisplayName $firewallRuleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    New-NetFirewallRule -DisplayName $firewallRuleName -Direction Inbound -Protocol TCP -LocalPort $Port `
        -Action Allow -Profile Private | Out-Null
    Write-Host "방화벽 규칙 '$firewallRuleName' (개인 네트워크, TCP $Port 인바운드 허용)을 추가했습니다." -ForegroundColor Green
} elseif (Get-NetFirewallRule -DisplayName $firewallRuleName -ErrorAction SilentlyContinue) {
    Write-Host "방화벽 규칙 '$firewallRuleName' 이 이미 있습니다."
} else {
    Write-Host ""
    Write-Host "방화벽 규칙은 관리자 권한이 필요합니다. 폰에서 접속하려면 '관리자 PowerShell'에서 한 번 실행하세요:" -ForegroundColor Yellow
    Write-Host "  $firewallCommand"
    Write-Host "Wi-Fi 네트워크 프로필이 '공용'이면 '개인'으로 바꿔야 합니다."
}
