# ============================================================
#  dsh-idea 一键安装脚本（Windows）
#  用法：右键 install.ps1 → 使用 PowerShell 运行
#       或: powershell -ExecutionPolicy Bypass -File install.ps1
#  自动完成: 装插件 → 打补丁 → 装启动器 → 装工具 → 写配置
#  提示：右键运行时窗口会在按回车后关闭；想看到完整日志，
#        请先在已打开的终端里运行 powershell -ExecutionPolicy Bypass -File .\install.ps1
# ============================================================
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host '===== dsh-idea 安装器 ====='

# 0) 前置检查
$dshCmd = Get-Command dsh -ErrorAction SilentlyContinue
if (-not $dshCmd) {
    Write-Host ''
    Write-Host '未找到 dsh 命令，请先安装: npm i -g @deepseek-ai/dsh' -ForegroundColor Yellow
    Write-Host '安装完 npm 后请【重新打开】这个窗口再运行一次。'
    Read-Host '按回车键关闭'
    exit 1
}

# 1) 获取 npm 全局路径
try {
    $npmPrefix = npm config get prefix
    if (-not $npmPrefix) { throw 'npm prefix 为空' }
} catch {
    Write-Host ''
    Write-Host '无法获取 npm 全局路径，请确认 npm 已安装且在 PATH 中。' -ForegroundColor Yellow
    Read-Host '按回车键关闭'
    exit 1
}

$globalRoot = Join-Path $npmPrefix 'node_modules'
$dshPkg = Join-Path $globalRoot '@deepseek-ai\dsh'
if (-not (Test-Path $dshPkg)) {
    Write-Host ''
    Write-Host "未找到全局 dsh 包目录: $dshPkg" -ForegroundColor Yellow
    Write-Host '请确认执行过: npm i -g @deepseek-ai/dsh'
    Write-Host "当前 npm prefix: $npmPrefix"
    Read-Host '按回车键关闭'
    exit 1
}

Write-Host "[信息] npm prefix: $npmPrefix" -ForegroundColor Cyan
Write-Host "[信息] dsh 包目录: $dshPkg" -ForegroundColor Cyan
Write-Host ""

# 2) 安装自研插件
$profilesNode = Join-Path $env:USERPROFILE '.dsh\profiles\node_modules\@anoslide'
New-Item -ItemType Directory -Path $profilesNode -Force | Out-Null
Copy-Item (Join-Path $here 'plugins\*') $profilesNode -Recurse -Force
Write-Host "[1/5] 插件已安装 -> $profilesNode"
Write-Host "      已安装: dsh-host-files, dsh-client-idea"

# 3) 打官方包补丁
$patchSrc = Join-Path $here 'patches\node_modules\@deepseek-ai'
$patchDst = Join-Path $dshPkg 'node_modules\@deepseek-ai'
if (Test-Path $patchSrc) {
    Copy-Item (Join-Path $patchSrc '*') $patchDst -Recurse -Force
    $patchCount = (Get-ChildItem $patchSrc -Directory).Count
    Write-Host "[2/5] 补丁已应用 -> $patchDst（$patchCount 个包）"
} else {
    Write-Host '[2/5] 未找到 patches 目录，跳过' -ForegroundColor Yellow
}

# 4) 安装启动器到 ~/.dsh/launcher/
$launcherDst = Join-Path $env:USERPROFILE '.dsh\launcher'
New-Item -ItemType Directory -Path $launcherDst -Force | Out-Null
Copy-Item (Join-Path $here 'launcher\*') $launcherDst -Force
Write-Host "[3/5] 启动器已安装 -> $launcherDst"
Write-Host "      包含: 启动 dsh IDE.vbs, 停止 dsh web.vbs, 应用图标"

# 可选：创建桌面快捷方式
$desktopShortcut = Join-Path $env:USERPROFILE 'Desktop\启动 dsh IDE.lnk'
if (-not (Test-Path $desktopShortcut)) {
    try {
        $wshell = New-Object -ComObject WScript.Shell
        $shortcut = $wshell.CreateShortcut($desktopShortcut)
        $shortcut.TargetPath = (Join-Path $launcherDst '启动 dsh IDE.vbs')
        $shortcut.IconLocation = (Join-Path $launcherDst 'icon.ico')
        $shortcut.WorkingDirectory = $launcherDst
        $shortcut.Save()
        Write-Host "      桌面快捷方式已创建: $desktopShortcut"
    } catch {
        Write-Host '      桌面快捷方式创建失败（可手动创建）' -ForegroundColor Yellow
    }
} else {
    Write-Host '      桌面快捷方式已存在，跳过'
}

# 5) 安装 MCP 工具到 ~/.dsh/tools/
$toolsSrc = Join-Path $here 'tools'
$toolsDst = Join-Path $env:USERPROFILE '.dsh\tools'
if (Test-Path $toolsSrc) {
    New-Item -ItemType Directory -Path $toolsDst -Force | Out-Null
    Copy-Item (Join-Path $toolsSrc '*') $toolsDst -Recurse -Force
    Write-Host "[4/5] MCP 工具已安装 -> $toolsDst"
} else {
    Write-Host '[4/5] 未找到 tools 目录，跳过' -ForegroundColor Yellow
}

# 6) 写入 cordis.patch.yml（已存在则不覆盖，避免冲掉已有配置）
$targetCfg = Join-Path $env:USERPROFILE '.dsh\profiles\web\cordis.patch.yml'
if (Test-Path $targetCfg) {
    Write-Host '[5/5] 检测到已有 cordis.patch.yml，未覆盖。' -ForegroundColor Yellow
    Write-Host '      请手动把仓库里 cordis.patch.yml 的配置段合并进去。'
    Write-Host '      需要包含以下插件：'
    Write-Host '        - @anoslide/dsh-host-files'
    Write-Host '        - @anoslide/dsh-client-idea'
} else {
    New-Item -ItemType Directory -Path (Split-Path $targetCfg) -Force | Out-Null
    Copy-Item (Join-Path $here 'cordis.patch.yml') $targetCfg -Force
    Write-Host "[5/5] 配置已写入 -> $targetCfg"
}

# 7) 安装 dsh-market（社区插件市场）
Write-Host "[6/6] 安装 dsh-market（社区插件市场）..."
try {
    dsh plugin --profile web add dshmarket *>&1 | Out-Null
    Write-Host "      已安装 dshmarket（如已存在则跳过）"
    Write-Host "      重启 dsh web 后，Settings → Plugin Market 可用"
} catch {
    Write-Host "      dsh-market 安装失败（可稍后手动安装）" -ForegroundColor Yellow
    Write-Host "      手动安装: dsh plugin --profile web add dshmarket"
}

Write-Host ''
Write-Host '===== 安装完成！启动方式 ====='
Write-Host '  1) 双击桌面「启动 dsh IDE」图标'
Write-Host '  2) 或终端运行: dsh web'
Write-Host '  3) 浏览器打开 http://127.0.0.1:3080'
Write-Host ''
Write-Host '提示:'
Write-Host '  - MCP server 在 dsh 设置面板「MCP 管理」中添加（数据存 ~/.dsh/mcp-servers.json）。'
Write-Host '  - 补丁按当前 dsh 版本制作，若你的版本不同可能部分失效，'
Write-Host '    但核心布局（自研插件）不受影响。'
Write-Host '  - 源码模式用户请用 apply-patches.ps1 而不是本脚本。'
Write-Host '  - dsh-market 已安装，重启后可在 Settings → Plugin Market 中浏览/安装社区插件。'
Write-Host ''
Read-Host '按回车键关闭此窗口'