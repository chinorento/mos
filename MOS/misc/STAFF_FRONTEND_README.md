# スタッフ用フロントエンド - 注文・配膳管理システム

**バージョン**: 2.0.0  
**対応ブラウザ**: Chrome, Firefox, Safari, Edge（最新版）  
**UI設計**: Apple HIG準拠、WCAG 2.1 AA対応  
**技術スタック**: HTML5 / CSS3 / Vanilla JavaScript（ES6+）  

## 📋 概要

スタッフ用フロントエンドは、居酒屋運営に必要な3つの主要機能を提供する統合管理システムです。  
顧客の注文から配膳完了まで、リアルタイムで進捗を管理し、スタッフの効率を最大化します。

- ✅ **注文管理**：受け取り、調理状況、配膳指示
- ✅ **配膳管理**：配膳完了マーク、テーブルごとの進捗可視化
- ✅ **呼び出し対応**：スタッフ呼び出し要求への迅速な応答

---

## 🎯 画面一覧と役割

### 1. **スタッフダッシュボード** (`staff_dashboard.html`)
**用途**: 全館の注文状況をリアルタイム監視

**主な表示要素**:
- **注文サマリー**：受付待ち・調理中・配膳待ち・完了の件数表示
- **座席別グリッド表示**：各座席の現在ステータスを色分け表示
  - 🟢 完了（緑）
  - 🟡 配膳待ち（黄）
  - 🔵 調理中（青）
  - 🔴 受付待ち（赤）
  - ⚫ 空席（灰色）
- **リアルタイム更新インジケータ**：ポーリング状態、最終更新時刻表示
- **クイックアクション**：座席タップで詳細画面へ遷移

**ホットキー**（将来実装）:
- `R` キー：全体リロード
- `Esc`：詳細モーダルを閉じる

---

### 2. **注文管理画面** (`staff_orders.html`)
**用途**: 個別座席の注文詳細管理・調理指示

**主な機能**:
- **注文一覧**：該当座席のすべての注文をタイムスタンプ付きで表示
  ```
  [注文 #003] 13:45
  ├─ ねぎま × 2
  ├─ 唐揚げ × 1
  ├─ 枝豆 × 1
  └─ ステータス: 🔵 調理中
  ```
- **ステータス遷移コントロール**:
  - 受け取り ➜ 調理中 ➜ 配膳完了（確定ボタン）
  - キャンセル対応（確認ダイアログ付き）
- **配膳指示表示**：調理完了項目の強調表示
- **会計情報**：合計金額、支払い方法の表示

**配膳確定UX**:
```javascript
// ステップ1：配膳完了ボタン
🍽️ "この注文を配膳した"

// ステップ2：確認ダイアログ
"座席 C-05 への▲注文 #003 の配膳を完了しますか？"
[ キャンセル ]  [ 確定 ]

// ステップ3：完了通知
✅ "配膳完了しました"（3秒後に戻る）
```

---

### 3. **呼び出し応答画面** (`staff_alerts.html`)
**用途**: スタッフ呼び出し要求への対応

**主な機能**:
- **呼び出し待機一覧**：
  - タイムスタンプ（待機時間を秒単位で表示）
  - 座席ID（視認性優先の大きいフォント）
  - 呼び出し理由（トイレ・追加注文・その他）
- **応答方法**：
  - 「対応完了」ボタンクリック
  - 確認ダイアログで意図確認
  - 顧客側へ確認通知を送信
- **未対応タイムアウトアラート**：
  - 5分以上未対応時、背景色が黄 ➜ 赤へ変化
  - 音声アラート（ポップアップ許可時）

**応答完了フロー**:
```
呼び出し一覧
    ↓
座席をタップ
    ↓
"対応完了ボタン"
    ↓
確認ダイアログ
    ↓
✅ 応答完了（一覧から削除）
    ↓
顧客側へWebSocket / ポーリング通知
```

---

### 4. **キッチン情報パネル** (`staff_kitchen.html`) 【オプション】
**用途**: 調理人向けに出来上がった料理を表示

**主な機能**:
- **出来上がり通知**：調理完了した商品を大きく表示
- **料理別グループ**：同じ商品の出来上がり時刻をまとめる
- **配膳済みチェック**：調理完了後、配膳が完了した商品は自動で一覧から削除

---

## 🔨 主な機能

### 1. 注文管理フロー

```
┌─────────────────────────────────────────────┐
│ 顧客が注文確定                               │
└────────────────┬────────────────────────────┘
                 │ API POST /orders
                 ↓
┌─────────────────────────────────────────────┐
│ スタッフ注文管理画面                        │
│ ★ 未配膳商品が多い座席を上位に表示         │
│ （優先度：緊急/高/中/低で色分け）          │
└────────────────┬────────────────────────────┘
                 │ スタッフが情報確認
                 ↓
┌─────────────────────────────────────────────┐
│ 商品にチェックして配膳完了                  │
│ または "完了" ボタンで確定                  │
└────────────────┬────────────────────────────┘
                 │ API PATCH /orders/{id}/items/{itemId}/delivered
                 ↓
┌─────────────────────────────────────────────┐
│ UI 即座に再描画                             │
│ 進捗度バーが更新、優先度が下降             │
│ 配膳完了通知を顧客へ送信                   │
└─────────────────────────────────────────────┘
```

**★ 新設計：未配膳商品数優先度**

### 2. 配膳管理フロー

```
未配膳商品数による優先度判定：
🔴 緊急（Critical）  : 5件以上 → 太い赤枠、最優先表示
🟠 高（High）        : 3～4件 → オレンジ枠
🟡 中（Medium）      : 1～2件 → 黄色枠
🟢 低（Low）         : 0件   → 緑枠、完了に近い

UI表現の多重化（視認性優先）:
1. 優先度インジケーター：絵文字 + ラベル + 色
2. 進捗度バー：幅と背景色で達成度を可視化
3. 未配膳バッジ：「X件未配膳」と数字表示
4. 座席グループの枠色：優先度に応じて変化

スタッフの意思決定フロー:
1. 画面表示時「未配膳が多い順」でソート（デフォルト）
2. 上から順に確認：未配膳商品を商品ごとにチェック
3. 複数商品を選んで「配膳済みにマーク」で一括完了
4. 進捗度バーが上昇、優先度が下降（自動再ソート）
5. 完了座席は下位に落ちる
```

**ステータス遷移**

### 3. 呼び出し応答フロー

```
┌───────────────────────────────┐
│ 顧客がスタッフ呼び出しボタン  │
└──────────┬────────────────────┘
           │
           ↓
┌───────────────────────────────┐
│ スタッフ側へ通知              │
│ （staff_alerts.html 更新）    │
└──────────┬────────────────────┘
           │
           ↓
┌───────────────────────────────┐
│ スタッフが対応完了ボタン      │
│ をクリック                    │
└──────────┬────────────────────┘
           │
           ↓
┌───────────────────────────────┐
│ 顧客へ「対応予定」通知        │
│ （顧客側で呼び出し音停止）    │
└───────────────────────────────┘
```

---

## 🏗️ 状態管理方針

### グローバル状態 (`staff-state.js`)

スタッフ用フロントエンドは顧客用（`shared-state.js`）とは **完全に分離** された状態管理を採用します。

```javascript
const StaffState = {
  // ダッシュボード全館情報
  allOrders: [],           // サーバから取得した全注文
  ordersByStatus: {},      // ステータス別の注文グループ化
  seatStatus: {},          // 座席の最新ステータス
  alerts: [],              // 未対応の呼び出し一覧

  // UI状態
  currentFilter: 'all',    // フィルタ条件
  currentSort: 'priority-desc',  // ★ デフォルト：未配膳商品数が多い順
  viewMode: 'compact',         // コンパクト表示
  selectedItems: new Set(),    // 複数選択中の商品ID

  // 優先度計算ロジック（純粋関数）
  calculateUndeliveredCount(orders, seatId) {
    // 座席の未配膳商品数 = 優先度スコア
  },
  
  getPriorityLevel(undeliveredCount) {
    // 5件以上  → 🔴 緊急（CRITICAL）
    // 3～4件  → 🟠 高（HIGH）
    // 1～2件  → 🟡 中（MEDIUM）
    // 0件     → 🟢 低（LOW）
  }
};
```

**★ 優先度ソートの仕組み**

```javascript
// 座席別の未配膳商品数でソート（降順）
sortedSeats = Object.entries(groupedBySeat)
  .sort(([seatA, ordersA], [seatB, ordersB]) => {
    const undeliveredA = ordersA.reduce((sum, order) => 
      sum + order.items.filter(item => !item.delivered).length, 0
    );
    const undeliveredB = ordersB.reduce((sum, order) => 
      sum + order.items.filter(item => !item.delivered).length, 0
    );
    return undeliveredB - undeliveredA;  // 多い順（優先度高い順）
  });

// 結果：最上部に「未配膳5件以上」の緊急座席が表示される
```

### 状態更新戦略

#### ❌ 使用禁止：WebSocket (将来検討)
- リアルタイム必須ではない業務フロー
- デプロイの複雑性が不要
- 開発初期はポーリングで十分

#### ✅ 推奨：ポーリング + 手動更新

**自動ポーリング**（ポーリング間隔：5秒）:
```javascript
async function pollStaffData() {
  const orders = await fetchOrdersAPI();
  const alerts = await fetchAlertsAPI();
  
  StaffState.allOrders = orders;
  StaffState.alerts = alerts;
  
  updateDashboardUI();
}

// ダッシュボード表示中のみ実行
setInterval(pollStaffData, 5000);
```

**手動更新オプション**（ユーザーの明示的アクション）:
```javascript
// 🔄 "今すぐ更新" ボタン
async function manualRefresh() {
  showLoadingIndicator();
  await pollStaffData();
  showSuccessNotification('更新完了');
}
```

**エッジケース処理**:
- ネットワーク遅延：タイムアウト 5秒後に前回データを表示
- API障害：キャッシュデータを表示、赤色の警告バナー表示
- ポーリング中の画面遷移：既実行リクエストはキャンセル

### localStorage との連携

注文変更履歴のローカルキャッシュ（オフライン対応）:
```javascript
// 座席別の注文変更ログ
localStorage.setItem(
  `staffOrderLog_${seatId}`,
  JSON.stringify({
    orders: [],
    lastSyncAt: timestamp
  })
);
```

**同期戦略**:
- API成功時：seatIdsとサーバデータを同期、ローカルキャッシュを更新
- API失敗時：ローカルキャッシュから復元
- 再度接続時：同期待機中のキューを送信

---

## 🔄 顧客画面との責務分離

### 責務マトリックス

| 機能 | 顧客画面 | スタッフ画面 | 注記 |
|------|--------|----------|------|
| **注文確定** | ✅ | ❌ | 顧客のみが注文可能 |
| **メニュー表示** | ✅ | ❌ | スタッフは不要 |
| **座席選択** | ✅ (初回) | ❌ | QRコード / 管理者設定で完全性保証 |
| **ステータス閲覧** | ✅ | ✅ | 異なるデータモデル |
| **ステータス更新** | ❌ | ✅ | スタッフのみ操作権 |
| **配膳状況確認** | ✅ | ✅ | リアルタイム同期 |
| **会計管理** | ✅ | ✅ | 会計用独立API |

### 認証・認可の分離設計

```
API呼び出し時のヘッダー:
┌──────────────────────────────────────────────────┐
│ Headers                                          │
│ ========================                        │
│ X-Role: customer / staff                         │
│ X-SeatId: C-05 (顧客)                            │
│ X-StaffToken: xxxxx (スタッフ)                   │
│ X-StoreId: 001                                   │
└──────────────────────────────────────────────────┘

バックエンド検証:
- X-Role: customer → 顧客権限APIのみ許可
- X-Role: staff →  スタッフ権限API のみ許可
- SeatId 傍受防止：X-StaffToken で検証
```

### データ構造の分離

**顧客側の注文データ**:
```javascript
{
  id: 'order_001',
  seatId: 'C-05',
  items: [{ id: 'm01', qty: 2, name: 'ねぎま', price: 280 }],
  createdAt: '2024-04-09T13:45:00Z',
  status: 'delivered',  // 顧客視点のステータス
  total: 560
}
```

**スタッフ側の注文データ**:
```javascript
{
  id: 'order_001',
  seatId: 'C-05',
  items: [
    { 
      id: 'm01', 
      qty: 2, 
      name: 'ねぎま', 
      prep_priority: 1,  // 優先度（調理順）
      prep_status: 'cooking',
      estimatedTime: 3  // 分
    }
  ],
  internalStatus: 'cooking',  // スタッフ視点のステータス
  staff_notes: 'アレルギー確認済み',
  createdAt: '2024-04-09T13:45:00Z',
  receivedAt: '2024-04-09T13:46:00Z',
  deliveredAt: null
}
```

---

## 🔌 API連携設計（将来実装）

### 1. エンドポイント仕様

#### **ダッシュボード用：全館注文取得**
```http
GET /api/v1/staff/orders?storeId=001&status=all&limit=50
Authorization: Bearer <staff_token>

Response: 200 OK
{
  "orders": [
    {
      "id": "order_001",
      "seatId": "C-05",
      "status": "cooking",  // received | cooking | ready | delivered
      "items": [...],
      "createdAt": "2024-04-09T13:45:00Z",
      "updatedAt": "2024-04-09T13:46:30Z"
    }
  ],
  "meta": {
    "total": 15,
    "received": 3,
    "cooking": 5,
    "ready": 4,
    "delivered": 3,
    "serverTime": "2024-04-09T13:47:00Z"
  }
}
```

#### **注文ステータス更新**
```http
PATCH /api/v1/staff/orders/{orderId}/status
Authorization: Bearer <staff_token>

Request Body:
{
  "status": "delivered",
  "deliveredAt": "2024-04-09T13:48:00Z"
}

Response: 200 OK
{
  "id": "order_001",
  "status": "delivered",
  "updatedAt": "2024-04-09T13:48:00Z"
}
```

#### **呼び出しアラート取得**
```http
GET /api/v1/staff/alerts?storeId=001&status=pending
Authorization: Bearer <staff_token>

Response: 200 OK
{
  "alerts": [
    {
      "id": "alert_001",
      "seatId": "C-05",
      "reason": "assistance",  // assistance | additional_order | other
      "createdAt": "2024-04-09T13:45:00Z",
      "respondedAt": null
    }
  ]
}
```

#### **呼び出し対応完了**
```http
POST /api/v1/staff/alerts/{alertId}/respond
Authorization: Bearer <staff_token>

Request Body:
{
  "action": "acknowledged",
  "respondedAt": "2024-04-09T13:48:00Z"
}

Response: 200 OK
{
  "id": "alert_001",
  "status": "acknowledged"
}
```

### 2. エラーハンドリング戦略

```javascript
async function fetchWithErrorHandling(url, options = {}) {
  try {
    const response = await fetchWithTimeout(url, 5000);
    
    if (!response.ok) {
      // ステータスコードのエラー処理
      const error = await response.json();
      throw new APIError(error.message, response.status);
    }
    
    return await response.json();
  } catch (error) {
    if (error.name === 'TimeoutError') {
      // タイムアウト時の処理
      showErrorNotification('接続がタイムアウトしました');
      return getCachedData(url);  // キャッシュから復元
    }
    
    if (error instanceof NetworkError) {
      // ネットワークエラー時
      showOfflineBanner();
      return getCachedData(url);
    }
    
    // その他のエラー
    logError(error);
    showErrorNotification('エラーが発生しました');
    throw error;
  }
}
```

**HTTPステータスコード対応表**:
| コード | 対応 | 表示 | キャッシュ復帰 |
|--------|------|------|--------|
| **200** | 成功 | ✅ | × |
| **400** | 不正なリクエスト | ⚠️ | 〇 |
| **401** | 認証失敗 | ⚠️ | × (ログイン画面へ) |
| **403** | 権限不足 | ⚠️ | × |
| **404** | リソース未検出 | ⚠️ | 〇 |
| **500** | サーバエラー | ❌ | 〇 |
| **504** | タイムアウト | ❌ | 〇 |

### 3. ポーリング設定

**推奨設定値**:
```javascript
const POLLING_CONFIG = {
  DASHBOARD_INTERVAL: 5000,      // 5秒（ダッシュボード表示中）
  DETAIL_INTERVAL: 3000,         // 3秒（注文詳細表示中）
  ALERTS_INTERVAL: 2000,         // 2秒（呼び出し対応中）
  INACTIVE_STOP: 60000,          // 60秒非アクティブで停止
  MAX_RETRIES: 3,                // 3回失敗で中止
  BACKOFF_MULTIPLIER: 1.5        // リトライ間隔を1.5倍に
};
```

### 4. 将来の拡張：WebSocket 移行手順

WebSocket 導入時の段階的移行方法：

**Phase 1（現在）**: HTTP ポーリング
- ポーリング間隔：5秒
- キャッシュで乗り切り

**Phase 2（準備）**: 並行実装
```javascript
if (USE_WEBSOCKET) {
  connectWebSocket();
} else {
  pollData();  // フォールバック
}
```

**Phase 3（切り替え）**: WebSocket 優先
```javascript
connect WebSocket → 接続成功なら使用
             ↓ (失敗)
     ポーリングにフォールバック
```

---

## 🎨 UI/UXデザイン仕様（顧客画面との統一）

### デザイン原則

#### 1. **視認性の統一**
- **色彩スキーム**：顧客画面と同じ色体系（ブランドカラー等）
- **フォント**：同じ font-family を使用
- **アイコン**：同じセット（Apple SF Symbols に準ずる）

```css
/* 共有の設計トークン */
:root {
  /* プライマリカラー */
  --color-primary: #ff7f32;      /* オレンジ（ブランド色）*/
  --color-primary-dark: #e86c1f;

  /* ステータス色 */
  --color-success: #10b981;       /* 完了・配膳済み */
  --color-pending: #f59e0b;       /* 待機中 */
  --color-alert: #ef4444;         /* 要対応 */
  --color-info: #3b82f6;          /* 情報 */

  /* タイポグラフィ */
  --font-size-heading: 1.75rem;
  --font-size-body: 1rem;
  --font-family-base: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
```

#### 2. **アクセシビリティ（WCAG 2.1 AA準拠）**

| 項目 | 要件 | 例 |
|------|------|-----|
| **色コントラスト** | 4.5:1 以上 | 黒背景に白テキスト ✅ |
| **最小フォントサイズ** | 14px (モバイル) | 触れやすいボタン（最小44px） |
| **キーボード操作** | すべて操作可能 | Tab キーで移動、Enter で操作 |
| **スクリーンリーダー** | aria-label / role 属性 | `<button role="button" aria-label="配膳完了">` |

**例：配膳完了ボタン**
```html
<button 
  id="deliver-btn"
  class="btn btn-primary"
  aria-label="座席 C-05 の注文を配膳完了にマーク"
  aria-pressed="false"
  @click="markAsDelivered"
>
  🍽️ 配膳完了
</button>
```

#### 3. **レスポンシブレイアウト**

**ブレークポイント**（顧客画面と共通）:
```css
/* タブレット（iPad など） */
@media (min-width: 768px) {
  .dashboard-grid {
    grid-template-columns: repeat(4, 1fr);  /* 4列グリッド */
  }
}

/* デスクトップ */
@media (min-width: 1024px) {
  .dashboard-grid {
    grid-template-columns: repeat(6, 1fr);  /* 6列グリッド */
  }
}
```

### ステータス表示

**視覚的階層設計**:

```
優先度 高
├─ 🔴 未対応（受け取り待ち）
├─ 🟡 警告（5分以上待機）
└─ 🟢 完了（配膳済み）

優先度 低
├─ 🔵  情報（調理中）
└─ ⚫ 通常（待機中）
```

---

## 📦 ファイル構成

```
staff/
├── README.md（本ファイル）
├── staff_dashboard.html       ★ ダッシュボード
├── staff_dashboard.css
├── staff_dashboard.js
├── staff_orders.html          ★ 注文管理
├── staff_orders.css
├── staff_orders.js
├── staff_alerts.html          ★ 呼び出し対応
├── staff_alerts.css
├── staff_alerts.js
├── staff_kitchen.html         （オプション）
├── staff_kitchen.css
├── staff_kitchen.js
├── staff-state.js             ★ 状態管理
├── staff-api.js              ★ API 連携
├── staff-utils.js            ★ ユーティリティ
├── staff-auth.js             ★ 認証・ログイン
└── assets/
    └── icons/                文字アイコン / 絵文字利用
```

---

## 🔐 認証・セキュリティ

### ログイン画面（`staff_auth.html`）

**認証フロー**:

```
staff_auth.html
  ↓ 入力（店舗ID + スタッフID + パスワード）
  ↓ POST /api/v1/auth/staff/login
  ↓ バックエンド検証
  ↓ JWT トークン返却
  ↓ localStorage に保存
  ↓ staff_dashboard.html へリダイレクト
```

**トークンの取得と保存**:
```javascript
async function staffLogin(storeId, staffId, password) {
  const response = await fetch('/api/v1/auth/staff/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeId, staffId, password })
  });

  const { token, expiry } = await response.json();
  
  // トークン保存
  localStorage.setItem('staffToken', token);
  localStorage.setItem('staffTokenExpiry', expiry);
  
  // 自動ログアウト（有効期限切れ時）
  setTokenExpiry(expiry);
}
```

**セッション検証**:
```javascript
function isStaffSessionValid() {
  const token = localStorage.getItem('staffToken');
  const expiry = localStorage.getItem('staffTokenExpiry');
  
  if (!token || !expiry) return false;
  
  if (new Date() > new Date(expiry)) {
    // 期限切れ → ログイン画面へ
    window.location.href = 'staff_auth.html';
    return false;
  }
  
  return true;
}
```

### CORS 設定

スタッフ用 API への CORS ヘッダー:
```
Access-Control-Allow-Origin: https://staff.store.com
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Allow-Credentials: true
```

---

## ⚡ パフォーマンス最適化

### 1. 画面遷移最適化

```javascript
// 画面切り替え時のポーリング停止
function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

// 画面復帰時のポーリング再開
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    startPolling();
  } else {
    stopPolling();
  }
});
```

### 2. 描画最適化

**バッチ更新**（requestAnimationFrame）:
```javascript
let pendingUpdates = [];

function updateDashboard(newData) {
  pendingUpdates.push(newData);
  
  if (!updateScheduled) {
    updateScheduled = true;
    requestAnimationFrame(() => {
      // まとめて DOM 更新
      const merged = mergePendingUpdates();
      rerenderUI(merged);
      pendingUpdates = [];
      updateScheduled = false;
    });
  }
}
```

### 3. メモリリーク防止

```javascript
// 画面離脱時のクリーンアップ
window.addEventListener('beforeunload', () => {
  stopPolling();
  clearEventListeners();
  clearCache();
});
```

---

## 🧪 テスト戦略

### ユニットテスト（Jest）

```javascript
// staff-state.js テスト
describe('StaffState', () => {
  it('should update order status correctly', () => {
    const orders = [{ id: 'o1', status: 'received' }];
    StaffState.updateOrderStatus('o1', 'cooking');
    
    expect(StaffState.allOrders[0].status).toBe('cooking');
  });
});
```

### E2E テスト（顧客 ↔ スタッフ間の連携）

```gherkin
Scenario: 顧客が注文 → スタッフが配膳確定 → 顧客が完了を確認

Given 顧客が "ねぎま × 2" を注文
When スタッフが「配膳完了」をクリック
Then 顧客画面に "配膳完了" 通知が表示される
```

---

## 📈 デプロイメント

### ディレクトリ構成

```
public_html/
├── index.html                    （顧客向けトップ）
├── top_menu.html
├── menu_list.html
├── checkout.html
├── order_history.html
├── qr_entry.html
│
├── staff/                        ★ スタッフ用フォルダ
│   ├── index.html               （スタッフログイン）
│   ├── dashboard.html
│   ├── orders.html
│   ├── alerts.html
│   ├── css/
│   │   ├── dashboard.css
│   │   ├── orders.css
│   │   ├── alerts.css
│   │   └── shared-staff.css     （共有スタイル）
│   └── js/
│       ├── state.js
│       ├── api.js
│       ├── auth.js
│       ├── dashboard.js
│       ├── orders.js
│       └── alerts.js
│
├── api/
│   ├── auth/
│   ├── orders/
│   ├── alerts/
│   └── menu/
│
├── includes/
│   ├── session.php
│   ├── functions.php
│   └── auth.php               （スタッフ認証）
│
└── shared/
    ├── constants.js
    └── utils.js
```

---

## 🛤️ 開発ロードマップ

### **Phase 1（MVP）- 必須機能**
- [ ] ダッシュボード画面（座席グリッド、ステータス表示）
- [ ] 注文管理画面（ステータス更新、配膳確定）
- [ ] 呼び出し対応画面（呼び出し一覧、対応完了）
- [ ] 基本的な API 連携（HTTP ポーリング）
- [ ] スタッフログイン

### **Phase 2（機能拡張）**
- [ ] キッチン情報パネル（調理人向け）
- [ ] 注文フィルター（座席別、時間帯別）
- [ ] リアルタイム通知（タップ音、視覚的警告）
- [ ] オフライン対応（ローカルキャッシュ同期）

### **Phase 3（高度な機能）**
- [ ] WebSocket 統合（リアルタイム更新）
- [ ] 複数店舗対応
- [ ] スタッフパフォーマンス分析
- [ ] キッチンディスプレイシステム（KDS）連携

---

## 📝 開発ガイドライン

### コード規約

**ファイル命名**:
- ページファイル：`staff_*.html`
- スタイル：`staff_*.css`
- スクリプト：`staff-*.js`
- 共有ファイル：`shared-*.js` (顧客・スタッフ双方)

**変数命名**（顧客画面と統一）:
```javascript
const CONSTANTS_IN_UPPER_CASE = 'value';
let myCamelCaseVariable = 'value';
function myFunctionName() {}
```

**クラス設計**:
- 状態管理と UI 更新の分離
- 副作用のない純粋関数を優先
- グローバルスコープの最小化

### デバッグとログ

```javascript
// 開発モード設定
const DEBUG_MODE = window.location.hostname === 'localhost';

function log(...args) {
  if (DEBUG_MODE) console.log('[Staff]', ...args);
}

// 使用例
log('Order updated:', orderId, newStatus);
```

---

## 🤝 顧客画面との統合テスト

顧客とスタッフ間の実装の一貫性チェックリスト：

- [ ] 色彩スキーム が同じ（`--color-*` 変数）
- [ ] フォント が同じ
- [ ] ボタンサイズが同じ（最小 44px × 44px）
- [ ] API レスポンス形式が統一
- [ ] エラーハンドリング strategy が同じ
- [ ] ログアウト時の cleanup が同じ
- [ ] タイムゾーン処理が統一（UTC基準）

---

## 📞 サポートとトラブルシューティング

### よくある問題

**Q. ポーリングが重い**
- A. `POLLING_CONFIG.DASHBOARD_INTERVAL` を増やす（5秒 → 10秒）
- A. 不要なデータフィールドをフィルター

**Q. スタッフ側の更新が顧客側に反映されない**
- A. API レスポンス形式を確認（リアルタイム同期の必要性？）
- A. バックエンドの キャッシュ戦略を見直し

**Q. レイアウトが乱れる**
- A. `staff_*.css` ファイルの読み込み順序確認
- A. ブラウザキャッシュをクリア（Ctrl+Shift+R）

---

## 📚 参考資料

- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)
- [WCAG 2.1 Accessibility Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [MDN Web Docs: Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
- [JavaScript Design Patterns](https://www.patterns.dev/posts/module-pattern/)

---

## 📄 ドキュメント更新履歴

| バージョン | 日付 | 変更内容 |
|---------|-------|---------|
| 2.0.0 | 2024-04-09 | 初版作成：3画面（ダッシュボード、注文管理、呼び出し対応） |
| 2.1.0 (予定) | TBD | WebSocket 統合手順 |

---

**最後に更新**: 2024年4月9日

**作成者**: MOS Development Team  
**ライセンス**: Internal Use Only
