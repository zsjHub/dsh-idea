#!/usr/bin/env bash
# ============================================================
#  apply-patches.sh — Apply source patches from dsh-idea
#  to a deepseek-harness source checkout (Linux/macOS version).
#
#  Usage:
#    bash apply-patches.sh
#    bash apply-patches.sh /path/to/deepseek-harness
#
#  Typical scenario: after `git pull` in deepseek-harness, run
#  this script to re-apply all custom patches.
# ============================================================
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SOURCE_PATCHES="$HERE/source-patches"
HARNESS_PATH="${1:-}"

# ---- Auto-detect deepseek-harness path ----
if [ -z "$HARNESS_PATH" ]; then
    CANDIDATES=(
        "$HERE/../deepseek-harness"
        "$(dirname "$HERE")/deepseek-harness"
        "$HOME/project/deepseek-harness"
    )
    for c in "${CANDIDATES[@]}"; do
        if [ -f "$c/package.json" ]; then
            HARNESS_PATH="$c"
            break
        fi
    done
fi

if [ -z "$HARNESS_PATH" ] || [ ! -d "$HARNESS_PATH" ]; then
    echo "ERROR: Cannot find deepseek-harness source directory."
    echo "Usage: bash apply-patches.sh /path/to/deepseek-harness"
    exit 1
fi

if [ ! -f "$HARNESS_PATH/package.json" ]; then
    echo "ERROR: $HARNESS_PATH is not a valid deepseek-harness directory (no package.json)"
    exit 1
fi

if [ ! -d "$SOURCE_PATCHES" ]; then
    echo "ERROR: Cannot find patches directory: $SOURCE_PATCHES"
    echo "Please run this script from the dsh-idea repository root."
    exit 1
fi

echo "===== dsh-idea Source Patch Applicator ====="
echo "Target: $HARNESS_PATH"
echo ""

# ---- Read patch manifest ----
PATCH_FILES=()
while IFS= read -r -d '' f; do
    PATCH_FILES+=("$f")
done < <(find "$SOURCE_PATCHES" -type f -print0)

if [ ${#PATCH_FILES[@]} -eq 0 ]; then
    echo "No patch files found (source-patches/ directory is empty)"
    exit 0
fi

echo "Found ${#PATCH_FILES[@]} patch files:"
echo ""

# ---- Apply patches ----
APPLIED=0
SKIPPED=0

for src in "${PATCH_FILES[@]}"; do
    # Compute relative path
    relative="${src#$SOURCE_PATCHES/}"
    dest="$HARNESS_PATH/$relative"
    dest_dir="$(dirname "$dest")"

    # Create target directory if needed
    mkdir -p "$dest_dir"

    # Copy the file
    if cp "$src" "$dest"; then
        echo "  [OK] $relative"
        APPLIED=$((APPLIED + 1))
    else
        echo "  [FAIL] $relative"
        SKIPPED=$((SKIPPED + 1))
    fi
done

# ---- Report ----
echo ""
echo "===== Result ====="
echo "  Applied: $APPLIED"
if [ "$SKIPPED" -gt 0 ]; then
    echo "  Skipped/Failed: $SKIPPED"
fi

if [ "$APPLIED" -eq "${#PATCH_FILES[@]}" ]; then
    echo ""
    echo "All patches applied successfully! You can now start dsh:"
    echo "  cd $HARNESS_PATH"
    echo "  pnpm dsh web"
    echo ""
    echo "Note: dsh runs from source (tsx), patches take effect immediately."
fi

echo ""
echo "Tip: Do not commit patched files to the deepseek-harness repository."
echo "Patch files are managed in dsh-idea/source-patches/."