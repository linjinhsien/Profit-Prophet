#!/usr/bin/env bash
# 用 macOS 內建的 say + afconvert 產生長照情境的測試音檔。
# 不需要安裝 ffmpeg 或任何額外工具。
#
# 用法：
#   ./examples/make_sample_audio.sh            # 產生全部
#   ./examples/make_sample_audio.sh clinic     # 只產生看診情境
#
# 輸出：samples/*.wav（PCM16 / 16 kHz / mono，Transcribe Streaming 可直接吃）
#
# 註：變數一律用 ${VAR} 大括號寫法。macOS 內建的 bash 3.2 在 $VAR 後面
#     緊接中文字時會把多位元組字元的第一個 byte 當成變數名的一部分。

set -euo pipefail

OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/samples"
mkdir -p "${OUT_DIR}"

# 台灣中文語音。Meijia 是 macOS 內建的 zh_TW 女聲。
VOICE_ZH="${VOICE_ZH:-Meijia}"

generate() {
  local name="$1"
  local text="$2"
  local aiff="${OUT_DIR}/${name}.aiff"
  local wav="${OUT_DIR}/${name}.wav"

  if ! say -v "${VOICE_ZH}" -o "${aiff}" "${text}" 2>/dev/null; then
    echo "  跳過 ${name}: 找不到語音 '${VOICE_ZH}'" >&2
    echo "  可用的中文語音:" >&2
    say -v '?' | grep -iE 'zh_(TW|CN)' | sed 's/^/    /' >&2
    return 1
  fi

  # 轉成 Transcribe Streaming 要的格式: 16 kHz / 單聲道 / 16-bit LE PCM
  afconvert -f WAVE -d LEI16@16000 -c 1 "${aiff}" "${wav}"
  rm -f "${aiff}"

  local bytes
  local seconds
  bytes=$(stat -f%z "${wav}")
  seconds=$(( (bytes - 44) / 32000 ))
  echo "  ${name}.wav  約 ${seconds} 秒"
}

WANTED="${1:-}"

want() {
  [ -z "${WANTED}" ] || [ "${WANTED}" = "$1" ]
}

echo "產生長照情境測試音檔"
echo "語音: ${VOICE_ZH}"
echo "輸出: ${OUT_DIR}"
echo

if want clinic; then
  generate clinic \
"阿嬤，你的血壓有一點高，收縮壓一百五十二，舒張壓九十四。醫師說要繼續吃降血壓的藥，早上飯後一顆。下個月再回來複診。" || true
fi

if want elder; then
  generate elder \
"我今天早上覺得頭有點暈，胸口悶悶的，站起來的時候差一點跌倒。晚上也睡不太好。" || true
fi

if want handover; then
  generate handover \
"交班報告。三號床的陳阿嬤今天早餐吃了八分滿，中午有喝完一碗湯。血氧維持在九十七到九十八。下午兩點有做被動關節運動。晚上要記得幫她翻身拍背。" || true
fi

echo
echo "接著這樣試（profile 與區域已寫在 backend/.env）:"
echo '  ../.venv/bin/python examples/transcribe_demo.py --wav samples/clinic.wav'
