#!/bin/sh
# Managed by Lint.
set -eu

[ "${LINT_SKIP:-0}" = "1" ] && exit 0

if command -v lint >/dev/null 2>&1; then
  lint prepare-commit-msg "$@"
elif command -v npx >/dev/null 2>&1; then
  npx --no-install lint prepare-commit-msg "$@"
fi
