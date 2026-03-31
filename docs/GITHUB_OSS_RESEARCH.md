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

## 4. OpenRouter free モデル選定ロジック調査（Issue #25）

### 調査対象

- `steipete/summarize`

### 参考にすべき主なファイル

- `src/refresh-free.ts`
  - OpenRouter `/models` 取得
  - `:free` フィルタ
  - 古いモデル・小さいモデルの除外
  - 実疎通テスト（1回目）＋選抜候補の追加計測（2回目以降）
  - `smart`（性能寄り）と `fast`（速度寄り）を混ぜた候補選定
  - 失敗分類（rate limit / no providers / timeout / provider error など）
- `src/model-auto.ts`
  - native model id から OpenRouter model id へのフォールバック解決
  - slug 正規化、曖昧一致時の安全側スキップ
- `src/run/openrouter.ts`
  - `No allowed providers` 時にモデル別 endpoint 情報から provider ヒントを組み立て
- `tests/refresh-free.test.ts`
  - 選定・除外・失敗分類・リトライ挙動を網羅
- `tests/model-auto.test.ts`
  - OpenRouter fallback の追加条件、曖昧時スキップ、id 正規化を検証

### MirrorChat に流用できる要素

- モデル候補列挙
  - OpenRouter `/models` から `:free` のみ抽出する考え方
- サイズ/新しさによる除外
  - `minParamB`、`maxAgeDays` を使った足切り
- 疎通テスト
  - 単語1つ返答の軽量プロンプトで動作確認する方式
- smart / fast のバランス選定
  - 文脈長・出力長・成功率・レイテンシを併用して候補を並び替える方針
- 失敗分類
  - `rateLimitMin` / `rateLimitDay` / `noProviders` / `timeout` / `providerError` / `other`
  - min rate limit 時の短いクールダウン + 1回再試行

### MirrorChat では簡略化すべき要素

- `~/.summarize/config.json` の読み書き
  - MirrorChat には不要。Chrome storage 側の設定として持つ
- CLI/daemon 前提ロジック
  - コマンド引数・TTY 表示・CLI fallback は不要
- provider 解決の複雑な分岐
  - まずは OpenRouter free digest 用の最小経路だけ実装する

### MirrorChat 向けの具体導入案

1. Phase 1（最小実装）
   - 固定の free 候補配列を持つ
   - 失敗時は次候補へフォールバック
   - 失敗分類は `rateLimit` / `noProviders` / `timeout` / `other` の4分類に縮約

2. Phase 2（軽量 refresh）
   - 手動実行 or 日次で `/models` を再取得
   - `:free` + `maxAgeDays` + `minParamB` を適用して候補更新
   - 更新結果は Chrome storage へ保存

3. Phase 3（必要なら）
   - 候補に対して軽量疎通テストを実施
   - 成功率/レイテンシで smart/fast 混在の上位 N 件を選ぶ

### 結論

- 判定: **「部分移植する（設計を借りて最小実装に落とす）」が妥当**
- 理由:
  - 実装コードとテストが揃っており、再利用判断の根拠が明確
  - free モデル運用で重要な失敗分類と再試行方針が現実的
  - ただし summarize の CLI/設定ファイル運用は MirrorChat に対して過剰

### Issue #24 への引き継ぎメモ

- まずは fixed 候補 + フォールバックで digest 非同期生成を成立させる
- 安定後に refresh 機能を追加する二段階戦略が、実装コストと運用安定性のバランスが良い

