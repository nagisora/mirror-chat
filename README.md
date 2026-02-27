# AI一括質問＆Obsidian保存ツール

Chrome拡張機能からプロンプトを入力し、4つのAIサービス（ChatGPT, Claude, Gemini, Grok）に順次自動送信して回答を取得し、Obsidian Local REST API経由でMarkdownファイルとして保存するツールです。

## 機能

- **一括質問**: 1つのプロンプトを4つのAIに順次送信（Bot対策のため同時送信ではなく順次送信）
- **Obsidian連携**: 回答をMarkdownファイルとして自動保存
- **フォルダ構成**: `AI-Research/YYYY-MM-DD_質問の先頭20文字/` に各AIの回答とSummaryを保存
- **エラーハンドリング**: Obsidian未起動時はローカルに一時保存し、後から再送信可能
- **デスクトップ通知**: 完了時・エラー時に通知

## セットアップ

### 1. Obsidian Local REST API の準備

1. Obsidianで「Local REST API」プラグインをインストール・有効化
2. プラグイン設定でAPIキー（Bearer トークン）とポート番号を確認
3. デフォルトポート: 27124（HTTP）

### 2. Chrome拡張のインストール

1. このリポジトリをクローン
2. Chromeで `chrome://extensions/` を開く
3. 「デベロッパーモード」を有効化
4. 「パッケージ化されていない拡張機能を読み込む」で `ai-prompt-broadcaster` フォルダを選択

### 3. 設定

1. 拡張アイコンをクリック → 「設定」を開く
2. Obsidianのポート番号、APIキー、保存先ベースパスを入力
3. （オプション）AIサービスのUI変更で動作しなくなった場合、DOMセレクタを調整

## 使い方

1. ChatGPT, Claude, Gemini, Grok のいずれかにログイン済みであること
2. 拡張アイコンをクリック
3. 質問を入力して「送信して保存」をクリック
4. 4つのAIタブが順次開き、回答が収集される
5. 完了時にObsidianに保存され、通知が表示される

## 保存されるファイル

```
AI-Research/
└── YYYY-MM-DD_質問の先頭20文字/
    ├── question.md    # 元の質問
    ├── ChatGPT.md
    ├── Claude.md
    ├── Gemini.md
    ├── Grok.md
    └── Summary.md    # 全回答をまとめたファイル
```

## トラブルシューティング

- **Obsidianに保存できない**: 設定画面でポート・APIキーを確認。Obsidianが起動しているか確認。
- **AIの入力欄が見つからない**: 設定画面の「セレクタをデフォルトに戻す」を試す。UIが変更されている場合はセレクタを手動調整。
- **保存に失敗したデータ**: 設定画面の「保存に失敗したデータ」から再送信可能。

## 技術構成

- Manifest V3
- Content Scripts: 各AIサイト用のDOM操作
- Background Service Worker: キュー処理、Obsidian API連携、通知

## ライセンス

MIT
