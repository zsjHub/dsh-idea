# ============================================================
#  停止 dsh web —— 结束监听 3080 端口的进程
#  用法：双击同目录下的「停止 dsh web.vbs」（无控制台闪窗）
#  注意：隐藏模式启动的 dsh web 没有可见控制台，
#        要关服务就用本脚本（按端口精准击杀，不误伤其他 node）
# ============================================================
$ErrorActionPreference = 'SilentlyContinue'

$conn = Get-NetTCPConnection -LocalPort 3080 -State Listen | Select-Object -First 1
if ($conn) {
    Stop-Process -Id $conn.OwningProcess -Force
    Start-Sleep -Milliseconds 800
    $still = Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue
    if ($still) { $msg = "dsh web 停止失败（端口 3080 仍被 PID $($still.OwningProcess) 监听）。" }
    else { $msg = 'dsh web 已停止（端口 3080 已释放）。' }
} else {
    $msg = 'dsh web 未在运行（端口 3080 无监听）。'
}

Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.MessageBox]::Show($msg, '停止 dsh web', 'OK', 'Information') | Out-Null
