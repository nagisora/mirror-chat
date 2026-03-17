#!/bin/bash
# ai-prompt-broadcaster 内の全 JavaScript ファイルの構文チェック
cd "$(dirname "$0")/.."
failed=0
for f in ai-prompt-broadcaster/*.js; do
  if node -c "$f" 2>&1; then
    echo "OK: $f"
  else
    failed=1
  fi
done
if [ "$failed" -eq 0 ]; then
  echo "構文チェック完了: 全ファイル問題なし"
else
  echo "構文エラーがあります。上記のエラーを確認してください。"
  exit 1
fi
