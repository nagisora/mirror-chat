# ログイン済み Chrome プロファイルで E2E フルテストを実行する

Cloud Agent 環境など、リモートで E2E テストを実行する際に、各 AI サービス（ChatGPT, Claude, Gemini, Grok）へログイン済みの Chrome プロファイルを使う手順です。

## セキュリティ上の注意

- Chrome プロファイルには **セッション Cookie やトークン** が含まれます
- プロファイルを共有・アップロードする際は、**信頼できる環境のみ** に限定してください
- テスト用に **専用アカウント** を使うことを推奨します
- プロファイルは `.gitignore` に含まれており、リポジトリにはコミットされません

---

## 手順 1: ローカルで Chrome プロファイルをエクスポート

### 1. Chrome を完全に終了する

タスクマネージャーで `chrome` / `Google Chrome` が残っていないことを確認してください。

### 2. User Data ディレクトリの場所を確認

| OS | User Data ディレクトリ |
|----|------------------------|
| Linux | `~/.config/google-chrome` |
| macOS | `~/Library/Application Support/Google/Chrome` |
| Windows | `%LOCALAPPDATA%\Google\Chrome\User Data` |

`Default` フォルダと `Local State` ファイルが含まれています。

### 3. 必要なファイルを zip にまとめる

**Linux の例:**

```bash
# 作業用ディレクトリを作成
mkdir -p /tmp/chrome-profile-export
cd /tmp/chrome-profile-export

PROFILE=~/.config/google-chrome  # Linux
# PROFILE=~/Library/Application\ Support/Google/Chrome  # macOS

# Default プロファイルと Local State をコピー
cp -r "$PROFILE/Default" ./Default
cp "$PROFILE/Local State" ./Local\ State 2>/dev/null || true

# zip に圧縮
zip -r chrome-profile.zip Default
[[ -f "Local State" ]] && zip -u chrome-profile.zip "Local State"
```

**最小限のファイル（軽量化・転送サイズ削減）:**

認証に必要な主なファイル:
- `Default/Cookies` - セッション Cookie
- `Default/Local Storage/` - ローカルストレージ
- `Default/Network Persistent State` - ネットワーク状態
- `Local State` - ブラウザ設定

```bash
mkdir -p /tmp/chrome-profile-minimal/Default
cd /tmp/chrome-profile-minimal
PROFILE=~/.config/google-chrome  # Linux

cp "$PROFILE/Default/Cookies" Default/ 2>/dev/null || true
cp "$PROFILE/Default/Network Persistent State" Default/ 2>/dev/null || true
cp -r "$PROFILE/Default/Local Storage" Default/ 2>/dev/null || true
cp "$PROFILE/Local State" . 2>/dev/null || true

zip -r chrome-profile.zip Default
[[ -f "Local State" ]] && zip -u chrome-profile.zip "Local State"
```

**重要**: zip を展開すると `Default/` と `Local State` が同じ階層に並ぶ構造にしてください。

### 4. zip をワークスペースに配置

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
2. `MIRRORCHAT_USER_DATA_DIR` を設定してテストを実行

---

## 手動で実行する場合

```bash
cd /workspace/e2e

# zip を展開（初回のみ）
unzip -o chrome-profile.zip -d .chrome-profile/

# テスト実行
MIRRORCHAT_USER_DATA_DIR=/workspace/e2e/.chrome-profile pnpm test:headed
```

---

## トラブルシューティング

### プロファイルが認識されない

- `Default` フォルダが `.chrome-profile/` 直下にあることを確認
- `Local State` が同じ階層にあることを確認

### ログインが切れている

- セッションの有効期限が切れている可能性があります
- ローカルで再度ログインし、プロファイルを再エクスポートしてください

### パスが異なる（macOS / Windows）

- 上記のパス表を参照し、ご利用の OS に合わせてパスを変更してください
