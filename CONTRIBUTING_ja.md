# コントリビューションガイドライン

[English](CONTRIBUTING.md) | [日本語](CONTRIBUTING_ja.md)

MirrorChat へのコントリビューションに興味を持っていただきありがとうございます。

## 開発環境のセットアップ

1. リポジトリをクローンします。
2. Chrome で `chrome://extensions/` を開き、デベロッパーモードを ON にして `ai-prompt-broadcaster` フォルダを読み込みます。
3. コード変更後は拡張機能ページのリロードボタンで反映します。

## コントリビューションの流れ

1. 既存 Issue を確認するか、新規 Issue を作成します。
2. `feature/xxx` または `fix/xxx` のようなブランチを作成します。
3. 変更を加えてコミットします。
4. Pull Request を作成します。

## コーディング規約

- 言語: Vanilla JavaScript (ES2020+)、ビルド工程なし
- `content-utils.js`: 同一タブへ複数回 inject されるため、トップレベル定数は `var` と既存値チェックで宣言します
- このリポジトリのコミットメッセージは日本語です

## テスト

```bash
cd e2e && pnpm test
```

ログイン済み Chrome プロファイルを使うと、送信から回答取得までフルフローで確認できます。

## 翻訳運用

[docs/TRANSLATIONS_ja.md](docs/TRANSLATIONS_ja.md) に EN/JA ドキュメント運用方針をまとめています。

## 質問・相談

判断に迷う場合は Issue を作成してください。