# MirrorChat E2E テスト

Playwright を使った Chrome 拡張機能の自動テストです。

## セットアップ

```bash
cd e2e
pnpm install
pnpm exec playwright install chromium
```

## 実行方法

```bash
# ヘッドレスモード（CI向け）
pnpm test

# ブラウザを表示して実行
pnpm test:headed

# UI モード（デバッグ用）
pnpm test:ui
```

## ログイン済みプロファイルでフルテスト

各AIサービス（ChatGPT, Claude, Gemini, Grok）にログイン済みの Chrome プロファイルを使うと、送信〜回答取得まで一通りテストできます。

```bash
# Linux の Chrome プロファイル例
MIRRORCHAT_USER_DATA_DIR=~/.config/google-chrome/Default pnpm test:headed
```

未ログインの場合は「サイトを開く」「ポップアップ表示」などの基本動作のみ検証されます。
