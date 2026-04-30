#!/bin/sh
# Managed by Lint. Reinstall through: lint hooks install
# Skip: LINT_SKIP=1 git commit ...
# Skip: git commit --no-verify

set -eu

[ "${LINT_SKIP:-0}" = "1" ] && exit 0

if command -v lint >/dev/null 2>&1; then
  lint pre-commit -t "$@"
elif command -v npx >/dev/null 2>&1; then
  npx --no-install lint pre-commit -t "$@"
else
  echo "Lint: lint command not found. Skipping hook."
  exit 0
fi
