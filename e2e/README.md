# MirrorChat E2E テスト

Playwright を使った Chrome 拡張機能の自動テストです。

## セットアップ

```bash
cd e2e
pnpm install
pnpm exec playwright install chromium
# ログイン済みプロファイル（chrome-profile.zip 等）でフルテストする場合は Google Chrome も入れる
pnpm exec playwright install chrome
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
2. **`e2e/chrome-profile.zip` を使う場合（推奨）** — zip を展開して `MIRRORCHAT_USER_DATA_DIR` に載せ、`MIRRORCHAT_E2E_FULL=1` を付けるのを **`pnpm test:with-profile:headed` が代行**します。次のように実行してください（zip のパスは固定で `e2e/chrome-profile.zip`）。

```bash
cd e2e
pnpm test:with-profile:headed
```

3. **自分の PC の Chrome プロファイルを直接指す場合** — 例: いつも使っている Google Chrome の User Data ルート（`Default` の親ディレクトリ。Linux では多くの環境で `~/.config/google-chrome`）。

```bash
cd e2e
MIRRORCHAT_E2E_FULL=1 MIRRORCHAT_USER_DATA_DIR="$HOME/.config/google-chrome" pnpm test:headed
```

**注意:** `MIRRORCHAT_E2E_FULL=1` だけ付けて `MIRRORCHAT_USER_DATA_DIR` を付けないと、Playwright 用の空の `.playwright-user-data` で起動し、**各 AI にはログインした状態になりません**。zip を置いただけでは使われません。必ず `test-with-profile` か、上記のように User Data を明示してください。

また、ログイン済みプロファイルは **Google Chrome 用**に作られていることが多いです。E2E ではカスタム `MIRRORCHAT_USER_DATA_DIR` 指定時は既定で **システムの Google Chrome** を起動します（よくあるパスを順に探索し、見つかった実行ファイルを `executablePath` に渡します）。`pnpm exec playwright install chrome` が使えない環境でも、手元の Chrome があれば動きます。実行ファイルを明示する場合は `MIRRORCHAT_CHROME_EXECUTABLE=/path/to/google-chrome` を付与してください。同梱 Chromium のみで試す場合は `MIRRORCHAT_E2E_BROWSER_CHANNEL=chromium`（Cookie が読めず未ログインになることがあります）。

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
