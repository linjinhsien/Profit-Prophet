# DynamoDB 資料表設計文件

## 概述

CareMate AI 使用兩張 DynamoDB 表儲存長者資料與對話記憶。
所有資料均啟用靜態加密（SSE）與時間點回復（PITR）。

---

## Table 1: `caremate-ai_elder_profile`

### 用途
儲存長者基本資料、健康資訊、個人偏好、家庭資訊。

### Key Schema

| 屬性名稱 | 類型 | Key Type |
|----------|------|----------|
| elder_id | String (S) | Partition Key (HASH) |

### 屬性定義

| 欄位 | 類型 | 說明 | 範例 |
|------|------|------|------|
| elder_id | S | 長者唯一識別碼 | `"elder-001"` |
| name | S | 姓名 | `"陳阿嬤"` |
| age | N | 年齡 | `78` |
| gender | S | 性別 | `"女"` |
| language | S | 慣用語言 | `"zh-TW"` |
| phone | S | 聯絡電話 | `"09XX-XXX-XXX"` |
| address | S | 居住地址 | `"台東縣池上鄉"` |
| disease | S | 疾病史 | `"高血壓、輕度失智"` |
| medications | L | 用藥清單 | `["降血壓藥"]` |
| allergies | L | 過敏資訊 | `["海鮮過敏"]` |
| emergency_contact | S | 緊急聯絡人 | `"陳小明（孫子）"` |
| emergency_phone | S | 緊急聯絡電話 | `"09XX-XXX-XXX"` |
| preferences | M | 個人偏好 | `{"wake_time": "06:00", ...}` |
| family_info | M | 家庭資訊 | `{"children": "一子一女", ...}` |
| created_at | S | 建立時間 | `"2026-01-01T00:00:00Z"` |
| updated_at | S | 更新時間 | `"2026-07-30T10:00:00Z"` |

### 容量模式
- **PAY_PER_REQUEST** (On-Demand)
- 預期讀取量低，使用按需計費最經濟

### 存取模式

| 操作 | 方法 | 頻率 |
|------|------|------|
| 取得長者資料 | GetItem(elder_id) | 每次對話 |
| 更新長者資料 | UpdateItem(elder_id) | 低頻 |
| 新增長者 | PutItem | 低頻 |

---

## Table 2: `caremate-ai_elder_memory`

### 用途
儲存每次對話記錄及從對話中擷取的生活紀錄（睡眠、飲食、運動、服藥、情緒）。

### Key Schema

| 屬性名稱 | 類型 | Key Type |
|----------|------|----------|
| elder_id | String (S) | Partition Key (HASH) |
| timestamp | String (S) | Sort Key (RANGE) |

### 屬性定義

| 欄位 | 類型 | 說明 | 範例 |
|------|------|------|------|
| elder_id | S | 長者唯一識別碼 | `"elder-001"` |
| timestamp | S | ISO 8601 時間戳 | `"2026-07-30T08:30:00Z"` |
| question | S | 使用者訊息 | `"我今天早上吃了稀飯"` |
| answer | S | AI 回應 | `"很好呢！有沒有配菜？"` |
| sleep | S | 睡眠紀錄 | `"昨晚睡了7小時"` |
| food | S | 飲食紀錄 | `"早餐吃稀飯配蛋"` |
| activity | S | 活動紀錄 | `"散步15分鐘"` |
| drug | S | 服藥紀錄 | `"降血壓藥已服用"` |
| emotion | S | 情緒狀態 | `"開心"` |
| ttl | N | TTL 過期時間 (Unix timestamp) | `1756713600` |

### 容量模式
- **PAY_PER_REQUEST** (On-Demand)

### TTL 設定
- 啟用 TTL，屬性名稱：`ttl`
- 自動清除 90 天以上的記錄
- 計算方式：`ttl = 當前時間 + 90天` (Unix epoch seconds)

### 存取模式

| 操作 | 方法 | 頻率 |
|------|------|------|
| 儲存對話 | PutItem(elder_id, timestamp) | 每次對話 |
| 取得近期記憶 | Query(elder_id, timestamp >= 7天前) | 每次對話前 |
| 取得指定日期紀錄 | Query(elder_id, timestamp BETWEEN ...) | 產生摘要時 |
| 歷史對話瀏覽 | Query(elder_id, ScanIndexForward=False) | 低頻 |

### 查詢範例

```python
# 取得近 7 天記憶
response = table.query(
    KeyConditionExpression="elder_id = :eid AND #ts >= :cutoff",
    ExpressionAttributeNames={"#ts": "timestamp"},
    ExpressionAttributeValues={
        ":eid": "elder-001",
        ":cutoff": "2026-07-23T00:00:00Z"
    },
    ScanIndexForward=False,
    Limit=50
)
```

---

## 安全性設定

| 設定 | 值 | 說明 |
|------|-----|------|
| 靜態加密 | SSE (AWS Owned Key) | 所有 PII 資料加密 |
| 時間點回復 | 啟用 | 支援 35 天內任意時間回復 |
| IAM 存取控制 | Least Privilege | 僅 Lambda Role 有存取權限 |
| VPC Endpoint | 建議啟用 | 生產環境透過 VPC 存取 |

---

## 容量估算

### 假設
- 每位長者每日平均 10 次對話
- 服務 100 位長者
- 每筆記錄約 500 bytes

### 估算
- 每日寫入：100 × 10 = 1,000 次
- 每日讀取：100 × 10 × 2 = 2,000 次（每次對話載入記憶）
- 月儲存量：1,000 × 500B × 30 = 15 MB/月

### 費用估算（us-west-2）
- 寫入：$1.25/百萬 × 0.03M = ~$0.04/月
- 讀取：$0.25/百萬 × 0.06M = ~$0.02/月
- 儲存：$0.25/GB × 0.015GB = ~$0.004/月
- **月估計費用：< $1 USD**

---

## 資料遷移注意事項

1. 新增欄位無需修改表結構（Schema-less）
2. 變更 Key Schema 需建立新表並遷移資料
3. 建議使用 DynamoDB Streams 做資料同步或觸發事件
