# Amazon Transcribe Streaming 介面層

安心聽 CareCaption（長照即時字幕）的語音辨識層。取代原本 `main.py` 裡的
Sherpa-ONNX + SenseVoice 本機辨識，改走 Amazon Transcribe Streaming。

## 三行就能用

```python
from app.services.transcribe import RecognizerConfig, open_recognizer

recognizer = await open_recognizer(RecognizerConfig(language_code="zh-TW"))
async with recognizer:
    await recognizer.send_audio(pcm16_bytes)          # 丟音訊進去
    async for segment in recognizer.segments():       # 拿字幕出來
        print(segment.text, segment.is_partial)
```

`send_audio()` 與 `segments()` 是獨立的兩條路，所以 WebSocket 端點可以一邊收
瀏覽器的音訊、一邊把字幕推回去，互不阻塞。實務上會長這樣：

```python
async def handle_ws(websocket):
    recognizer = await open_recognizer(build_recognizer_config("caregiver"))
    async with recognizer:
        async def push_captions():
            async for segment in recognizer.segments():
                await websocket.send_json(segment.as_message())

        pusher = asyncio.create_task(push_captions())
        async for pcm16 in websocket.iter_bytes():
            await recognizer.send_audio(pcm16)
        await recognizer.stop()
        await pusher
```

`CaptionSegment.as_message()` 直接產出前端要的 JSON
（`type` / `original` / `lang` / `segmentId` …），不需要另外寫轉換。

## 為什麼是這些預設值

介面的預設值不是抄文件範例，是對著長照現場的四個問題調的。

| 長照現場的問題 | 介面怎麼處理 |
| --- | --- |
| 長者講話慢、停頓長達數十秒，Transcribe 收不到音訊就斷線 | `silence_keepalive` 閒置 3 秒起自動補靜音幀，維持連線 |
| partial 結果反覆改寫，字幕在螢幕上跳動，長者根本讀不完 | 預設開啟 `enable_partial_results_stabilization` 並設 `high`，已辨識的字不再變動 |
| 印尼／越南籍照服員與長者混講，無法事先指定語言 | `identify_language` 自動判定，候選語言預設含 zh-TW / id-ID / vi-VN / en-US / ja-JP / th-TH |
| 交班記錄需要分辨「照服員說的」還是「長者說的」 | `show_speaker_label` 產生語者標籤，寫進 `CaptionSegment.speakers` |

另外三個常見的坑，在設定階段就擋掉，不會等到連線才失敗：

- **台北區域（`ap-east-2`）沒有 Transcribe Streaming** — 建立設定時直接丟出
  `TranscribeUnavailableError` 並建議改用 `ap-northeast-1`（東京）。
- **自動語言辨識時不能同時指定 `language_code`** — Transcribe 會回
  `BadRequestException`，這裡在 `RecognizerConfig.validate()` 就攔下。
- **自動語言辨識時詞彙參數要用複數形式** — `to_request_kwargs()` 會自動把
  `vocabulary_name` 轉成 `vocabulary_names`。

## 三種長照情境

用 `build_recognizer_config(preset)` 取得調好的設定：

| preset | 場景 | 語言 | 語者標籤 | 字幕穩定度 |
| --- | --- | --- | --- | --- |
| `caregiver` | 照服員與長者溝通 | 自動辨識 | 開 | high |
| `clinic` | 看診、衛教說明 | 固定 zh-TW | 開 | high |
| `elder` | 長者自己使用 | 固定 zh-TW | 關 | medium（延遲較低） |

環境變數可以覆寫任一項，清單見 `.env.example`。

## 沒有 AWS 憑證也能跑

`engine="auto"` 有兩層退場機制，因為「環境裡有憑證」和「憑證真的有效」是兩件事：

1. `create_recognizer()` 先看環境有沒有憑證跡象（環境變數、`~/.aws`、Task Role）。
   完全沒有就直接給 Mock。
2. `open_recognizer()` 真的去連。若連線時才發現憑證無效（例如機器上有
   `~/.aws` 卻沒設好、在本機誤走 IMDS），會接住錯誤退回 Mock。

`MockStreamingRecognizer` 依照長照對話腳本吐出 partial → final，節奏與真實服務
一致，且介面完全相同。黑客松現場網路不通或權限還沒開時，Demo 不會開天窗。

`engine="aws"` 則不退場，錯誤直接往上丟——正式部署要用這個，
才不會在生產環境靜默降級成假資料。

引擎也可以用環境變數指定：`CARECAPTION_ASR_ENGINE=auto|aws|mock`。

## 音訊格式

Transcribe Streaming 只吃 **PCM16 / 16 kHz（或 8 kHz）/ 單聲道**。
前端 AudioWorklet 應該直接輸出這個格式；來源格式不對時用 `app.audio.pcm` 轉：

```python
from app.audio.pcm import AudioFormat, to_pcm16, CARE_AUDIO_FORMAT

pcm16 = to_pcm16(raw, AudioFormat(sample_rate_hz=44_100, channels=2), CARE_AUDIO_FORMAT)
```

`rms_dbfs()` 另外提供音量值，前端可以拿去畫超大的音量條 —— 讓長者一眼看出
「麥克風有沒有收到我的聲音」，比純文字提示有效得多。

## 安裝

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt

# 選用：要用麥克風即時試講才需要
.venv/bin/pip install sounddevice
```

## 設定：先建一份 .env

AWS profile 與區域寫在 `backend/.env`，之後所有指令都不用再帶這些參數。

```bash
cd backend
cp .env.example .env
```

至少要確認這三行：

```ini
AWS_PROFILE=你的profile名稱          # 對應 ~/.aws/credentials 裡的名稱
CARECAPTION_AWS_REGION=us-west-2    # 要確認這個區域你的角色有權限
CARECAPTION_ASR_ENGINE=aws          # 預設走真實 AWS
```

`.env` 只放 profile 名稱與區域，**沒有任何金鑰**；金鑰仍由 `~/.aws/credentials`
管理。此檔已被 `.gitignore` 排除。

已存在的環境變數優先於 `.env`，所以臨時覆寫仍然有效：

```bash
AWS_PROFILE=other ../.venv/bin/python examples/transcribe_demo.py --wav samples/clinic.wav
```

要完全忽略 `.env` 就加 `--no-dotenv`。

## 試用（三個階段，由易到難）

以下指令都在 `backend/` 目錄下執行。

### 階段一：離線看效果，不需要 AWS、不花錢

```bash
../.venv/bin/python examples/transcribe_demo.py --engine mock --preset caregiver --seconds 15
```

會依長照對話腳本吐出 partial → final，節奏與真實服務一致。
`caregiver` 情境會示範自動語言辨識，所以腳本裡混了中文、印尼語、越南語。

### 階段二：對著麥克風講話

先確認麥克風抓得到（`--engine mock` 不花錢）：

```bash
../.venv/bin/python examples/transcribe_demo.py --list-devices    # 看有哪些麥克風
../.venv/bin/python examples/transcribe_demo.py --mic --engine mock --seconds 20
```

畫面上會有一條即時音量條，講話時會變長。這條在正式產品裡會是螢幕上很粗的
橫條，讓長者確認「機器聽得到我」。

確認沒問題就打真的（`.env` 已指定 profile 與區域，不用再帶參數）：

```bash
../.venv/bin/python examples/transcribe_demo.py --mic --seconds 30
```

macOS 第一次執行會請求麥克風權限，要按允許。按 Ctrl-C 可提前結束，
已辨識的逐字稿會保留。

### 階段三：用音檔跑真實 AWS

沒有現成音檔的話，用 macOS 內建的 `say` 產生長照情境的測試音（不需要 ffmpeg）：

```bash
./examples/make_sample_audio.sh
```

會在 `samples/` 產生三個 16 kHz/mono/PCM16 的 WAV：
`clinic.wav`（看診說明）、`elder.wav`（長者主述不適）、`handover.wav`（交班報告）。

```bash
../.venv/bin/python examples/transcribe_demo.py --wav samples/clinic.wav
```

WAV 不是 16 kHz/mono 也沒關係，示範腳本會自動降混與重取樣。

想換情境或語言：

```bash
# 交班報告，開語者標籤
../.venv/bin/python examples/transcribe_demo.py --wav samples/handover.wav --speaker-labels

# 自動判斷語言（中／印尼／越南／英）
../.venv/bin/python examples/transcribe_demo.py --wav samples/elder.wav --auto
```

### 階段四：瀏覽器介面

最接近實際產品的形式 —— 大字幕、即時音量條、一顆開始按鈕。

```bash
../.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

然後開 <http://127.0.0.1:8000>，按「開始說話」。
AWS profile 與區域同樣讀 `.env`，指令不用帶參數。

瀏覽器端用 `AudioContext({ sampleRate: 16000 })` 讓瀏覽器負責重取樣，
再由 AudioWorklet 切成 100 ms 的 PCM16 幀送上 WebSocket，
所以前端不需要自己寫重取樣器。

> **安全性**：`/ws/captions` 沒有任何身分驗證，任何連得到這個埠的人都能
> 消耗你的 AWS 額度。所以預設綁 `127.0.0.1`。要對外開放（例如放到 EC2
> 或 App Runner）之前，必須先加上身分驗證與連線數限制。

## 網頁介面

想直接用瀏覽器對著麥克風看字幕，就跑 WebSocket 服務：

```bash
cd backend
AWS_PROFILE=profit-prophet CARECAPTION_AWS_REGION=us-west-2 \
  ../.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

開 <http://127.0.0.1:8000>，選情境／語言／引擎後按「開始說話」。
黃字是辨識中的 partial，白字是定稿，上方有音量條與已送出秒數。

| 端點 | 用途 |
| --- | --- |
| `GET /` | 字幕頁面 |
| `GET /api/config` | 目前的引擎、區域、可用情境 |
| `WS /ws/captions` | 收 PCM16 二進位幀，推回字幕 JSON |

WebSocket 支援的查詢參數：`preset` / `lang`（語言代碼或 `auto`）/ `engine`
（`auto`｜`aws`｜`mock`）/ `speakers` / `region`，語意與 CLI 參數一致。
送 `{"type":"stop"}` 表示講完了，服務端會收完剩下的 final 再回 `done`（含指標）。

前端用 `sampleRate: 16000` 建 `AudioContext`，讓瀏覽器負責重取樣，
AudioWorklet（`web/pcm-worklet.js`）只做 Float32 → PCM16 與切塊，順手算音量。

> **這個端點沒有身分驗證。** 任何連得到這個埠的人都能消耗你的 AWS 額度，
> 所以預設只綁 `127.0.0.1`。要對外開放必須先加上驗證與連線數限制。

### 常用參數

| 參數 | 說明 |
| --- | --- |
| `--engine mock/aws/auto` | 選引擎。`mock` 不花錢，`aws` 打真實服務。未指定時用 `.env` 的值 |
| `--preset caregiver/clinic/elder` | 長照情境預設值 |
| `--mic` / `--wav <path>` | 音訊來源 |
| `--list-devices` | 列出可用麥克風 |
| `--device <編號或名稱>` | 指定麥克風 |
| `--lang zh-TW` | 固定語言 |
| `--auto` | 自動判斷語言（中／印尼／越南／英…） |
| `--region us-west-2` | 覆寫 `.env` 的區域 |
| `--speaker-labels` | 開啟語者標籤 |
| `--seconds N` | 麥克風錄音上限；沒給音檔時是合成音訊長度 |
| `--fast` | 不依真實時間節奏（只適合 mock） |
| `--no-dotenv` | 忽略 `backend/.env` |

設定的優先順序是：**指令參數 > `.env` / 環境變數 > 情境預設值**。
所以 `.env` 裡不要寫死 `CARECAPTION_SOURCE_LANG`，
否則 `--preset caregiver` 的自動語言辨識會被蓋掉。

費用參考：Transcribe Streaming 約 US$0.024/分鐘。
`samples/clinic.wav` 跑一次 12.6 秒約 US$0.005。

## 速度與正確率怎麼調

`examples/bench_latency.py` 會依真實時間節奏送音訊，量「字幕抵達時間 − 該段音訊
結束時間」，也就是長者從話講完到看到字要等多久，並用 CER（字元錯誤率）對照正確率。

```bash
cd backend
AWS_PROFILE=profit-prophet ../.venv/bin/python examples/bench_latency.py \
  --wav samples/clinic.wav --region us-west-2 --repeat 3 \
  --expect "阿嬤，你的血壓有一點高，收縮壓一百五十二，舒張壓九十四。…"
```

clinic.wav（12.6 秒，us-west-2，每組 ×3）量到的結果：

| 調整 | 字幕平均落後 | 首個 final | CER | 結論 |
| --- | --- | --- | --- | --- |
| 語者標籤 **關**（現為預設） | **0.17s** | **0.37s** | 4.0% | 快 2.6 倍，正確率不變 |
| 語者標籤 開 | 0.44s | 0.99s | 4.0% | 只有需要「誰說的」時才值得 |
| 穩定化 high → low | 0.45s | 0.97s | 4.0% | 沒有變快，不要為了速度關掉 |
| 音訊塊 100ms → 50ms | 0.81s | 1.12s | 4.0% | 更慢，請求數變多沒好處 |
| 音訊塊 100ms → 20ms | 0.51s | 0.87s | 4.0% | 同上 |
| Custom Vocabulary | 0.63s | 1.11s | 4.0% | 對合成語音沒幫助，需真人語音再評估 |

三個反直覺的地方值得記住：

1. **語者標籤是最大的延遲來源**，不是字幕穩定化。開啟後 Transcribe 走不同的
   後處理路徑，延遲變 2.6 倍，而且輸出會失去數字正規化（「一百五十二」而非
   「152」）與全角標點。所以 `clinic` 與 `elder` 都關閉；要留交班記錄，
   用 `caregiver` 情境或事後跑批次辨識，不要拖累即時字幕。
2. **字幕穩定化是免費的**。`high` 與 `low` 的延遲差異在雜訊範圍內，
   所以維持 `high` 讓字不跳動，沒有代價。
3. **音訊塊縮小只會變慢**。100ms 已經是對的值。

還沒能量、但確定有效的兩件事：

- **區域**。台灣連東京比連奧勒岡快：`transcribestreaming` 端點 connect
  0.12s vs 0.21s。正式部署用 `ap-northeast-1`。
  （workshop 帳號的 `ws-default-policy` 明確拒絕東京，所以測試只能在 us-west-2。）
- **真人語音**。`samples/*.wav` 是 macOS `say` 合成的，韻律偏平，
  Custom Vocabulary 這類「靠聲學相似度比對」的功能在合成語音上評不出效果。
  要調術語準確度請先錄真人音檔。

## 換一個辨識引擎：ElevenLabs Scribe

`StreamingRecognizer` 是抽象介面，所以多一個引擎不用改上層任何程式碼 ——
WebSocket 端點、CLI 示範、延遲量測都是加一個 `--engine` 就換完。

```bash
export ELEVENLABS_API_KEY=...          # https://elevenlabs.io/app/settings/api-keys

cd backend
../.venv/bin/python examples/transcribe_demo.py \
  --engine elevenlabs --wav samples/clinic.wav --lang zh-TW

# 兩家對打，同一支量測工具、同一個指標
../.venv/bin/python examples/bench_latency.py --wav samples/clinic.wav \
  --engine elevenlabs --keyterms 鼻胃管,抽痰,阿嬤 --expect "阿嬤，你的血壓…"
```

網頁介面的「引擎」選單也多了一個 `elevenlabs` 選項。

`auto` 刻意不會挑 ElevenLabs：它需要另一組付費金鑰，不該在使用者沒明確要求時
被動用。`engine="elevenlabs"` 缺金鑰會直接丟 `ElevenLabsUnavailableError`，
不會靜默降級成假資料。

### 兩邊的實質差異

| | Amazon Transcribe | ElevenLabs Scribe v2 Realtime |
| --- | --- | --- |
| 語言代碼 | `zh-TW`（BCP-47，可指定繁體） | `zh`（ISO 639-1，繁簡由模型自行判斷） |
| 術語強化 | 先在主控台建 Custom Vocabulary，再用名稱引用 | `keyterms` 直接內嵌，不需建立資源 |
| 斷句 | 服務端決定何時給 final | `commit_strategy=vad` 或手動 commit |
| 語者／信賴度 | 一般結果就帶 | 只在 `include_timestamps=true` 的事件裡 |
| 取樣率 | 8k / 16k | 8k / 16k / 22.05k / 24k / 44.1k / 48k |

實作上因此有三個對應處理，都寫在 `app/services/elevenlabs_stt.py`：

- `_to_iso_language()` 把 `zh-TW` 轉成 `zh`。代價是失去繁體的明確指定。
- `show_speaker_label=True` 時才要求時間戳，並且 final 只認帶時間戳的那個事件，
  避免同一句被送兩次。這跟 Transcribe 的語者標籤一樣要付延遲代價。
- `stop()` 會補一個靜音幀並手動 `commit=true`。VAD 可能還在等靜音才斷句，
  不補的話講完最後一句直接關連線會掉字。

`RecognizerConfig` 的音訊驗證取兩者的最嚴格交集（8k/16k），所以即使 Scribe
支援 44.1k 也建不出那樣的設定。專案統一走 16 kHz，實務上不受影響。

### 驗證

```bash
../.venv/bin/python examples/verify_elevenlabs.py   # 61 項，不需金鑰、不連網
```

注入假的 WebSocket 吐出官方文件記載的事件格式，驗設定→查詢參數的對應、
事件→`CaptionSegment` 的轉換、錯誤分類（`auth_error` / `quota_exceeded` /
`unaccepted_terms` 歸類為可退場，其餘照實往上丟）、保活、`stop()` 的手動 commit。

## 驗證


前三支不需要 AWS 憑證，共 90 項檢查：

```bash
cd backend

# 設定 → 實際 HTTP header 的對應是否正確、錯誤設定是否被擋下
../.venv/bin/python examples/verify_interface.py

# 串流生命週期：切塊、partial/final 解析、保活、收尾、錯誤轉譯
../.venv/bin/python examples/verify_stream_lifecycle.py

# .env 載入行為：優先順序、格式解析、缺檔容錯
../.venv/bin/python examples/verify_dotenv.py

# WebSocket 端到端（會自己啟動 uvicorn，不需要瀏覽器）
../.venv/bin/python examples/verify_websocket.py --engine mock

# 同上但打真實 AWS 與真實語音（約 US$0.005）
../.venv/bin/python examples/verify_websocket.py --engine aws --wav samples/clinic.wav --realtime
```

`verify_interface.py` 會把設定送進 SDK 真正的序列化器，印出 AWS 端會收到的
`x-amzn-transcribe-*` header，所以能在還沒開通權限前就確認參數組得對。
它會忽略 `CARECAPTION_*` 環境變數，確保結果不受本機 `.env` 影響。

`verify_stream_lifecycle.py` 注入假串流，但事件物件用 SDK 真正的 model 類別，
所以驗到的是實際會跑的解析邏輯：切塊大小、partial/final、語者去重、信賴度平均、
閒置保活、`stop()` 收尾、憑證失效退場。

## IAM 權限

執行角色需要：

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "transcribe:StartStreamTranscription",
      "Resource": "*"
    }
  ]
}
```

掛在 EC2 Instance Role 或 ECS/Fargate Task Role 上。憑證走預設鏈，
不要把 Access Key 寫進程式碼或 `.env` 後 commit。

## 檔案

```
backend/
├── app/
│   ├── audio/pcm.py            PCM16 驗證／降混／重取樣／音量
│   ├── audio/microphone.py     麥克風擷取（選用，開發與 Demo 用）
│   ├── services/transcribe.py  ★ Transcribe Streaming 介面
│   ├── services/elevenlabs_stt.py  ElevenLabs Scribe v2 Realtime 引擎
│   ├── config.py               環境變數 → RecognizerConfig
│   └── main.py                 FastAPI：字幕頁面 + WebSocket 端點
├── web/
│   ├── index.html              字幕介面（大字體、高對比）
│   ├── app.js                  麥克風擷取 → WebSocket → 字幕渲染
│   └── pcm-worklet.js          Float32 → PCM16 切塊與音量
└── examples/
    ├── transcribe_demo.py         可執行示範（麥克風 / WAV / 合成音訊 → 字幕）
    ├── bench_latency.py           延遲與 CER 量測（調參數前先量）
    ├── make_sample_audio.sh       用 macOS say 產生長照情境測試音檔
    ├── verify_interface.py        設定與序列化驗證
    ├── verify_dotenv.py           .env 讀取驗證
    ├── verify_stream_lifecycle.py 串流生命週期驗證
    ├── verify_elevenlabs.py       ElevenLabs Scribe 引擎驗證
    └── verify_websocket.py        WebSocket 端點驗證
```

## 介面一覽

```python
CaptionSegment       # 一段結果：text / is_partial / language / speakers / confidence
                     # .as_message() 直接轉成前端要的 JSON
RecognizerConfig     # 設定；建立時就驗證，錯的組合當場丟錯而不是等連線失敗
RecognizerStats      # 觀測指標：送出秒數、保活次數、partial/final 筆數

StreamingRecognizer  # 抽象介面
├── start()          #   開串流
├── send_audio(pcm)  #   丟音訊（自動切塊）
├── segments()       #   async iterator，拿字幕
├── stop()           #   收完剩餘 final 才關
└── aclose()         #   立即關閉

TranscribeStreamingRecognizer   # 真的打 AWS
MockStreamingRecognizer         # 離線 Demo，介面完全相同

create_recognizer(config, engine="auto")        # 只建立，不啟動
await open_recognizer(config, engine="auto")    # 建立並啟動，auto 模式含退場
```

上層只依賴 `StreamingRecognizer`，換引擎不用改程式碼。

## 疑難排解

**`[AccessDeniedException] ... explicit deny`**
權限被拒。除了確認角色有 `transcribe:StartStreamTranscription`，也要注意
**權限可能綁了區域條件**。工作坊或教學帳號常只開放單一區域，
換 `--region` 再試。實測過某個 workshop 角色在 `us-west-2` 可用、
`ap-northeast-1` 被明確拒絕。

**`Unable to locate credentials`**
`~/.aws/credentials` 裡沒有 `[default]`。用 `AWS_PROFILE=<profile 名稱>` 指定，
或設 `AWS_PROFILE` 環境變數。

**沒有取得任何 final 結果**
確認音訊裡真的有人聲。`--seconds` 產生的是合成正弦波，不是語音，
Transcribe 會正確地回空結果。用 `make_sample_audio.sh` 產生真的語音來測。

**辨識結果有錯字（例如「阿嬤」被聽成「好嗎」）**
這是通用模型對照護詞彙不熟。解法是建立 Custom Vocabulary 收錄
阿公、阿嬤、鼻胃管、抽痰、翻身拍背、血氧、日照中心、巴氏量表 等詞，
再用 `CARECAPTION_VOCABULARY_NAME` 指定。介面已經支援，
且會自動處理「自動語言辨識模式要用複數形式參數」這個限制。

**麥克風模式開不起來**
macOS 需要授權：系統設定 → 隱私權與安全性 → 麥克風，
勾選你執行指令的終端機程式。

## 已知限制

- 沒有做斷線自動重連與 backoff。`RecognizerConfig.session_id` 已預留給續接用。
- 單一辨識器對應單一使用者，多使用者隔離要在 WebSocket 層做。
- `resample_linear()` 是純 Python 線性插值，品質對語音辨識足夠；
  要更好可換 `soxr`，介面不用動。
- Transcribe Streaming 沒有台北區域。就近選東京 (`ap-northeast-1`)，
  但要先確認帳號權限沒有鎖區域。
