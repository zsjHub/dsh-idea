# ============================================================
#  启动 dsh IDE —— Edge --app 模式启动器
#  用法：双击同目录下的「启动 dsh IDE.vbs」（无控制台闪窗）
#       或直接运行本脚本（调试时可用 -TestOnly 干跑检查）
#  逻辑：
#    1. 探测 127.0.0.1:3080 是否已有 dsh web 在跑
#    2. 没有则自动拉起 dsh web（控制台完全隐藏，不占任务栏；停止用同目录「停止 dsh web」脚本）
#    3. 等端口就绪后，用 Edge --app 打开独立 IDE 窗口（1600x950）
# ============================================================
param([switch]$TestOnly)

$port = 3080
$url  = "http://127.0.0.1:$port"

function Test-PortOpen([int]$p, [int]$timeoutMs = 800) {
    try {
        $c = New-Object Net.Sockets.TcpClient
        $iar = $c.BeginConnect('127.0.0.1', $p, $null, $null)
        if (-not $iar.AsyncWaitHandle.WaitOne($timeoutMs)) { $c.Close(); return $false }
        $c.EndConnect($iar)
        $c.Close()
        return $true
    } catch { return $false }
}

# ---------- 1. 端口探测 ----------
$running = Test-PortOpen $port
Write-Host "dsh web 状态: $(if ($running) { "已在运行 (端口 $port)" } else { "未运行 (端口 $port 无响应)" })"

# ---------- 2. 未运行则拉起 dsh web ----------
if (-not $running) {
    if ($TestOnly) { Write-Host "[TestOnly] 跳过启动 dsh web"; }
    else {
        Write-Host "正在启动 dsh web ...（控制台已隐藏；停止用「停止 dsh web」脚本）"
        Start-Process cmd -ArgumentList '/c', 'title dsh web & dsh web' -WindowStyle Hidden
        $ok = $false
        for ($i = 0; $i -lt 60; $i++) {
            Start-Sleep -Seconds 1
            if (Test-PortOpen $port) { $ok = $true; break }
        }
        if (-not $ok) {
            Add-Type -AssemblyName System.Windows.Forms
            [System.Windows.Forms.MessageBox]::Show(
                "60 秒内 dsh web 未能就绪，请手动在终端运行 `dsh web` 后重试。",
                'dsh IDE 启动器', 'OK', 'Exclamation') | Out-Null
            exit 1
        }
        Write-Host "dsh web 已就绪"
    }
}

# ---------- 3. 找 Edge 并开 app 窗口 ----------
$edge = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($TestOnly) {
    Write-Host "Edge 路径: $(if ($edge) { $edge } else { '未找到，将退回 shell 的 msedge 命令' })"
    Write-Host "将打开: $url （--app 模式, 1600x950）"
    Write-Host "自检通过。"
    exit 0
}

if ($edge) {
    Start-Process $edge -ArgumentList "--app=$url", '--window-size=1600,950'
} else {
    Start-Process msedge -ArgumentList "--app=$url", '--window-size=1600,950'
}

# ---------- 4. 桌面快捷方式（带应用图标） ----------
if (-not $TestOnly) {
    $shortcutPath = Join-Path ([Environment]::GetFolderPath('Desktop')) 'dsh IDE.lnk'
    if (-not (Test-Path $shortcutPath)) {
        try {
            $ws = New-Object -ComObject WScript.Shell
            $lnk = $ws.CreateShortcut($shortcutPath)
            $lnk.TargetPath = Join-Path $PSScriptRoot '启动 dsh IDE.vbs'
            $lnk.IconLocation = Join-Path $PSScriptRoot 'favicon.ico'
            $lnk.WorkingDirectory = $PSScriptRoot
            $lnk.Description = '启动 dsh IDE（Edge app 独立窗口）'
            $lnk.Save()
            Write-Host "已创建桌面快捷方式: $shortcutPath"
        } catch {
            Write-Host "桌面快捷方式创建失败（不影响启动）: $($_.Exception.Message)"
        }
    }
}
