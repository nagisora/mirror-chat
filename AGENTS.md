# AGENTS.md

## プロジェクト概要

MirrorChat は Chrome 拡張機能（Manifest V3）で、1つのプロンプトを4つのAIサービス（ChatGPT, Claude, Gemini, Grok）に順次送信し、Obsidian Local REST API 経由で回答を Markdown として保存するツールです。

## Cursor Cloud specific instructions

### アーキテクチャ

- **プラットフォーム**: Chrome Extension (Manifest V3)
- **言語**: Vanilla JavaScript (ES2020+)、ビルドシステムなし
- **依存関係**: npm/pnpm の依存関係なし、`package.json` なし
- **ソースコード**: `ai-prompt-broadcaster/` ディレクトリ内に全ファイルが配置

### 開発環境

- ビルドステップ不要。ソースコードをそのまま Chrome に読み込んで使用する。
- Chrome で `chrome://extensions/` を開き、デベロッパーモードを ON にして「パッケージ化されていない拡張機能を読み込む」から `ai-prompt-broadcaster/` フォルダを選択する。
- コード変更後は拡張機能ページのリロードボタン（円形矢印）をクリックするか、`chrome://extensions/` で拡張機能を再読み込みする。

### 起動方法

Chrome をヘッドレス環境で拡張機能付きで起動するコマンド:

```bash
google-chrome --no-sandbox --disable-gpu --load-extension=/workspace/ai-prompt-broadcaster --no-first-run --disable-default-apps --start-maximized &
```

### Obsidian セットアップ（E2Eテスト用）

Cloud Agent 環境でも Obsidian をインストールして E2E テストが可能:

```bash
# Obsidian AppImage をダウンロード・展開
cd /tmp
curl -L -o Obsidian.AppImage "https://github.com/obsidianmd/obsidian-releases/releases/download/v1.8.9/Obsidian-1.8.9.AppImage"
chmod +x Obsidian.AppImage && ./Obsidian.AppImage --appimage-extract

# Vault ディレクトリ作成・起動
mkdir -p /home/ubuntu/ObsidianVault
/tmp/squashfs-root/obsidian --no-sandbox --disable-gpu &
```

起動後、GUI で Vault を `/home/ubuntu/ObsidianVault` に設定し、Community Plugins から「Local REST API」をインストール・有効化する。HTTP のデフォルトポートは 27123、HTTPS は 27124。拡張機能の Options で `http://127.0.0.1:27123/` を指定する。

### テスト・リント

- E2E テスト: `e2e/` ディレクトリで Playwright による自動テストを実行可能。`cd e2e && pnpm test`
- ログイン済み Chrome プロファイルを使うと送信〜回答取得までフルにテスト可能。未ログインの場合は基本動作のみ検証。
- 手動テストには Chrome ブラウザと、各AIサービスへのログイン、Obsidian + Local REST API プラグインが必要。
- 詳細な利用手順は `docs/CHROME_EXTENSION_USAGE.md` を参照。

### 2段階フロー

拡張機能は「サイトを開く」→「送信」の2段階方式で動作する:
1. ポップアップの「サイトを開く」で4つのAIサイトのタブを開く
2. 各サービスにログインしてから質問を入力して「送信」
3. タブは送信後も開いたまま維持される

### 注意事項

- **content-utils.js の定数**: 同一タブに SEND_ONLY / FETCH_ONLY で複数回インジェクトされるため、`const` だと "Identifier has already been declared" エラーになる。定数は `var` + 既存値チェック（`var X = X || 初期値`）で宣言すること。
- コンテナ環境では dbus 関連のエラーが出るが、拡張機能の動作には影響しない。
- 各AIサービスのDOMセレクタはUI変更で壊れる可能性がある。Options ページで調整可能。
- Obsidian Local REST API の API キーは拡張機能の Options ページで設定する。
- AIサービスにログインしていない場合、回答は「(取得できませんでした)」となるが、Obsidian への保存フロー自体は正常に動作する。
