# セキュリティ対策ドキュメント

## 実装済みのセキュリティ対策

### 1. ファイルアップロードのセキュリティ

#### ✅ ファイルサイズ制限
- **制限値**: 最大5GB
- **実装場所**: クライアント側（app.js）+ サーバー側（httpTrigger1.js）
- **効果**: DoS攻撃の防止、ストレージコストの制御

#### ✅ ファイル名のサニタイゼーション
- **対策内容**:
  - パストラバーサル攻撃の防止（`../`、`..\\`など）
  - 特殊文字の除去（`/\:*?"<>|`）
  - ファイル名の長さ制限（255文字）
  - 隠しファイルの防止（`.`で始まるファイル名を拒否）
- **実装場所**: サーバー側（httpTrigger1.js - sanitizeFilename関数）

#### ✅ 禁止ファイルタイプ
- **拒否する拡張子**: `.exe`, `.bat`, `.cmd`, `.com`, `.scr`, `.vbs`, `.js`, `.jar`, `.msi`
- **理由**: マルウェアのホスティング防止
- **実装場所**: サーバー側（httpTrigger1.js）

#### ✅ 有効期限の検証
- **制限値**: 1〜30日
- **実装場所**: サーバー側（httpTrigger1.js）
- **効果**: 無期限のストレージ使用を防止

### 2. API セキュリティ

#### ✅ SAS Token による認証
- **アップロード用トークン**: 書き込み権限のみ、1時間有効
- **ダウンロード用トークン**: 読み取り権限のみ、ユーザー指定期間有効
- **効果**: ストレージアカウントキーを公開せずにアクセス制御

#### ✅ HTTPセキュリティヘッダー
```http
X-Content-Type-Options: nosniff  # MIMEタイプスニッフィング防止
X-Frame-Options: DENY             # クリックジャッキング防止
X-RateLimit-Limit: 100            # レート制限情報（表示用）
```

### 3. Azure Storage セキュリティ

#### ⚠️ パブリックアクセスの設定
- **現在の設定**: Blob レベルでのパブリックアクセス（読み取りのみ）
- **リスク**: SAS Token付きURLがあれば誰でもダウンロード可能
- **推奨**: これは仕様通り（ファイル共有サービスのため）

#### ✅ HTTPS 必須
- Azure Storage は HTTPS 通信を強制
- 中間者攻撃（MITM）の防止

## 残存リスクと追加推奨事項

### 🟡 中程度のリスク

#### 1. CORS設定が緩い
**現在**: `allowedOrigins: ["*"]`  
**リスク**: 任意のWebサイトからAPIを呼び出し可能  
**推奨対策**:
```json
{
  "cors": {
    "allowedOrigins": [
      "https://nice-bush-0a1714700.3.azurestaticapps.net",
      "https://yourdomain.com"
    ],
    "supportCredentials": false
  }
}
```

#### 2. レート制限の未実装
**現在**: APIコールが無制限  
**リスク**: コスト爆発、DoS攻撃  
**推奨対策**: Azure API Management または Azure Front Door でレート制限を実装
```javascript
// Azure API Management ポリシー例
<rate-limit calls="100" renewal-period="60" />
```

#### 3. 認証の欠如
**現在**: `authLevel: 'anonymous'`  
**リスク**: 誰でもアップロード可能  
**推奨対策**:
- Azure AD B2C による認証
- API Key による認証
- reCAPTCHA による Bot 防止

### 🟢 低リスク（受容可能）

#### 1. ストレージの暗号化
- **現在**: Azure Storage のデフォルト暗号化（AES-256）が有効
- **追加対策**: Customer-Managed Keys (CMK) の使用も可能

#### 2. ログとモニタリング
- **推奨**: Application Insights によるログ監視
- **推奨**: Azure Security Center による脅威検出

## セキュリティチェックリスト

### 実装済み ✅
- [x] ファイルサイズ制限（5GB）
- [x] ファイル名のサニタイゼーション
- [x] 禁止ファイルタイプの拒否
- [x] 有効期限の検証（1-30日）
- [x] SAS Token による認証
- [x] HTTPS 通信の強制
- [x] セキュリティヘッダーの追加

### 推奨事項 ⚠️
- [ ] CORS の厳格化（本番環境のドメイン限定）
- [ ] レート制限の実装
- [ ] 認証機能の追加（Azure AD B2C）
- [ ] Application Insights の有効化
- [ ] Azure Security Center の有効化
- [ ] Bot 防止（reCAPTCHA）

## Azure Portal での追加設定

### 1. CORS の厳格化

**Azure Portal → Static Web Apps → 設定 → CORS**
```
許可されるオリジン: https://nice-bush-0a1714700.3.azurestaticapps.net
```

**Azure Portal → ストレージアカウント → CORS**
```
許可されるオリジン: https://nice-bush-0a1714700.3.azurestaticapps.net
許可されるメソッド: GET, PUT, POST, DELETE, HEAD, OPTIONS
```

### 2. Application Insights の有効化

**Azure Portal → Static Web Apps → 設定 → Application Insights**
- リソースを作成または選択
- ログとメトリクスの監視を開始

### 3. ストレージアカウントのセキュリティ

**Azure Portal → ストレージアカウント → セキュリティとネットワーク**
- [x] 安全な転送が必須 (HTTPS のみ)
- [x] 最小 TLS バージョン: 1.2
- [ ] ファイアウォール: 特定IPのみ許可（オプション）

## インシデント対応

### 不正アップロードの検出
1. Application Insights でログを確認
2. 疑わしいblobNameを特定
3. Azure Portal でBlob削除

### SAS Token の漏洩
- **影響範囲**: 特定のBlobへのアクセスのみ（1時間〜30日有効）
- **対応**: 該当Blobの削除、新しいトークンの発行
- **予防**: トークンの有効期限を短く設定

### ストレージアカウントキーの漏洩
- **影響範囲**: 全ストレージアカウントへのフルアクセス
- **対応**: 
  1. Azure Portal でキーを即座に再生成
  2. 環境変数を更新
  3. アプリケーションを再デプロイ
- **予防**: キーを Git にコミットしない（.gitignore で除外済み）

## 監査ログ

実装日: 2025年12月3日  
最終更新: 2025年12月3日  
レビュー担当: AI Assistant  
次回レビュー予定: 2025年12月17日
