# DoS/DDoS 攻撃対策ガイド

## 現在の保護レベル

### Azure Static Web Apps（デフォルト）
- **CDN**: Azureのグローバルエッジネットワーク
- **DDoS Protection Basic**: L3/L4レイヤーの基本的な保護
- **コスト**: 無料（Static Web Appsに含まれる）
- **制限**: レート制限、WAF、Bot保護なし

## 推奨アーキテクチャ

### オプション1: Azure Front Door Standard/Premium（推奨）

```
ユーザー → Azure Front Door → Azure Static Web Apps
                ↓
         WAF + レート制限
         Bot保護
         DDoS Protection
```

#### メリット
✅ **L7 DDoS保護**: アプリケーションレイヤーの攻撃を防御  
✅ **WAF（Web Application Firewall）**: OWASP Top 10の脅威を防御  
✅ **レート制限**: IPごとのリクエスト数制限  
✅ **Bot保護**: 悪意のあるBotをブロック  
✅ **カスタムドメイン**: 独自ドメインの使用  
✅ **グローバルロードバランシング**: 複数リージョンへの分散  

#### コスト
- **Standard**: ~$35/月（基本料金） + トラフィック料金
- **Premium**: ~$330/月（基本料金） + トラフィック料金 + 高度なセキュリティ機能

#### 設定例（Azure Portal）

**1. Azure Front Doorの作成**
```
Azure Portal → リソースの作成 → Front Door and CDN profiles
- Tier: Standard
- Name: filetransapps-frontdoor
- Origin: nice-bush-0a1714700.3.azurestaticapps.net
```

**2. WAFポリシーの作成**
```
Azure Portal → Web Application Firewall policies
- Policy mode: Prevention
- Rule set: Microsoft_DefaultRuleSet_2.1
- Custom rules:
  - Rate limit: 100 requests/min per IP
  - Geo-filtering: 日本のみ許可（オプション）
```

**3. レート制限ルール**
```json
{
  "name": "RateLimitRule",
  "priority": 1,
  "ruleType": "RateLimitRule",
  "rateLimitDurationInMinutes": 1,
  "rateLimitThreshold": 100,
  "matchConditions": [
    {
      "matchVariable": "RemoteAddr",
      "operator": "IPMatch",
      "matchValue": ["0.0.0.0/0"]
    }
  ],
  "action": "Block"
}
```

### オプション2: Azure API Management（API保護特化）

```
ユーザー → Azure API Management → Azure Functions
                ↓
         レート制限
         認証・認可
         キャッシング
```

#### メリット
✅ **APIレベルの制御**: きめ細かいレート制限  
✅ **認証統合**: OAuth, Azure AD, API Key  
✅ **分析**: 詳細なAPI使用状況  
✅ **キャッシング**: レスポンスのキャッシュで負荷軽減  

#### コスト
- **Developer**: ~$50/月（開発用）
- **Basic**: ~$160/月（本番環境の最小構成）
- **Standard**: ~$740/月（高可用性）

#### 設定例
```xml
<policies>
    <inbound>
        <!-- レート制限: 100コール/分 -->
        <rate-limit calls="100" renewal-period="60" />
        
        <!-- IPベースのレート制限 -->
        <rate-limit-by-key calls="10"
                           renewal-period="60"
                           counter-key="@(context.Request.IpAddress)" />
        
        <!-- Quota: 10,000コール/月 -->
        <quota calls="10000" renewal-period="2592000" />
        
        <!-- Bot検出 -->
        <check-header name="User-Agent" failed-check-httpcode="403">
            <value>bot</value>
            <value>crawler</value>
        </check-header>
    </inbound>
</policies>
```

### オプション3: Cloudflare（コスト重視）

```
ユーザー → Cloudflare → Azure Static Web Apps
                ↓
         CDN + WAF
         DDoS保護
         Bot保護
```

#### メリット
✅ **低コスト**: Free～$20/月のプランあり  
✅ **簡単な設定**: DNS変更のみで有効化  
✅ **豊富な機能**: WAF, Bot保護, レート制限  

#### コスト
- **Free**: $0/月（基本的なDDoS保護）
- **Pro**: $20/月（より高度な保護）
- **Business**: $200/月（優先サポート + 高度なWAF）

## 具体的な実装プラン

### 段階的な実装（推奨）

#### Phase 1: 即座に実装可能（無料）
```javascript
// 1. アプリケーションレベルのレート制限（メモリキャッシュ）
const rateLimitMap = new Map();

function checkRateLimit(ipAddress) {
    const now = Date.now();
    const userRequests = rateLimitMap.get(ipAddress) || [];
    
    // 1分以内のリクエストをフィルタ
    const recentRequests = userRequests.filter(time => now - time < 60000);
    
    if (recentRequests.length >= 100) {
        return false; // レート制限超過
    }
    
    recentRequests.push(now);
    rateLimitMap.set(ipAddress, recentRequests);
    return true;
}
```

#### Phase 2: Azure Front Door Standard（1-2週間）
1. Front Doorリソースの作成
2. Static Web AppsをOriginとして設定
3. WAFポリシーの適用
4. カスタムドメインの設定（オプション）
5. DNSの切り替え

#### Phase 3: 監視とチューニング（継続的）
1. Application Insightsでメトリクス監視
2. WAFルールの最適化
3. レート制限の調整

## コスト試算（月額）

### 小規模（トラフィック: 10GB/月、1,000リクエスト/日）
- **現状（Static Web Apps のみ）**: $0
- **+ Azure Front Door Standard**: ~$40
- **+ Cloudflare Pro**: ~$20

### 中規模（トラフィック: 100GB/月、10,000リクエスト/日）
- **現状（Static Web Apps のみ）**: $0
- **+ Azure Front Door Standard**: ~$80
- **+ API Management Basic**: ~$160

### 大規模（トラフィック: 1TB/月、100,000リクエスト/日）
- **現状（Static Web Apps のみ）**: $0
- **+ Azure Front Door Premium**: ~$500
- **+ API Management Standard**: ~$900

## 実装優先度

### 🔴 高優先度（すぐ実装すべき）
1. **アプリケーションレベルのレート制限** - コスト: $0
2. **reCAPTCHA v3の導入** - コスト: 無料～$1,000/月
3. **監視とアラート** - Application Insights（既存リソース活用）

### 🟡 中優先度（トラフィック増加時）
1. **Azure Front Door Standard** - 月間10,000リクエスト超える場合
2. **WAFポリシーの有効化** - セキュリティ要件が高い場合

### 🟢 低優先度（エンタープライズ向け）
1. **Azure API Management** - API統合が必要な場合
2. **Premium WAF** - PCI DSS, HIPAA準拠が必要な場合

## 無料で今すぐできる対策

### 1. アプリケーションレベルのレート制限実装
httpTrigger1.jsに追加（下記参照）

### 2. reCAPTCHA v3の追加
```html
<!-- index.html -->
<script src="https://www.google.com/recaptcha/api.js?render=YOUR_SITE_KEY"></script>
<script>
grecaptcha.ready(function() {
    grecaptcha.execute('YOUR_SITE_KEY', {action: 'upload'}).then(function(token) {
        // tokenをAPIリクエストに含める
    });
});
</script>
```

### 3. 監視の強化
```
Azure Portal → Application Insights → Alerts
- Alert: API error rate > 10%
- Alert: Response time > 5s
- Alert: Request count > 1000/min
```

## 推奨事項

### 現在のトラフィックレベルに応じて

**トラフィック < 1,000リクエスト/日**  
→ アプリケーションレベルのレート制限で十分

**トラフィック 1,000～10,000リクエスト/日**  
→ Azure Front Door Standard + WAF を推奨

**トラフィック > 10,000リクエスト/日**  
→ Azure Front Door Premium + API Management を検討

## まとめ

### すぐに実装すべき（無料）
- [x] アプリケーションレベルのレート制限
- [ ] reCAPTCHA v3
- [ ] Application Insightsアラート

### 成長に応じて実装
- [ ] Azure Front Door Standard（トラフィック増加時）
- [ ] WAFポリシー（セキュリティ強化時）
- [ ] API Management（API統合時）

現状では、**アプリケーションレベルのレート制限**と**reCAPTCHA**で十分なDoS対策になります。トラフィックが増加したタイミングで、段階的にAzure Front Doorを導入することを推奨します。
