# Enable WSL2 prerequisites (VirtualMachinePlatform) - MUST run as Administrator.
# Right click -> "Run with PowerShell" as admin, or run in an elevated PowerShell:
#   powershell -ExecutionPolicy Bypass -File C:\Users\yuao\WorkBuddy\2026-10-10-17-02-37\vuln-range\enable_vmp.ps1
# A reboot is REQUIRED afterwards.

$ErrorActionPreference = "Continue"

$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$pr = New-Object Security.Principal.WindowsPrincipal($id)
if (-not $pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "[FATAL] Not elevated. Right click -> Run as administrator." -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Running as administrator: $($id.Name)" -ForegroundColor Green

Write-Host "`n=== 1) Enable VirtualMachinePlatform ===" -ForegroundColor Cyan
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
Write-Host "dism exit=$LASTEXITCODE" -ForegroundColor Yellow

Write-Host "`n=== 2) Enable Microsoft-Windows-Subsystem-Linux (safety net) ===" -ForegroundColor Cyan
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
Write-Host "dism exit=$LASTEXITCODE" -ForegroundColor Yellow

Write-Host "`n=== 3) Force hypervisor to auto-start (BCD) ===" -ForegroundColor Cyan
bcdedit /set hypervisorlaunchtype auto
Write-Host "bcdedit exit=$LASTEXITCODE" -ForegroundColor Yellow
bcdedit /enum "{current}" | Select-String -Pattern "hypervisorlaunchtype"

Write-Host "`n=== 4) Verify feature state ===" -ForegroundColor Cyan
foreach ($f in "VirtualMachinePlatform", "Microsoft-Windows-Subsystem-Linux", "Microsoft-Hyper-V-Hypervisor") {
    $s = Get-WindowsOptionalFeature -Online -FeatureName $f -ErrorAction SilentlyContinue
    if ($s) { "{0,-42} {1}" -f $s.FeatureName, $s.State }
}

Write-Host "`n=== DONE. You MUST reboot now:  Restart-Computer ===" -ForegroundColor Magenta
Write-Host "After reboot, tell the agent to run: bash vuln-range/boot_stack.sh" -ForegroundColor Magenta
