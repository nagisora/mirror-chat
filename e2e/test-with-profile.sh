#!/usr/bin/env bash
# ログイン済み Chrome プロファイルを使って E2E テストを実行する
# 使い方: ./test-with-profile.sh [pnpm test の引数...]
# 例: ./test-with-profile.sh
# 例: ./test-with-profile.sh --headed

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PROFILE_ZIP="$SCRIPT_DIR/chrome-profile.zip"
PROFILE_DIR="$SCRIPT_DIR/.chrome-profile"

if [[ ! -f "$PROFILE_ZIP" ]]; then
  echo "エラー: $PROFILE_ZIP が見つかりません。"
  echo ""
  echo "ログイン済み Chrome プロファイルをエクスポートし、"
  echo "e2e/chrome-profile.zip に配置してください。"
  echo ""
  echo "詳細: docs/E2E_LOGIN_PROFILE.md を参照"
  exit 1
fi

echo "プロファイルを展開しています..."
rm -rf "$PROFILE_DIR"
mkdir -p "$PROFILE_DIR"
unzip -q -o "$PROFILE_ZIP" -d "$PROFILE_DIR"

echo "ログイン済みプロファイルでテストを実行します..."
export MIRRORCHAT_USER_DATA_DIR="$PROFILE_DIR"
exec pnpm test "$@"
