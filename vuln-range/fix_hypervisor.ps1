# 以管理员运行：检查并修复 Windows hypervisor 启动配置。
# 背景：Hyper-V 功能已启用、vmms/vmcompute 服务 Running，但 WSL2 建 VM 时
# HCS 仍报 HCS_E_HYPERV_NOT_INSTALLED —— 典型原因是 BCD 的 hypervisorlaunchtype 不是 Auto。

$out = "C:\Users\yuao\WorkBuddy\2026-10-10-17-02-37\vuln-range\bcd_check.txt"
$lines = @()

$lines += "=== BEFORE: bcdedit /enum {current} ==="
$lines += (& bcdedit /enum '{current}' 2>&1 | Out-String)

$cur = (& bcdedit /enum '{current}' 2>&1 | Out-String)
if ($cur -match 'hypervisorlaunchtype\s+(\S+)') {
    $lines += "=== FOUND hypervisorlaunchtype = $($Matches[1]) ==="
} else {
    $lines += "=== hypervisorlaunchtype NOT PRESENT in {current} ==="
}

$lines += "=== ACTION: bcdedit /set hypervisorlaunchtype auto ==="
$lines += (& bcdedit /set hypervisorlaunchtype auto 2>&1 | Out-String)

$lines += "=== AFTER: bcdedit /enum {current} ==="
$lines += (& bcdedit /enum '{current}' 2>&1 | Out-String)

$lines += "=== systeminfo Hyper-V 要求 ==="
$lines += (systeminfo 2>&1 | Select-String -Pattern "Hyper-V|hypervisor|虚拟机监控" | Out-String)

$lines += "=== DONE ==="
Set-Content -Path $out -Value $lines -Encoding UTF8
