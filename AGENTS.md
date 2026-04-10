# Project Guidelines

## 概要

MirrorChat は Manifest V3 の Chrome 拡張です。1つのプロンプトを ChatGPT、Claude、Gemini、Grok に順次送信し、回答を Obsidian Local REST API 経由で Markdown 保存します。

## アーキテクチャ

- 拡張本体は ai-prompt-broadcaster/ 配下にあり、Vanilla JavaScript (ES2020+) をそのまま Chrome に読み込ませます。ビルド工程はありません。
- popup.js が UI の入口で、background.js がタブ管理、送信キュー、Obsidian 保存を担います。
- content-base.js と content-*.js は各 AI タブで入力・送信・回答取得を行います。共通 DOM 操作は content-utils.js に集約されています。
- 回答取得は offscreen.js 経由のクリップボード読み取りに依存します。送信と取得は同一タブへ複数回注入される前提で実装されています。
- 動作フローは「サイトを開く」→「送信」の2段階です。開いた AI タブは送信後も維持されます。

## ビルドとテスト

- pnpm lint
- cd e2e && pnpm test
- cd e2e && pnpm test:headed
- cd e2e && pnpm test:ui
- cd e2e && pnpm test:with-profile

Chrome での動作確認は ai-prompt-broadcaster/ を未ビルドのまま読み込みます。手順と Cloud Agent 用の起動方法は docs/DEVELOPMENT.md を参照してください。

## 参照先

- 開発環境構築、拡張の読み込み、開発フロー: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)
- エンドユーザー向け利用手順: [docs/CHROME_EXTENSION_USAGE.md](docs/CHROME_EXTENSION_USAGE.md)
- ログイン済み Chrome プロファイルを使う E2E: [docs/E2E_LOGIN_PROFILE.md](docs/E2E_LOGIN_PROFILE.md)
- 一般概要と導入手順: [README.md](README.md)
- 変更時の運用ルール: [CONTRIBUTING.md](CONTRIBUTING.md)

## プロジェクト固有の規約

- content-utils.js ではトップレベル定数を const や let で増やさないでください。同一タブに SEND_ONLY と FETCH_ONLY を複数回 inject するため、var X = X || 初期値 の形を使います。
- Obsidian に渡す basePath は先頭に / を付けません。obsidianClient.createNote 側が先頭スラッシュ除去を前提にしています。
- AI ごとの DOM セレクタは壊れやすく、修正対象は options.js の設定値と content-*.js の既定値です。セレクタ変更時は Options 画面での上書きも意識してください。
- 回答取得はフォーカスとクリップボード読み取りに依存します。FETCH_ONLY の並列化や tab フォーカス制御の変更は壊れやすいため、background.js の処理順を維持して変更してください。
- 未ログイン時や回答取得失敗時でも、保存フロー自体は継続して「(取得できませんでした)」を扱える設計です。例外で全体を止めないことを優先してください。
- コンテナ環境で Chrome 実行時に出る dbus エラーは既知ノイズで、通常は調査対象にしません。
- コミットメッセージは日本語です。
- 作業は細かく区切り、1度の変更ごとにコミットするようにしてください。
