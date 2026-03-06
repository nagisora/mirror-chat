# オープンソース公開チェックリスト

本ドキュメントは MirrorChat をオープンソースとして公開する際の洗い出し結果と対応状況を記録します。

## 洗い出し結果

### ✅ 問題なし

| 項目 | 状態 | 備考 |
|------|------|------|
| 機密情報・APIキー | OK | APIトークンはユーザーがOptionsで設定。ハードコードなし |
| 認証情報 | OK | Obsidian APIトークンはChrome storageに保存（ローカル） |
| デフォルトURL | OK | `127.0.0.1:27123` はObsidian Local REST APIのデフォルト。ローカル開発用 |
| サードパーティ著作権 | OK | 参考にしたOSSは設計・ノウハウのみ採用。フォークではない |

### ⚠️ 対応が必要

| 項目 | 対応内容 |
|------|----------|
| LICENSE | MITライセンスファイルを追加 |
| README.md | ルートに包括的なREADMEを記載 |
| .gitignore | `.env` を追加（将来の環境変数漏洩防止） |

### 📋 推奨（GitHub OSSベストプラクティス）

| 項目 | 対応内容 |
|------|----------|
| CONTRIBUTING.md | コントリビューションガイドライン |
| SECURITY.md | セキュリティ脆弱性の報告方法 |
| .github/ | Issue/PRテンプレート、GitHub Actions（任意） |

## 対応済み

- [x] LICENSE (MIT) 追加
- [x] README.md 作成
- [x] .gitignore に .env 追加
- [x] CONTRIBUTING.md 追加
- [x] SECURITY.md 追加
