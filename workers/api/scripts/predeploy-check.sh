#!/usr/bin/env bash
set -euo pipefail

CONFIG_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/wrangler.toml"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "❌ Missing wrangler.toml at $CONFIG_FILE"
  exit 1
fi

if rg -n "REPLACE_[A-Z0-9_]+" "$CONFIG_FILE" >/dev/null; then
  echo "❌ Placeholder values still present in wrangler.toml."
  echo "   Replace all REPLACE_* values before deploying."
  rg -n "REPLACE_[A-Z0-9_]+" "$CONFIG_FILE"
  exit 1
fi

echo "✅ predeploy-check passed: no placeholder values found in wrangler.toml"
