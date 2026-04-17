# 開発環境ガイド

[English](DEVELOPMENT.md) | [日本語](DEVELOPMENT_ja.md)

MirrorChat のローカル開発とテスト環境のセットアップ手順です。

## ローカル開発

### 前提

- ビルド工程はありません。Vanilla JavaScript (ES2020+) をそのまま Chrome に読み込みます。
- ソースコードは `ai-prompt-broadcaster/` 配下です。
- ルートの `package.json` は主に ESLint などの開発ツール向けです。

### Chrome 拡張の読み込み

1. Chrome で `chrome://extensions/` を開きます。
2. デベロッパーモードを ON にします。
3. パッケージ化されていない拡張機能を読み込む から `ai-prompt-broadcaster/` を選択します。
4. コード変更後は拡張機能ページからリロードします。

### リントとテスト

```bash
pnpm lint
cd e2e && pnpm test
```

E2E の詳細は [e2e/README.md](../e2e/README.md) を参照してください。

## digest フロー

- 質問ファイルは、まず質問文、まとめ、各AI回答を含む形で保存されます。
- digest 有効時のまとめは待機状態から始まり、無効時は未生成の扱いです。
- raw 回答の保存成功後、background script が OpenRouter 経由で非同期に digest を生成します。
- digest 生成は raw 回答保存を止めたり巻き戻したりしてはいけません。
- free モデル候補の選定とフォールバック規則は [ai-prompt-broadcaster/openRouterFreeModels.js](../ai-prompt-broadcaster/openRouterFreeModels.js) に分離されています。
- OpenRouter `/models` を使う手動 refresh も同じファイルに集約されています。
- OpenRouter API 呼び出しは [ai-prompt-broadcaster/openRouterClient.js](../ai-prompt-broadcaster/openRouterClient.js)、プロンプト設計と出力検証は [ai-prompt-broadcaster/digestService.js](../ai-prompt-broadcaster/digestService.js) が担います。

## Cloud Agent 環境

### 拡張付きで Chrome をヘッドレス起動する

```bash
google-chrome --no-sandbox --disable-gpu --load-extension=/workspace/ai-prompt-broadcaster --no-first-run --disable-default-apps --start-maximized &
```

パスは環境に合わせて読み替えてください。

### E2E 用の Obsidian セットアップ

Cloud Agent 環境でも Obsidian をインストールして E2E を実行できます。

```bash
cd /tmp
curl -L -o Obsidian.AppImage "https://github.com/obsidianmd/obsidian-releases/releases/download/v1.8.9/Obsidian-1.8.9.AppImage"
chmod +x Obsidian.AppImage && ./Obsidian.AppImage --appimage-extract

mkdir -p /home/ubuntu/ObsidianVault
/tmp/squashfs-root/obsidian --no-sandbox --disable-gpu &
```

起動後、`/home/ubuntu/ObsidianVault` に Vault を作成または指定し、Community Plugins から Local REST API をインストールして有効化します。既定ポートは HTTP が 27123、HTTPS が 27124 です。拡張の Options では `http://127.0.0.1:27123/` を設定します。

### ログイン済みプロファイルでのフル E2E

ログイン済み Chrome プロファイルを使う手順は [E2E_LOGIN_PROFILE.md](E2E_LOGIN_PROFILE.md) を参照してください。プロファイルアーカイブを `e2e/chrome-profile.zip` に配置したら、以下を実行します。

```bash
cd e2e && pnpm test:with-profile:headed
```