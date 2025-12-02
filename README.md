# SecureFileShare - ファイル転送アプリケーション

## 概要

ギガファイル便のような、安全で簡単なファイル転送Webアプリケーションです。
Figmaデザインの紫グラデーションUIを採用し、Azure Static Web Apps、Azure Functions、Azure Storage Accountで構築されています。

---

## システムアーキテクチャと動作フロー

### 📱 画面操作と裏側の動き

#### **1. ファイル選択**

**画面操作:**
- ユーザーがファイルをドラッグ&ドロップ、または「ファイルを選択」ボタンをクリック
- 選択したファイルが一覧表示される（ファイル名、サイズ）
- 合計ファイル数と合計サイズが表示される

**裏側の動き:**
```
ブラウザ（app.js）
├─ FileReader APIでファイルを読み込み
├─ 各ファイルをJavaScriptのstateオブジェクトに保存
│  └─ { id, file, name, size }
├─ ファイルサイズ検証（最大5GB）
├─ ファイル数検証（最大100ファイル）
└─ DOMを動的更新してファイル一覧を表示
```

**関連コンポーネント:**
- **フロントエンド**: `app.js` の `addFiles()`, `renderFileList()`
- **使用技術**: HTML5 File API, JavaScript DOM操作

---

#### **2. アップロードオプションの設定**

**画面操作:**
- カスタムファイル名を入力（オプション）
- 保持期間を選択（1〜30日）
- 複数ファイルの場合、「ファイルをまとめる (ZIP)」をチェック

**裏側の動き:**
```
ブラウザ（app.js）
├─ フォーム入力値をJavaScript変数に保存
│  ├─ customFilename: カスタムファイル名
│  ├─ expirationDays: 保持期間（日数）
│  └─ bundleFiles: ZIP化フラグ
└─ 「アップロード開始」ボタンの有効化
```

**関連コンポーネント:**
- **フロントエンド**: `index.html` のフォーム要素, `app.js` のイベントリスナー

---

#### **3. ZIP化処理（複数ファイル選択時）**

**画面操作:**
- 「アップロード開始」ボタンをクリック
- 進捗バーに「ZIP作成中: XX%」と表示

**裏側の動き:**
```
ブラウザ（app.js）
├─ JSZipライブラリを使用してZIPファイル生成
│  ├─ new JSZip() でZIPインスタンス作成
│  ├─ 各ファイルを zip.file(name, data) で追加
│  └─ zip.generateAsync() で圧縮実行
│     └─ 圧縮レベル: DEFLATE, level 6
├─ 生成中の進捗をリアルタイム表示
│  └─ metadata.percent を取得してプログレスバー更新
└─ 完成したZIP Blobオブジェクトをメモリ上に保持
```

**関連コンポーネント:**
- **フロントエンド**: `app.js` の `createZipFile()`
- **ライブラリ**: JSZip 3.10.1（CDN経由）
- **使用技術**: Blob API, Promise, async/await

---

#### **4. SAS URL取得（Azure Functions）**

**画面操作:**
- 進捗バーが「0%」から進み始める

**裏側の動き:**
```
1. ブラウザ → Azure Static Web Apps (/api/generateUploadUrl)
   ├─ メソッド: POST
   ├─ リクエストBody:
   │  {
   │    filename: "example.zip",
   │    expirationDays: 7,
   │    contentType: "application/zip"
   │  }
   └─ CORS Preflight (OPTIONS) リクエスト先行

2. Azure Static Web Apps → Azure Functions (generateUploadUrl)
   ├─ Function Appで関数実行
   └─ Node.js 18 ランタイムで処理

3. Azure Functions 内部処理:
   ├─ 環境変数から取得:
   │  ├─ STORAGE_ACCOUNT_NAME
   │  ├─ STORAGE_ACCOUNT_KEY
   │  └─ STORAGE_CONTAINER_NAME
   │
   ├─ Azure Storage SDK (@azure/storage-blob) を使用
   │  ├─ StorageSharedKeyCredential で認証
   │  └─ BlobServiceClient でStorage Account接続
   │
   ├─ Blob名を生成: {timestamp}_{filename}
   │  例: 1764659273949_example.zip
   │
   ├─ アップロード用SAS Token生成:
   │  ├─ 権限: Write (w)
   │  ├─ 有効期限: 1時間
   │  └─ generateBlobSASQueryParameters()
   │
   └─ ダウンロード用SAS Token生成:
      ├─ 権限: Read (r)
      ├─ 有効期限: 指定日数（1〜30日）
      └─ generateBlobSASQueryParameters()

4. Azure Functions → ブラウザ レスポンス返却:
   {
     uploadUrl: "https://filetransapps.blob.core.windows.net/upload/..?SAS_TOKEN",
     downloadUrl: "https://filetransapps.blob.core.windows.net/upload/..?SAS_TOKEN",
     blobName: "1764659273949_example.zip",
     expiresOn: "2025-12-09T15:30:00.000Z"
   }
```

**関連コンポーネント:**
- **フロントエンド**: `app.js` の `handleUpload()`
- **Azure Functions**: `api/src/functions/httpTrigger1.js`
- **使用技術**: Fetch API, SAS Token, Azure Storage SDK

---

#### **5. ファイルアップロード（Azure Storage Account）**

**画面操作:**
- 進捗バーが「XX%」と更新されながら進行
- アップロード完了までリアルタイム表示

**裏側の動き:**
```
1. ブラウザ → Azure Storage Account (直接アップロード)
   ├─ メソッド: PUT
   ├─ URL: uploadUrl（SAS Token付き）
   ├─ ヘッダー:
   │  ├─ x-ms-blob-type: BlockBlob
   │  └─ Content-Type: application/zip (または auto-detect)
   └─ Body: ファイルのバイナリデータ

2. Azure Storage Account 内部処理:
   ├─ SAS Token検証:
   │  ├─ 署名の正当性確認
   │  ├─ 有効期限チェック
   │  └─ 権限チェック（Write権限）
   │
   ├─ CORS ポリシー検証:
   │  ├─ オリジンが許可リストに含まれるか
   │  ├─ メソッド（PUT）が許可されているか
   │  └─ ヘッダーが許可されているか
   │
   ├─ Blob Storage への保存:
   │  ├─ コンテナ: upload
   │  ├─ Blob名: 1764659273949_example.zip
   │  ├─ アクセスレベル: Private
   │  └─ 冗長性: LRS (Locally Redundant Storage)
   │
   └─ メタデータ記録:
      ├─ Content-Type
      ├─ Content-Length
      └─ Last-Modified

3. XMLHttpRequest による進捗監視:
   ├─ xhr.upload.addEventListener('progress') でイベント取得
   ├─ e.loaded / e.total で進捗率計算
   └─ プログレスバーのDOM更新
```

**関連コンポーネント:**
- **フロントエンド**: `app.js` の `uploadToBlob()`
- **Azure Storage**: Blob Service, Block Blob
- **使用技術**: XMLHttpRequest, Blob API, SAS Token認証

---

#### **6. アップロード完了・共有リンク生成**

**画面操作:**
- アップロード完了画面が表示
- 共有リンク（SAS Token付きURL）が表示される
- 有効期限が表示される
- 「コピー」ボタンで共有リンクをクリップボードにコピー

**裏側の動き:**
```
ブラウザ（app.js）
├─ アップロード完了後、結果画面を表示
│  ├─ uploadCard を非表示
│  ├─ progressCard を非表示
│  └─ resultCard を表示
│
├─ 共有リンク（downloadUrl）を表示:
│  └─ https://filetransapps.blob.core.windows.net/upload/1764659273949_example.zip?sv=...&sr=b&sp=r&sig=...
│     ├─ sv: Storage API バージョン
│     ├─ sr: リソースタイプ (b = Blob)
│     ├─ sp: 権限 (r = Read)
│     ├─ se: 有効期限
│     └─ sig: 署名（改ざん防止）
│
├─ 有効期限を日本語フォーマットで表示:
│  └─ expiresOn を Date オブジェクトに変換
│     └─ toLocaleDateString('ja-JP') で「2025年12月9日 15:30」形式
│
└─ コピーボタン機能:
   ├─ document.execCommand('copy') でクリップボードにコピー
   └─ ボタンテキストを一時的に「コピーしました」に変更（2秒間）
```

**関連コンポーネント:**
- **フロントエンド**: `app.js` の `showResult()`, `copyToClipboard()`
- **使用技術**: DOM操作, Clipboard API

---

#### **7. ファイルダウンロード（受信者側）**

**画面操作:**
- 受信者が共有リンクをブラウザで開く
- ファイルが自動的にダウンロードされる

**裏側の動き:**
```
1. 受信者のブラウザ → Azure Storage Account
   ├─ メソッド: GET
   ├─ URL: downloadUrl（SAS Token付き）
   └─ SAS Token パラメータ:
      ├─ sp=r (Read権限)
      ├─ se={有効期限} (例: 7日後)
      └─ sig={署名}

2. Azure Storage Account 検証:
   ├─ SAS Token検証:
   │  ├─ 署名の正当性確認
   │  ├─ 有効期限チェック
   │  │  └─ 期限切れの場合 → 403 Forbidden
   │  └─ 権限チェック（Read権限）
   │
   ├─ Blobの存在確認:
   │  └─ 存在しない場合 → 404 Not Found
   │
   └─ ファイル配信:
      ├─ Content-Type ヘッダー送信
      ├─ Content-Disposition: attachment
      └─ バイナリストリーミング配信

3. ブラウザ:
   └─ ダウンロードダイアログ表示
      └─ ファイル保存
```

**関連コンポーネント:**
- **Azure Storage**: Blob Service (GET操作)
- **セキュリティ**: SAS Token有効期限管理、署名検証

---

## 🔒 セキュリティの仕組み

### SAS Token（Shared Access Signature）

```
仕組み:
1. ファイルアップロード時:
   - Azure Functionsがストレージアカウントキーで署名生成
   - 権限: Write (w), 有効期限: 1時間
   - ユーザーに一時的なアップロード権限のみ付与

2. ファイルダウンロード時:
   - Azure Functionsが別のSAS Token生成
   - 権限: Read (r), 有効期限: 1〜30日（ユーザー指定）
   - 期限後は自動的にアクセス不可

3. セキュリティ保証:
   - ストレージアカウントキーは Azure Functions内にのみ保存
   - ブラウザには一切漏洩しない
   - SAS Tokenは改ざん不可（署名検証）
   - 有効期限後は自動無効化
```

### CORS（Cross-Origin Resource Sharing）

```
設定箇所:
1. Azure Functions (host.json):
   - すべてのオリジンからのAPIアクセスを許可
   - OPTIONS プリフライトリクエスト対応

2. Azure Storage Account (CORS設定):
   - 許可されるオリジン: *
   - 許可されるメソッド: GET, PUT, POST, DELETE, HEAD, OPTIONS
   - ブラウザからの直接アップロード/ダウンロードを実現
```

---

## 📦 Azure リソース構成

### 1. **Azure Static Web Apps**
- **役割**: フロントエンドホスティング、統合API管理
- **格納ファイル**: index.html, style.css, app.js
- **機能**:
  - 自動HTTPS化
  - CDN配信（高速化）
  - GitHub Actions連携（CI/CD）
  - `/api/*` へのリクエストを Azure Functions にルーティング

### 2. **Azure Functions**
- **役割**: バックエンドAPI（SAS Token生成）
- **ランタイム**: Node.js 18
- **関数**:
  - `generateUploadUrl`: アップロード用SAS URL生成
  - `generateDownloadUrl`: ダウンロード用SAS URL生成（拡張用）
- **環境変数**:
  - `STORAGE_ACCOUNT_NAME`
  - `STORAGE_ACCOUNT_KEY`
  - `STORAGE_CONTAINER_NAME`
  - `ALLOWED_ORIGINS`

### 3. **Azure Storage Account**
- **役割**: ファイル永続化ストレージ
- **構成**:
  - 名前: filetransapps
  - 種類: StorageV2 (汎用 v2)
  - 冗長性: LRS
  - コンテナ: upload（プライベートアクセス）
- **セキュリティ**:
  - パブリックアクセス: 無効
  - SAS Token経由のみアクセス可能
  - CORS設定でブラウザからの直接アクセスを制御

---

## 🚀 デプロイフロー

```
開発者（ローカル）
├─ コード変更
└─ git push origin main
   ↓
GitHub Repository
├─ GitHub Actions トリガー
└─ ビルドワークフロー実行
   ↓
   ├─ フロントエンドビルド:
   │  └─ index.html, style.css, app.js
   │
   ├─ Azure Functions ビルド:
   │  ├─ npm install
   │  └─ api/ フォルダをパッケージ化
   │
   └─ デプロイ:
      ├─ フロントエンド → Azure Static Web Apps
      └─ Functions → Azure Functions (統合)
         ↓
本番環境
├─ https://{your-app}.azurestaticapps.net
└─ https://{your-app}.azurestaticapps.net/api/generateUploadUrl
```

---

## 📊 データフロー図

```
┌─────────────┐
│   ユーザー   │
└──────┬──────┘
       │ ① ファイル選択
       ↓
┌─────────────────────┐
│  ブラウザ (app.js)   │
│  - ファイル保持      │
│  - ZIP化処理         │
└──────┬──────────────┘
       │ ② POST /api/generateUploadUrl
       │    (filename, expirationDays)
       ↓
┌─────────────────────┐
│  Azure Functions     │
│  - SAS Token生成     │
│  - uploadUrl返却     │
└──────┬──────────────┘
       │ ③ uploadUrl, downloadUrl
       ↓
┌─────────────────────┐
│  ブラウザ (app.js)   │
│  - ファイル準備完了  │
└──────┬──────────────┘
       │ ④ PUT {uploadUrl}
       │    (ファイルバイナリ)
       ↓
┌─────────────────────┐
│ Azure Storage        │
│ - Blob保存           │
│ - SAS Token検証      │
└──────┬──────────────┘
       │ ⑤ 200 OK
       ↓
┌─────────────────────┐
│  ブラウザ (app.js)   │
│  - 共有リンク表示    │
└─────────────────────┘
       │
       │ ⑥ 共有リンク送信
       ↓
┌─────────────┐
│   受信者     │ ⑦ GET {downloadUrl}
└──────┬──────┘
       ↓
┌─────────────────────┐
│ Azure Storage        │
│ - SAS Token検証      │
│ - ファイル配信       │
└─────────────────────┘
```

---

## 🛠️ 技術スタック

### フロントエンド
- HTML5 (Semantic Markup)
- CSS3 (Flexbox, Grid, Responsive Design)
- JavaScript (ES6+, async/await)
- JSZip 3.10.1 (ZIP生成)

### バックエンド
- Azure Functions (Node.js 18)
- @azure/storage-blob 12.17.0 (Storage SDK)
- @azure/functions 4.0.0 (Functions SDK)

### インフラ
- Azure Static Web Apps
- Azure Functions (従量課金プラン)
- Azure Storage Account (Blob Storage)

### CI/CD
- GitHub Actions (自動デプロイ)

---

## 📝 環境変数

### ローカル開発 (`api/local.settings.json`)
```json
{
  "Values": {
    "STORAGE_ACCOUNT_NAME": "filetransapps",
    "STORAGE_ACCOUNT_KEY": "xxx",
    "STORAGE_CONTAINER_NAME": "upload",
    "ALLOWED_ORIGINS": "*"
  }
}
```

### 本番環境 (Azure Portal)
Azure Static Web Apps → 設定 → 環境変数で同じ値を設定

---

## 🎨 デザイン

- **テイスト**: Figma "Design System For Wireframing" (Community)
- **カラースキーム**: 紫グラデーション (#667eea → #764ba2)
- **UI要素**: 丸みのあるカード、ホバーエフェクト、スムーズなアニメーション

---

## 📄 ライセンス

MIT License

---

## 👤 作成者

SecureFileShare Development Team
