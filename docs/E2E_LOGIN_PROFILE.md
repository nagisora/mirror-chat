# ログイン済み Chrome プロファイルで E2E フルテストを実行する

Cloud Agent 環境など、リモートで E2E テストを実行する際に、各 AI サービス（ChatGPT, Claude, Gemini, Grok）へログイン済みの Chrome プロファイルを使う手順です。

## セキュリティ上の注意

- Chrome プロファイルには **セッション Cookie やトークン** が含まれます
- プロファイルを共有・アップロードする際は、**信頼できる環境のみ** に限定してください
- テスト用に **専用アカウント** を使うことを推奨します
- プロファイルは `.gitignore` に含まれており、リポジトリにはコミットされません

---

## 手順 1: ローカルで Chrome プロファイルをエクスポート（Linux Flatpak）

### 1. Chrome を完全に終了する

タスクマネージャーで `chrome` / `Google Chrome` が残っていないことを確認してください。

### 2. エクスポート用スクリプトを実行

Flatpak 版 Chrome のプロファイルは `~/.var/app/com.google.Chrome/config/google-chrome` にあります。

**Default プロファイルを使う場合:**

```bash
mkdir -p /tmp/chrome-profile-export
cd /tmp/chrome-profile-export

PROFILE=~/.var/app/com.google.Chrome/config/google-chrome

cp -r "$PROFILE/Default" ./Default
cp "$PROFILE/Local State" ./Local\ State 2>/dev/null || true

zip -r chrome-profile.zip Default
[[ -f "Local State" ]] && zip -u chrome-profile.zip "Local State"
```

**専用プロファイル（Profile 1 など）を使う場合:**

E2E テストは `Default` というフォルダ名を期待するため、コピー時にリネームします。

```bash
mkdir -p /tmp/chrome-profile-export
cd /tmp/chrome-profile-export

PROFILE=~/.var/app/com.google.Chrome/config/google-chrome
PROFILE_NAME="Profile 1"   # 実際のプロファイル名に合わせて変更

cp -r "$PROFILE/$PROFILE_NAME" ./Default
cp "$PROFILE/Local State" ./Local\ State 2>/dev/null || true

zip -r chrome-profile.zip Default
[[ -f "Local State" ]] && zip -u chrome-profile.zip "Local State"
```

### 3. zip をワークスペースに配置

- Cursor のファイルエクスプローラーで `e2e/chrome-profile.zip` にドラッグ＆ドロップでアップロード
- または、`/workspace/e2e/chrome-profile.zip` に配置

---

## 手順 2: Cloud Agent でテストを実行

プロファイル zip を `e2e/chrome-profile.zip` に配置した状態で、以下を実行します。

```bash
cd /workspace/e2e
pnpm run test:with-profile
```

このスクリプトは以下を行います:
1. `chrome-profile.zip` を `e2e/.chrome-profile/` に展開
2. `MIRRORCHAT_USER_DATA_DIR` と `MIRRORCHAT_E2E_FULL=1` を設定して Playwright を実行（送信〜回答取得のフルフロー用スペックが有効になる）

### フルフロー用の環境変数

| 変数 | 説明 |
|------|------|
| `MIRRORCHAT_E2E_FULL` | `1` で `tests/mirrorchat-full-flow.spec.js` が実行される（`test-with-profile` が既定で設定） |
| `MIRRORCHAT_E2E_REQUIRE_OBSIDIAN` | 既定 `1`。`0` にすると Obsidian 保存の成否は問わず、4サイトとも回答取得（インジケータ `done`）までを検証（Computer Use で Obsidian 未起動のとき向け） |
| `MIRRORCHAT_E2E_AFTER_OPEN_WAIT_MS` | タブオープン後の待ち（既定 30000） |
| `MIRRORCHAT_E2E_POST_SEND_WAIT_MS` | 送信完了から「回答を取得」クリックまでの待ち（既定 180000） |
| `MIRRORCHAT_E2E_BROWSER_CHANNEL` | `chromium` で Playwright 同梱 Chromium に固定（プロファイル Cookie が読めないことがある）。未指定時はシステムの Chrome 実行ファイルを探索して `executablePath` で起動 |
| `MIRRORCHAT_CHROME_EXECUTABLE` | Google Chrome のバイナリパス（探索に失敗する環境向け） |

`test-with-profile.sh` は `MIRRORCHAT_USER_DATA_DIR` を zip 展開先に設定するため、**システムの Google Chrome** で起動する前提です（`/usr/local/bin/google-chrome` 等を自動検出）。`pnpm exec playwright install chrome` は任意です。

フルフロー用スペックのみ実行する例:

```bash
cd e2e
MIRRORCHAT_E2E_FULL=1 pnpm exec playwright test --grep "フルフロー"
```

---

## トラブルシューティング

### プロファイルが認識されない

- `Default` フォルダが `.chrome-profile/` 直下にあることを確認
- `Local State` が同じ階層にあることを確認
- 専用プロファイルを使う場合、zip 内のフォルダ名を `Default` にリネームしてから含めているか確認

### ログインが切れている

- セッションの有効期限が切れている可能性があります
- ローカルで再度ログインし、プロファイルを再エクスポートしてください

### ブラウザは開くがずっと `about:blank` のまま／テストがすぐ失敗する

- Chrome が **前回のセッションを復元**して別ウィンドウ・別タブを開いていると、目に見えているタブと Playwright が操作しているタブが一致しないことがあります。E2E ではカスタムプロファイル時に **先頭のタブ以外**を閉じます（**全タブを閉じると** Chrome が新規タブを開けず `Failed to open a new tab` になります。`e2e/fixtures.js`）。
- それでも不安定な場合は、手元の Chrome で当該プロファイルを開き、不要なウィンドウを閉じてから **正常終了**してから zip を取り直すと改善することがあります。

### Playwright が Chrome を起動できない（`EACCES` / `distribution 'chrome' is not found`）

- **Chromium だけでは Cookie が読めない**: 上記のとおり、カスタムプロファイル時は Google Chrome 本体の起動を試みます。
- **`spawn ... EACCES`**: パス上の `google-chrome` に実行権限がないことがあります。`chmod +x` するか、`MIRRORCHAT_CHROME_EXECUTABLE` に実バイナリ（例: `/opt/google/chrome/chrome`）を指定してください。
- **`Chromium distribution 'chrome' is not found`**: `pnpm exec playwright install chrome`（管理者権限が要る場合あり）か、システムに Google Chrome をインストールし、探索リストに載るパスに置いてください。

---

<details>
<summary><strong>その他の環境（Linux 通常版 / macOS / Windows）</strong></summary>

### User Data ディレクトリの場所

| 環境 | パス |
|------|------|
| Linux（通常） | `~/.config/google-chrome` |
| Linux（Flatpak） | `~/.var/app/com.google.Chrome/config/google-chrome` |
| macOS | `~/Library/Application Support/Google/Chrome` |
| Windows | `%LOCALAPPDATA%\Google\Chrome\User Data` |

上記のパス表の `PROFILE` 変数を、ご利用の環境に合わせて変更してください。

### 軽量化（最小限のファイルのみエクスポート）

認証に必要な主なファイル:
- `Default/Cookies` - セッション Cookie
- `Default/Local Storage/` - ローカルストレージ
- `Default/Network Persistent State` - ネットワーク状態
- `Local State` - ブラウザ設定

```bash
mkdir -p /tmp/chrome-profile-minimal/Default
cd /tmp/chrome-profile-minimal
PROFILE=~/.var/app/com.google.Chrome/config/google-chrome  # 環境に合わせて変更

cp "$PROFILE/Default/Cookies" Default/ 2>/dev/null || true
cp "$PROFILE/Default/Network Persistent State" Default/ 2>/dev/null || true
cp -r "$PROFILE/Default/Local Storage" Default/ 2>/dev/null || true
cp "$PROFILE/Local State" . 2>/dev/null || true

zip -r chrome-profile.zip Default
[[ -f "Local State" ]] && zip -u chrome-profile.zip "Local State"
```

### 手動でテストを実行する場合

```bash
cd /workspace/e2e

# zip を展開（初回のみ）
unzip -o chrome-profile.zip -d .chrome-profile/

# テスト実行
MIRRORCHAT_USER_DATA_DIR=/workspace/e2e/.chrome-profile pnpm test:headed
```

</details>
