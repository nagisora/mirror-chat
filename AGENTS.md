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

### テスト・リント

- 自動テストやリント設定は現在存在しない。手動テストのみ。
- 手動テストには Chrome ブラウザと、各AIサービスへのログイン、Obsidian + Local REST API プラグインが必要。
- 詳細な利用手順は `docs/CHROME_EXTENSION_USAGE.md` を参照。

### 注意事項

- コンテナ環境では dbus 関連のエラーが出るが、拡張機能の動作には影響しない。
- 各AIサービスのDOMセレクタはUI変更で壊れる可能性がある。Options ページで調整可能。
- Obsidian Local REST API（デフォルト: `http://127.0.0.1:27123`）はローカル環境でのみ動作する。Cloud Agent 環境では Obsidian への保存テストは不可。
