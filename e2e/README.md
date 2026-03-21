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

- **4 サービスすべて**に依存します。1 つでもログイン切れ・取得失敗・応答に `TESTOK` が含まれない場合はテストが赤になります（メンテ・フレークの温床になりやすい点に注意）。
- 検証の主眼は **拡張のポップアップ UI（送信・インジケータ・ステータス）と取得テキスト**までです。Obsidian Vault 内の実ファイルを REST API で読む検証は含みません。

フルフローだけ実行する例:

```bash
cd e2e
MIRRORCHAT_E2E_FULL=1 pnpm exec playwright test --grep "フルフロー"
```

### ローカル（人間が実行）

1. Obsidian + Local REST API を起動し、拡張機能の Options で URL / API キーを設定しておく（保存まで完了させる）
2. ログイン済みの User Data を指定して **フルスイート** を有効化:

```bash
cd e2e
MIRRORCHAT_E2E_FULL=1 MIRRORCHAT_USER_DATA_DIR="$HOME/.config/google-chrome" pnpm test:headed
```

`pnpm test:with-profile:headed` は `e2e/chrome-profile.zip` を展開し、上記の `MIRRORCHAT_E2E_FULL=1` を自動で付与します。

### Cursor Cloud Agents（Computer Use 等）

1. ログイン済みプロファイルを `e2e/chrome-profile.zip` に配置（リポジトリには含めない）
2. Obsidian が無い／API 未設定の場合は取得のみ検証するモード:

```bash
cd e2e
MIRRORCHAT_E2E_REQUIRE_OBSIDIAN=0 pnpm test:with-profile:headed
```

3. Obsidian まで含めて検証する場合は通常どおり（`MIRRORCHAT_E2E_REQUIRE_OBSIDIAN` を省略、既定は `1`）

### 待ち時間の調整（遅いモデル・回線向け）

| 変数 | 既定 | 意味 |
|------|------|------|
| `MIRRORCHAT_E2E_AFTER_OPEN_WAIT_MS` | 30000 | タブオープン直後の読み込み待ち |
| `MIRRORCHAT_E2E_POST_SEND_WAIT_MS` | 180000 | 送信完了から「回答を取得」までの待ち |

詳細な手順は [docs/E2E_LOGIN_PROFILE.md](../docs/E2E_LOGIN_PROFILE.md) を参照してください。

未ログインの場合は「サイトを開く」「ポップアップ表示」などの基本動作のみ検証され、`MIRRORCHAT_E2E_FULL=1` なしではフルフロー用テストは **スキップ** されます。
