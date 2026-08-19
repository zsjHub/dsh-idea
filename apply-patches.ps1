# ============================================================
#  apply-patches.ps1 - Apply source patches from dsh-idea
#  to a deepseek-harness source checkout.
#
#  Usage:
#    powershell -ExecutionPolicy Bypass -File apply-patches.ps1
#    powershell -ExecutionPolicy Bypass -File apply-patches.ps1 -HarnessPath D:\path\to\deepseek-harness
#
#  Typical scenario: after `git pull` in deepseek-harness, run
#  this script to re-apply all custom patches.
# ============================================================
param(
    [string]$HarnessPath = ""
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourcePatches = Join-Path $here 'source-patches'

# ---- Auto-detect deepseek-harness path ----
if (-not $HarnessPath) {
    $candidates = @(
        "D:\project\DeepSeek\gitAutoUpdate\deepseek-harness",
        "D:\project\DeepSeek\deepseek-harness",
        "C:\project\DeepSeek\deepseek-harness",
        (Join-Path $here '..\deepseek-harness'),
        (Join-Path (Split-Path $here -Parent) 'deepseek-harness')
    )
    foreach ($c in $candidates) {
        $resolved = Resolve-Path $c -ErrorAction SilentlyContinue
        if ($resolved -and (Test-Path (Join-Path $resolved 'package.json'))) {
            $HarnessPath = $resolved
            break
        }
    }
}

if (-not $HarnessPath -or -not (Test-Path $HarnessPath)) {
    Write-Host ''
    Write-Host "ERROR: Cannot find deepseek-harness source directory." -ForegroundColor Red
    Write-Host "Please specify path: .\apply-patches.ps1 -HarnessPath D:\path\to\deepseek-harness" -ForegroundColor Yellow
    exit 1
}

# Verify target is a valid deepseek-harness repo
if (-not (Test-Path (Join-Path $HarnessPath 'package.json'))) {
    Write-Host ''
    Write-Host "ERROR: $HarnessPath is not a valid deepseek-harness directory (no package.json)" -ForegroundColor Red
    exit 1
}

# ---- Verify source-patches directory ----
if (-not (Test-Path $sourcePatches)) {
    Write-Host ''
    Write-Host "ERROR: Cannot find patches directory: $sourcePatches" -ForegroundColor Red
    Write-Host "Please run this script from the dsh-idea repository root." -ForegroundColor Yellow
    exit 1
}

Write-Host "===== dsh-idea Source Patch Applicator ====="
Write-Host "Target: $HarnessPath"
Write-Host ""

# ---- Read patch manifest ----
$patchFiles = Get-ChildItem $sourcePatches -Recurse -File | ForEach-Object {
    $relative = $_.FullName.Substring($sourcePatches.Length + 1)
    [PSCustomObject]@{
        Source      = $_.FullName
        Relative    = $relative
        Destination = Join-Path $HarnessPath $relative
    }
}

if ($patchFiles.Count -eq 0) {
    Write-Host "No patch files found (source-patches/ directory is empty)" -ForegroundColor Yellow
    exit 0
}

Write-Host "Found $($patchFiles.Count) patch files:"
Write-Host ""

# ---- Apply patches ----
$applied = 0
$skipped = 0
$errors = @()

foreach ($patch in $patchFiles) {
    $targetDir = Split-Path $patch.Destination -Parent
    if (-not (Test-Path $targetDir)) {
        New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        Write-Host "  [DIR] Created: $targetDir" -ForegroundColor Cyan
    }

    try {
        Copy-Item $patch.Source $patch.Destination -Force
        Write-Host "  [OK] $($patch.Relative)" -ForegroundColor Green
        $applied++
    } catch {
        $errors += "[FAIL] $($patch.Relative): $_"
        $skipped++
    }
}

# ---- Report ----
Write-Host ""
Write-Host "===== Result ====="
Write-Host "  Applied: $applied" -ForegroundColor Green
if ($skipped -gt 0) {
    Write-Host "  Skipped/Failed: $skipped" -ForegroundColor Yellow
    foreach ($e in $errors) { Write-Host "    $e" -ForegroundColor Yellow }
}

if ($applied -eq $patchFiles.Count) {
    Write-Host ""
    Write-Host "All patches applied successfully! You can now start dsh:" -ForegroundColor Green
    Write-Host "  cd $HarnessPath" -ForegroundColor Cyan
    Write-Host "  pnpm dsh web" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Note: dsh runs from source (tsx), patches take effect immediately."
}

Write-Host ""
Write-Host "Tip: Do not commit patched files to the deepseek-harness repository."
Write-Host "Patch files are managed in dsh-idea/source-patches/."