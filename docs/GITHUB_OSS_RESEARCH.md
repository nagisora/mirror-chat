# Plan実現のためのGitHubオープンソース調査結果

本ドキュメントは、[Chrome拡張 AI一括質問＆Obsidian保存ツール](./.cursor/plans/chrome拡張_ai一括質問＆obsidian保存ツール_53e178a3.plan.md) の実現に活用できるGitHubオープンソースリポジトリの調査結果です。

> **背景**: Chrome拡張として市販品はあるがマルウェア混入のリスクがあるため、自作する方針。既存のオープンソースを流用したい。

---

## 1. 複数AIサービス対応・一括質問系

### 1.1 OrenGrinker/chromeGenAIChatExtension
- **URL**: https://github.com/OrenGrinker/chromeGenAIChatExtension
- **概要**: 複数AIプロバイダー対応のChrome拡張（TypeScript + React）
- **対応AI**: OpenAI (GPT-4o, GPT-4o-mini), Claude (3 Opus, 3 Sonnet), Gemini (1.5 Pro, 1.5 Flash)
- **特徴**:
  - ウェブページコンテンツをコンテキストにしたAIチャット
  - チャット履歴、クイックレスポンス
  - APIキーをChromeに安全保存
  - リモートデータ保存なし・プライバシー重視
- **技術**: TypeScript 94.4%, React, Manifest V3
- **流用ポイント**: 複数AIプロバイダー統合のUI・設定管理の参考

### 1.2 drewster99/aibattleground
- **URL**: https://github.com/drewster99/aibattleground
- **概要**: 1プロンプトを40+のLLMに同時送信して回答を比較する「Head-to-Head Model Combat」ツール
- **対応AI**: OpenAI, Anthropic Claude, Google Gemini, Deepseek（OpenAI/Anthropic API経由でカスタム追加可）
- **ライセンス**: MIT
- **注意**: Chrome拡張ではなく、API経由のアプリケーションの可能性あり。アーキテクチャの参考に。

### 1.3 fatalvirus76/chrome_extention_multi_llm_ai_chat
- **URL**: https://github.com/fatalvirus76/chrome_extention_multi_llm_ai_chat
- **概要**: 複数LLMをブラウザに統合するChrome拡張
- **特徴**: 画像生成、スクリーンショット分析、テキスト抽出、ピン留めサイドバー、テーマカスタマイズ
- **流用ポイント**: 複数LLM統合のChrome拡張アーキテクチャ参考

### 1.4 Ruijian-Zha/gpt-browser-api
- **URL**: https://github.com/Ruijian-Zha/gpt-browser-api
- **概要**: zsodur/chatgpt-api-by-browser-script のフォーク。**Gemini, Claude, Perplexity にも対応**
- **特徴**: ブラウザ経由で複数LLMのAPIインターフェースを提供
- **流用ポイント**: 複数AIサービスのDOM操作・入力・応答抽出の実装参考

---

## 2. ChatGPT / Claude のDOM操作・自動化・応答抽出

### 2.1 HRussellZFAC023/ChatGptAutomator
- **URL**: https://github.com/HRussellZFAC023/ChatGptAutomator
- **概要**: ChatGPTの自動操作を行う高度なユーザースクリプト
- **特徴**:
  - マルチステップチェーン（Prompt → JS → HTTP → Prompt）
  - バッチモード、動的テンプレート（`{item}`, `{index}`, `{steps.id.response}`）
  - 応答完了後のJavaScriptサンドボックス実行
  - CORS対応HTTPヘルパー
  - **MutationObserver による応答完了検知**
  - Firefoxアドオン / Tampermonkey 対応
- **ライセンス**: MIT
- **流用ポイント**: **DOM操作、応答完了検知（MutationObserver）、送信ボタンクリックの実装が最も参考になる**

### 2.2 zsodur/chatgpt-api-by-browser-script
- **URL**: https://github.com/zsodur/chatgpt-api-by-browser-script
- **概要**: ChatGPTのWeb UIをAPI化するTampermonkeyスクリプト（238 stars）
- **特徴**: ローカルNode.jsサーバー経由で `http://localhost:8766/v1/chat/completions` として利用可能
- **流用ポイント**: ChatGPTのDOM構造解析、入力・送信・応答取得のロジック

### 2.3 agoramachina/claude-exporter
- **URL**: https://github.com/agoramachina/claude-exporter
- **概要**: Claude.aiの会話をエクスポートするChrome/Firefox拡張
- **特徴**:
  - JSON, Markdown, Plain Text エクスポート
  - 一括エクスポート（ZIP）
  - 会話ブラウジング・検索
  - ブランチ対応、アーティファクト抽出
- **DOM抽出**: `.font-claude-message`, `.font-user-message` 等で会話を取得
- **流用ポイント**: **ClaudeのDOMセレクタ、Markdown変換ロジック**

### 2.4 Trifall/chat-export
- **URL**: https://github.com/Trifall/chat-export
- **概要**: ChatGPT・Claude・Google AI Studio の会話をエクスポートするブラウザ拡張
- **形式**: Markdown, XML, JSON, HTML
- **特徴**: オープンソース、データはローカルのみ（リモート送信なし）
- **流用ポイント**: **複数AIサービス（ChatGPT, Claude）のDOM解析・エクスポート実装を一括で参考にできる**

### 2.5 legoktm/claude-to-markdown
- **URL**: https://github.com/legoktm/claude-to-markdown
- **概要**: Claude会話をMarkdownにエクスポートするWebExtension
- **流用ポイント**: ClaudeのMarkdown変換の別実装

### 2.6 TakashiSasaki の Gist（ChatGPT Auto Prompt Sender）
- **URL**: https://gist.github.com/TakashiSasaki/730f930806ec1a6460ab350f7498d622/
- **概要**: DOM監視で応答完了を検知し、事前入力したプロンプトを自動送信
- **流用ポイント**: **MutationObserver による応答完了検知の実装**（プランの「回答完了検知」に直結）

---

## 3. Obsidian連携

### 3.1 coddingtonbear/obsidian-local-rest-api
- **URL**: https://github.com/coddingtonbear/obsidian-local-rest-api
- **概要**: Obsidian用プラグイン。REST APIでノートを操作可能にする（900+ stars）
- **ライセンス**: MIT
- **APIドキュメント**: https://coddingtonbear.github.io/obsidian-local-rest-api/
- **流用ポイント**: **PlanのStep 1で使用するObsidian APIそのもの。ファイル作成のPOSTエンドポイント仕様を確認**

---

## 4. その他参考リポジトリ

### 4.1 RePRo (pavank-code/RePRo)
- **URL**: https://github.com/pavank-code/RePRo
- **概要**: ChatGPT, Claude, Gemini, Midjourney等のプロンプト最適化拡張（「AI用のGrammarly」）
- **ライセンス**: MIT
- **流用ポイント**: 複数AI対応のChrome拡張構造

### 4.2 durapensa/claude-chrome-mcp
- **URL**: https://github.com/durapensa/claude-chrome-mcp
- **概要**: Claude Desktop等のMCPホストがclaude.aiとChrome拡張経由で連携
- **特徴**: WebSocketリレー、**非同期メッセージ送信と完了検知**
- **流用ポイント**: 完了検知の実装パターン

---

## 5. 流用優先度マトリクス

| リポジトリ | 複数AI | DOM操作 | 応答抽出 | Obsidian | 優先度 |
|-----------|--------|---------|----------|----------|--------|
| **Trifall/chat-export** | ○ | ○ | ○ | × | **高** - ChatGPT/ClaudeのDOM解析を一括参考 |
| **HRussellZFAC023/ChatGptAutomator** | △ | ◎ | ◎ | × | **高** - 応答完了検知・DOM操作の実装が豊富 |
| **agoramachina/claude-exporter** | △ | ○ | ◎ | × | **高** - Claudeのセレクタ・Markdown変換 |
| **OrenGrinker/chromeGenAIChatExtension** | ◎ | △ | △ | × | **中** - 複数AI統合のUI・設定 |
| **coddingtonbear/obsidian-local-rest-api** | - | - | - | ◎ | **必須** - Obsidian API仕様 |
| **drewster99/aibattleground** | ◎ | × | ○ | × | **中** - 設計思想・比較UIの参考 |
| **Ruijian-Zha/gpt-browser-api** | ◎ | ○ | ○ | × | **中** - 複数LLMのブラウザ操作 |

---

## 6. 推奨アプローチ

1. **DOM操作・応答抽出**: `Trifall/chat-export` と `HRussellZFAC023/ChatGptAutomator` を中心に、各AIサイトのセレクタとMutationObserverの実装を流用
2. **Claude特化**: `agoramachina/claude-exporter` の `.font-claude-message` 等のセレクタを参考にし、optionsで設定可能にする設計と整合
3. **Obsidian API**: `coddingtonbear/obsidian-local-rest-api` の公式ドキュメントでファイル作成エンドポイントを確認
4. **複数AI統合UI**: `OrenGrinker/chromeGenAIChatExtension` のReact/TypeScript構成を参考（必要に応じて）

---

## 7. 注意事項

- **DOMセレクタの変動**: 各AIサービスのUI変更でセレクタが壊れるリスクあり。Planの「optionsでセレクタを設定可能にする」方針を維持すること
- **Bot対策**: Plan通り、同時送信ではなく**順次（キュー）送信**を維持
- **Grok**: 調査時点でGrok専用のオープンソースcontent scriptは見つかっていない。ChatGPT/Claudeのパターンを参考に新規実装が必要な可能性が高い

---

*調査日: 2025年2月27日*
