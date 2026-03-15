# MirrorChat

**1つのプロンプトを4つのAIサービスに順次送信し、ObsidianにMarkdownとして保存する** Chrome拡張機能です。

ChatGPT、Claude、Gemini、Grok の4つのAIチャットに同じ質問を一括送信し、回答を Obsidian の Vault に自動保存します。AIの回答を比較・検証したい方、Obsidianでナレッジ管理したい方に最適です。

![Chrome Extension Manifest V3](https://img.shields.io/badge/Chrome-Extension%20Manifest%20V3-4285F4?logo=googlechrome)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

## 機能

- **一括送信**: 1つの質問を ChatGPT / Claude / Gemini / Grok に順次送信
- **Obsidian連携**: Local REST API 経由で回答を Markdown として保存
- **2段階フロー**: 「サイトを開く」→「送信」で、ログイン後に確実に送信
- **DOMセレクタ調整**: Options 画面で各AIのセレクタをカスタマイズ可能（UI変更対応）

## 前提条件

- **Chrome** ブラウザ
- **Obsidian** + [Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) プラグイン
- 各AIサービス（ChatGPT, Claude, Gemini, Grok）への**ログイン済みアカウント**

## インストール

1. リポジトリをクローンまたはダウンロードする
2. Chrome で `chrome://extensions/` を開く
3. 「デベロッパーモード」を有効にする
4. 「パッケージ化されていない拡張機能を読み込む」をクリック
5. `ai-prompt-broadcaster` フォルダを選択する

## 使い方

### 1. Obsidian の準備

1. Obsidian に **Local REST API** プラグインをインストール・有効化
2. プラグイン設定で API トークンとポート番号を確認（HTTP デフォルト: 27123、HTTPS: 27124）

### 2. 拡張の設定

1. 拡張アイコン右クリック → 「オプション」
2. **Obsidian Local REST API ベースURL**: `http://127.0.0.1:27123/`（ポートが異なる場合は変更）
3. **API トークン**: Obsidian で設定したトークンを入力（空欄可）
4. **保存ルートパス**: 例 `200-AI Research`

### 3. 利用手順

1. 拡張アイコンをクリック
2. 「サイトを開く」で4つのAIサイトのタブを開く
3. 各サービスにログイン（未ログインの場合）
4. 質問を入力して「送信」をクリック
5. 完了するとデスクトップ通知が表示され、Obsidian に保存される

### 保存先フォルダ構成

```
保存ルートパス/
└── YYYYMMDD-01-質問の先頭20文字/
    └── note.md    # 質問＋全AI回答を1ファイルにまとめたノート
```

## プロジェクト構成

```
mirror-chat/
├── ai-prompt-broadcaster/   # Chrome拡張のソース（ここを読み込む）
│   ├── manifest.json
│   ├── popup.js, popup.html
│   ├── background.js
│   ├── content-*.js        # 各AI用のContent Script
│   └── ...
├── e2e/                    # Playwright E2Eテスト
├── docs/                   # ドキュメント
└── README.md
```

## ドキュメント

- [利用手順（詳細）](docs/CHROME_EXTENSION_USAGE.md)
- [開発者向け](AGENTS.md)

## 開発

- **ビルド不要**: ソースをそのまま Chrome に読み込んで使用
- **E2Eテスト**: `cd e2e && pnpm test`

## 既知の制限

- 各AIサービスのUI（DOM構造）は頻繁に変更されます。動かなくなった場合は Options 画面でセレクタを調整してください
- Obsidian が起動していない、または Local REST API が無効な場合は保存に失敗します。失敗したデータは「再送信」で後から再試行できます

## ライセンス

[MIT License](LICENSE)

## コントリビューション

[CONTRIBUTING.md](CONTRIBUTING.md) をご覧ください。
