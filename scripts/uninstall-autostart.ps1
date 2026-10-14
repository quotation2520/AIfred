# 작업 스케줄러의 "AIFred Server" 작업을 지운다. 실행 중인 서버도 멈춘다.
# 방화벽 규칙은 관리자 권한일 때만 지우고, 아니면 지우는 명령을 안내한다.
#
# 사용: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\uninstall-autostart.ps1 [-Port 8080]

param(
    [int]$Port = 8080
)

$ErrorActionPreference = 'Stop'

$taskName = 'AIFred Server'
$firewallRuleName = "AIFred Server $Port"

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($task) {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "작업 '$taskName' 을 지웠습니다." -ForegroundColor Green
} else {
    Write-Host "작업 '$taskName' 이 등록되어 있지 않습니다."
}

# 작업을 멈춰도 python 프로세스가 남을 수 있으므로 포트를 듣고 있는 프로세스를 확인한다.
$listening = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
foreach ($processId in ($listening | Select-Object -ExpandProperty OwningProcess -Unique)) {
    $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -like 'python*') {
        Stop-Process -Id $processId -Force
        Write-Host "포트 $Port 의 서버(PID $processId)를 멈췄습니다."
    } elseif ($proc) {
        Write-Host "포트 $Port 을 $($proc.ProcessName)(PID $processId)가 쓰고 있습니다. AIFred가 아니라서 그대로 둡니다." -ForegroundColor Yellow
    }
}

$rule = Get-NetFirewallRule -DisplayName $firewallRuleName -ErrorAction SilentlyContinue
if ($rule) {
    $identity = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    if ($identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        $rule | Remove-NetFirewallRule
        Write-Host "방화벽 규칙 '$firewallRuleName' 을 지웠습니다." -ForegroundColor Green
    } else {
        Write-Host "방화벽 규칙을 지우려면 관리자 PowerShell에서 실행하세요:" -ForegroundColor Yellow
        Write-Host "  Remove-NetFirewallRule -DisplayName '$firewallRuleName'"
    }
}
