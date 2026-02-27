# Chrome拡張 AI一括質問＆Obsidian保存ツール：OSSリサーチ結果

## 調査日: 2026-02-27

## 概要

プランの実現に活用できるオープンソースプロジェクトを調査しました。プランの主要機能は以下の3つに分解できます：

1. **複数AIサービスへの一括プロンプト送信**（Content ScriptによるDOM操作）
2. **AIの回答テキストの抽出**（Markdown変換）
3. **Obsidian Local REST API経由でのファイル保存**

---

## 1. 複数AIへの一括送信（プロンプト注入＋DOM操作）

### ★★★ 最有力候補：pykrete67/prompt-queue-extension

- **URL**: https://github.com/pykrete67/prompt-queue-extension
- **ライセンス**: 未指定（要確認）
- **言語**: JavaScript
- **スター数**: 0
- **最終更新**: 2026-01-08
- **プランとの適合度**: ★★★★★（非常に高い）

**概要**:
ChatGPT, Claude, Gemini, AI Studio向けのContent Scriptを個別に持つChrome拡張。プロンプトのキュー処理と自動送信機能を実装済み。

**プランとの関連性**:
- **Content Script構成がプランとほぼ同一**: `chatgpt.js`, `claude.js`, `gemini.js`, `common.js`
- **共通ユーティリティ（`common.js`）**: `waitForElement`, `simulateInput`, `MutationObserver`ベースの生成完了監視（`startGenerationMonitor`）、リトライロジック等を共有
- **各AIサイトのDOMセレクタ**: ChatGPT（`#prompt-textarea`, ProseMirror）, Claude（ProseMirror + `fieldset`）, Gemini（Quill-like editor）の入力・送信・停止ボタンのセレクタを整備
- **生成完了検知**: Stop/Stopボタンの消失、streaming属性の変化、一定時間の無変更を監視
- **Service Worker**: キュー処理による順次送信、タブ管理

**流用可能な部分**:
- Content Script全体（ChatGPT, Claude, Gemini）のDOM操作ロジック
- 共通ユーティリティ（`common.js`）の全体
- Service Workerのキュー処理・メッセージングパターン

**不足している部分**:
- Grok対応のContent Scriptがない
- 回答テキストの抽出・Markdown変換機能がない
- Obsidian連携がない

---

### ★★ Far-Se/Multiple-Chatbots

- **URL**: https://github.com/Far-Se/Multiple-Chatbots
- **ライセンス**: MIT
- **言語**: JavaScript
- **スター数**: 0（Chrome Web Store 6ユーザー）
- **最終更新**: 2026-01-25

**概要**:
単一プロンプトを複数AIタブに同時送信するChrome拡張。Manifest V3準拠。

**プランとの関連性**:
- タブの一括オープン＋グルーピング機能
- Geminiへの`chrome.scripting.executeScript`によるDOM操作の実装例
- ただしContent Scriptは最小限（セレクタのハードコード）

**流用可能な部分**:
- タブ管理・グルーピングのパターン
- Gemini向けのDOM操作基本パターン

---

### ★★ caiyongji/ChatMultiAI

- **URL**: https://github.com/caiyongji/ChatMultiAI
- **ライセンス**: 未指定
- **言語**: TypeScript（95.7%）
- **スター数**: 4
- **最終更新**: 2026-02-20

**概要**:
TypeScriptベースのChrome拡張。サイドパネルUIから複数AI（ChatGPT, Gemini, Claude, Grok, DeepSeek）に同時送信。

**プランとの関連性**:
- TypeScript実装の参考例
- Grok, DeepSeekを含む幅広いAI対応

---

### 参考：ai-shifu/ChatALL（デスクトップアプリ）

- **URL**: https://github.com/ai-shifu/ChatALL
- **ライセンス**: Apache 2.0
- **言語**: JavaScript（Electron）
- **スター数**: 16,294
- **最終更新**: 2026-02-27

**概要**:
30以上のAIボットに同時プロンプト送信できるElectronデスクトップアプリ。Chrome拡張ではないが、各AIサービスとの通信パターン（Webアクセス＋API方式の両対応）が非常に参考になる。

---

## 2. AIチャット回答のMarkdownエクスポート

### ★★★ repmax/ai-chat-downloader

- **URL**: https://github.com/repmax/ai-chat-downloader
- **ライセンス**: 未指定（要確認）
- **言語**: JavaScript
- **スター数**: 2
- **最終更新**: 2025-09-07
- **プランとの適合度**: ★★★★☆（高い）

**概要**:
DevToolsパネルからAIチャット全体をMarkdownファイルとしてダウンロードする拡張。**DOMスクレイピングではなく、ネットワークレスポンスから直接抽出する方式**。

**対応サービス**:
ChatGPT, Claude, DeepSeek, Perplexity, Google AI Studio, You.com, Grok

**プランとの関連性**:
- **ChatGPT, Claude, Grokの回答をMarkdown変換するロジック**が実装済み
- `claude2Tree()`, `chatgpt2Tree()` 等のパーサーでチャット構造をツリーに変換
- Frontmatter（タイトル、日付、メタデータ）の自動生成
- プレビュー機能

**流用可能な部分**:
- 各AIサービスのレスポンスJSON → Markdown変換ロジック
- Frontmatter生成パターン

**不足している部分**:
- ネットワークレスポンス方式のため、Content Scriptでの回答取得とは異なるアプローチ
- Obsidian連携なし

---

### ★★ suredream/chat-exporter-ext

- **URL**: https://github.com/suredream/chat-exporter-ext
- **ライセンス**: 未指定
- **言語**: JavaScript
- **スター数**: 1
- **最終更新**: 2025-08-26

**概要**:
ChatGPT, Microsoft Copilot, Google Gemini, Google AI StudioのチャットをワンクリックでクリップボードまたはMarkdownファイルとしてエクスポート。

**流用可能な部分**:
- Markdown出力フォーマット
- キーボードショートカット（Shift+Cmd+L / Ctrl+Shift+L）

---

### ★ legoktm/claude-to-markdown

- **URL**: https://github.com/legoktm/claude-to-markdown
- **ライセンス**: Apache 2.0
- **言語**: JavaScript
- **スター数**: 10
- **最終更新**: 2026-01-04

**概要**:
ClaudeのチャットをMarkdownにエクスポートするWebExtension。**ClaudeのフロントエンドAPIレスポンスのJSONをインターセプトして変換する方式**。

**流用可能な部分**:
- Claudeの会話JSON → Markdown変換ロジック
- GitHub Gist連携の実装パターン

---

## 3. Obsidian Local REST API連携

### coddingtonbear/obsidian-local-rest-api

- **URL**: https://github.com/coddingtonbear/obsidian-local-rest-api
- **ライセンス**: ー（Obsidianプラグイン）
- **言語**: TypeScript
- **スター数**: 多数

**概要**:
Obsidianにローカルの REST APIを提供するプラグイン。プランが前提としているAPIそのもの。

**プランでの使用方法**:
- `POST /vault/{path}` でMarkdownファイルを作成
- Bearer Token認証
- Chrome拡張のBackground Worker から `fetch()` でHTTPリクエスト

---

## 推奨する実装戦略

### ベースとして使うべきOSS

| 機能領域 | 推奨OSS | 理由 |
|---|---|---|
| Content Script（DOM操作） | **pykrete67/prompt-queue-extension** | ChatGPT/Claude/Geminiの入力・送信・完了監視が実装済み。共通ユーティリティも充実 |
| 回答テキスト抽出（Markdown変換） | **repmax/ai-chat-downloader** | ChatGPT/Claude/Grokのレスポンス→Markdownパーサーが実装済み |
| タブ管理パターン | **Far-Se/Multiple-Chatbots** | MIT License、タブグルーピング実装がシンプルで参考になる |

### 自作が必要な部分

1. **Grok用Content Script**: `prompt-queue-extension`にはGrok対応がないため、`x.com/i/grok`のDOM構造を解析して新規作成が必要
2. **Obsidian Local REST API連携**: 既存OSSにこの機能を持つChrome拡張は存在しない。`fetch()` APIで実装
3. **回答テキストの抽出ロジック**: `prompt-queue-extension`は送信＋完了監視のみで、回答テキストの抽出は未実装。`ai-chat-downloader`のパーサーを参考に、Content Scriptからの回答DOM抽出を追加実装する必要がある
4. **ポップアップUI**: プロンプト入力画面は既存OSSを参考にしつつ新規作成
5. **オプション画面**: APIキー、保存先パス、DOMセレクタの設定UIは新規作成
6. **Summary.md生成**: 4つの回答をまとめたファイルの生成は新規作成

### 組み合わせのイメージ

```
prompt-queue-extension（ベース）
├── content-scripts/
│   ├── common.js           ← そのまま流用（ユーティリティ）
│   ├── chatgpt.js          ← 流用＋回答抽出を追加
│   ├── claude.js           ← 流用＋回答抽出を追加
│   ├── gemini.js           ← 流用＋回答抽出を追加
│   └── grok.js             ← 新規作成
├── background.js           ← 流用＋Obsidian API連携を追加
├── popup.html/js/css       ← 新規作成（プロンプト入力UI）
├── options.html/js/css     ← 新規作成（設定画面）
└── manifest.json           ← カスタマイズ

+ ai-chat-downloader のMarkdown変換ロジックを参考に回答抽出を実装
```

---

## 注意事項

1. **ライセンス確認**: `prompt-queue-extension`と`ai-chat-downloader`はライセンスが明示されていないため、利用前にライセンスを作者に確認するか、コードを参考にしつつ独自実装とすることを推奨
2. **DOMセレクタの脆弱性**: AIサービスのUI変更でセレクタが壊れるリスクがある。プランの通り、セレクタをオプション画面で設定可能にする設計が重要
3. **Bot対策**: 各AIサービスはBot対策を強化しており、自動操作が検知されるリスクがある。順次送信＋適切なディレイが必要
