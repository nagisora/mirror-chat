# AGENTS.md

## プロジェクト概要

MirrorChat は Chrome 拡張機能（Manifest V3）で、1つのプロンプトを4つのAIサービス（ChatGPT, Claude, Gemini, Grok）に順次送信し、Obsidian Local REST API 経由で回答を Markdown として保存するツールです。

## アーキテクチャ（最小）

- **ソース**: `ai-prompt-broadcaster/` 内に全ファイル
- **言語**: Vanilla JavaScript (ES2020+)、ビルドシステムなし
- **依存**: 拡張機能ディレクトリにランタイム依存なし。ルート `package.json` は開発用（ESLint 等）のみ

## コマンド

```bash
pnpm check              # 構文チェック + ESLint
pnpm lint               # ESLint のみ
cd e2e && pnpm test     # E2E テスト
```

## ドキュメント索引（必要なタイミングで参照）

| タスク | 参照先 |
|--------|--------|
| 開発環境構築・Chrome 読み込み・Cloud Agent 用起動 | [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) |
| エンドユーザー向け利用手順 | [docs/CHROME_EXTENSION_USAGE.md](docs/CHROME_EXTENSION_USAGE.md) |
| E2E フルテスト（ログイン済みプロファイル） | [docs/E2E_LOGIN_PROFILE.md](docs/E2E_LOGIN_PROFILE.md) |

## 動作概要

「サイトを開く」→「送信」の2段階: ポップアップで4タブを開き、質問入力後に送信。タブは送信後も維持される。

## コード変更時の必須注意

- **content-utils.js の定数**: 同一タブに SEND_ONLY / FETCH_ONLY で複数回インジェクトされるため、`const` だと "Identifier has already been declared" になる。`var X = X || 初期値` で宣言すること。
- **basePath**: Obsidian ノートパスは先頭に `/` を含めない。`obsidianClient.createNote` は自動除去する。
- **DOM セレクタ**: 各AIサービスの UI 変更で壊れる可能性あり。Options ページで調整可能。
- **その他**: コンテナ環境の dbus エラーは無視してよい。未ログイン時は回答「(取得できませんでした)」だが保存フローは動作する。
