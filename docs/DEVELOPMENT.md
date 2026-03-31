# 開発環境ガイド

開発・テストに必要な環境構築手順です。

## ローカル開発

### 前提

- **ビルドステップ不要**: Vanilla JavaScript (ES2020+)、ソースをそのまま Chrome に読み込む
- **ソースコード**: `ai-prompt-broadcaster/` ディレクトリ
- **ルート package.json**: 開発用（ESLint）のみ

### Chrome 拡張の読み込み

1. Chrome で `chrome://extensions/` を開く
2. デベロッパーモードを ON にする
3. 「パッケージ化されていない拡張機能を読み込む」から `ai-prompt-broadcaster/` を選択
4. コード変更後は拡張機能ページのリロードボタンで再読み込み

### テスト・リント

```bash
# 静的解析（リポジトリルート）
pnpm lint

# E2E テスト
cd e2e && pnpm test
```

E2E の詳細は [e2e/README.md](../e2e/README.md) を参照。

## digest フロー

- 質問ファイルは先に `質問` / `まとめ` / `各AI回答` を含む形で保存する
- `まとめ` の初期値は digest 有効時 `生成中...`、無効時 `未生成`
- 保存成功後、background が OpenRouter を使って digest を非同期生成する
- digest 生成は raw 回答保存の成否に影響させない
- free モデル候補の選定とフォールバックは [ai-prompt-broadcaster/openRouterFreeModels.js](../ai-prompt-broadcaster/openRouterFreeModels.js) に分離している
- OpenRouter `/models` を使った free 候補の手動 refresh も [ai-prompt-broadcaster/openRouterFreeModels.js](../ai-prompt-broadcaster/openRouterFreeModels.js) に集約している
- OpenRouter API 呼び出しは [ai-prompt-broadcaster/openRouterClient.js](../ai-prompt-broadcaster/openRouterClient.js)、digest プロンプトと調停は [ai-prompt-broadcaster/digestService.js](../ai-prompt-broadcaster/digestService.js) が担う

---

## Cloud Agent 環境

### Chrome ヘッドレス起動

拡張機能付きで Chrome を起動するコマンド:

```bash
google-chrome --no-sandbox --disable-gpu --load-extension=/workspace/ai-prompt-broadcaster --no-first-run --disable-default-apps --start-maximized &
```

パスは環境に合わせて変更してください。

### Obsidian セットアップ（E2E テスト用）

Cloud Agent 環境でも Obsidian をインストールして E2E テストが可能です。

```bash
cd /tmp
curl -L -o Obsidian.AppImage "https://github.com/obsidianmd/obsidian-releases/releases/download/v1.8.9/Obsidian-1.8.9.AppImage"
chmod +x Obsidian.AppImage && ./Obsidian.AppImage --appimage-extract

mkdir -p /home/ubuntu/ObsidianVault
/tmp/squashfs-root/obsidian --no-sandbox --disable-gpu &
```

起動後、GUI で Vault を `/home/ubuntu/ObsidianVault` に設定し、Community Plugins から「Local REST API」をインストール・有効化する。HTTP デフォルトポートは 27123、HTTPS は 27124。拡張機能の Options で `http://127.0.0.1:27123/` を指定する。

### E2E フルテスト（ログイン済みプロファイル）

ログイン済み Chrome プロファイルを使う手順は [E2E_LOGIN_PROFILE.md](E2E_LOGIN_PROFILE.md) を参照。プロファイルを `e2e/chrome-profile.zip` に配置後:

```bash
cd e2e && pnpm test:with-profile:headed
```
