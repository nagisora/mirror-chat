## Chrome拡張「AI一括質問＆Obsidian保存ツール」OSSリサーチ概要

このドキュメントは、Chrome拡張「AI一括質問＆Obsidian保存ツール」の実装にあたり、
既存のオープンソースから参考になりそうなプロジェクトを整理したメモです。

主に以下の 3 つの観点で OSS を調査しました。

- 複数 AI への一括送信・キュー処理
- AI チャット回答の Markdown 取得
- Obsidian Local REST API 連携

詳細な検討内容は GitHub 上の Pull Request 解説を参照してください。

### 1. 複数 AI への一括送信・キュー処理

- **pykrete67/prompt-queue-extension**
  - 複数タブをキューに積み、常に 1 つだけを順次処理するアーキテクチャ。
  - Background で「ジョブキュー」を管理し、Content Script とメッセージで連携する設計が参考になる。
  - 本プロジェクトの `background.js` におけるタブキュー処理の設計インスピレーションとして採用。

- **Far-Se/Multiple-Chatbots**
  - 単一 UI から複数チャットボットにクエリを送る拡張。
  - 各サービスごとに Content Script を分離しつつ、Background から一元制御する構造が近い。

- **caiyongji/ChatMultiAI**
  - TypeScript ベースで複数 AI を扱う拡張。
  - 将来的な型定義や設定スキーマ設計の参考になる。

### 2. AI チャット回答の Markdown 取得

- **repmax/ai-chat-downloader**
  - ChatGPT / Claude / Grok など複数サービス対応のチャットログダウンローダ。
  - 各サービスごとの DOM 構造を解析し、Markdown 形式に変換するロジックが有用。
  - 本プロジェクトでは「DOM 構造の把握」と「Markdown 変換の考え方」を中心に参考にする。

- **suredream/chat-exporter-ext**
  - ChatGPT などの会話を Markdown / HTML でエクスポート。
  - シンプルな CSS セレクタと DOM 走査のみで実現しており、軽量な実装例として参考。

- **legoktm/claude-to-markdown**
  - Claude のチャットログを Markdown に変換する小さなツール。
  - Claude 特有のメッセージ要素のセレクタや、コードブロックの扱いが参考になる。

### 3. Obsidian Local REST API 連携

- **coddingtonbear/obsidian-local-rest-api**
  - Obsidian を HTTP 経由で操作するコミュニティプラグイン。
  - Vault 内のファイル作成・更新を行うエンドポイント仕様が、本プロジェクトの連携実装の前提となる。

本リポジトリでは、これら OSS をそのままフォークしてベースにするのではなく、
**設計とノウハウのみを取り込みつつ、自前のシンプルな実装を行う** 方針とします。

