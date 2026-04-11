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
# デフォルトは headless 実行（ブラウザウィンドウは表示しない）
pnpm test

# ブラウザを表示して実行
pnpm test:headed

# UI モード（デバッグ用）
pnpm test:ui
```

## ログイン済みプロファイルでフルテスト

各AIサービス（ChatGPT, Claude, Gemini, Grok）にログイン済みの Chrome プロファイルを使うと、送信〜回答取得まで一通りテストできます。

### ローカルで実行する場合

```bash
# Linux の Chrome User Data ディレクトリ例（headless 実行）
MIRRORCHAT_USER_DATA_DIR=~/.config/google-chrome pnpm test

# ブラウザを表示したい場合
MIRRORCHAT_USER_DATA_DIR=~/.config/google-chrome pnpm test:headed
```

### Cloud Agent で実行する場合

1. ローカルで Chrome を終了し、プロファイルを zip にエクスポート
2. `e2e/chrome-profile.zip` に配置（Cursor でドラッグ＆ドロップ等）
3. 以下を実行:

```bash
cd e2e
pnpm test:with-profile
```

詳細な手順は [docs/E2E_LOGIN_PROFILE.md](../docs/E2E_LOGIN_PROFILE.md) を参照してください。

未ログインの場合は「サイトを開く」「ポップアップ表示」などの基本動作のみ検証されます。

## 備考

- `pnpm test` / `pnpm test:with-profile` は一時プロファイルを使うため、前回の拡張設定が次回実行へ残りません
- `--headed` または `pnpm test:headed` / `pnpm test:with-profile:headed` を使うと、従来どおりブラウザを表示して確認できます
