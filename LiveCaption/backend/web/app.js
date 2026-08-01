/**
 * 麥克風 → WebSocket → 字幕。
 *
 * 音訊格式固定 PCM16 / 16 kHz / mono，這是 Transcribe Streaming 唯一接受的格式。
 * 做法是直接用 sampleRate: 16000 建 AudioContext，讓瀏覽器負責重取樣，
 * 前端就不用自己寫重取樣器。
 */

const el = (id) => document.getElementById(id);

const ui = {
  preset: el("preset"),
  lang: el("lang"),
  engine: el("engine"),
  start: el("start"),
  stop: el("stop"),
  meter: el("meter"),
  dot: el("dot"),
  state: el("state"),
  sEngine: el("s-engine"),
  sRegion: el("s-region"),
  sLang: el("s-lang"),
  sSent: el("s-sent"),
  error: el("error"),
  captions: el("captions"),
  placeholder: el("placeholder"),
  partial: el("partial"),
};

const SAMPLE_RATE = 16000;
const CHUNK_MS = 100;

let ws = null;
let audioContext = null;
let mediaStream = null;
let workletNode = null;
let sourceNode = null;
let sentSeconds = 0;
let finishing = false;

// --------------------------------------------------------------------------- //
// 畫面
// --------------------------------------------------------------------------- //

function setState(text, kind = "") {
  ui.state.textContent = text;
  ui.dot.className = `dot ${kind}`;
}

function showError(message) {
  ui.error.textContent = message || "";
}

function renderLevel(dbfs) {
  // -60 dBFS ~ 0 dBFS 映射到 0% ~ 100%
  const ratio = Number.isFinite(dbfs) ? Math.max(0, Math.min(1, (dbfs + 60) / 60)) : 0;
  ui.meter.style.width = `${(ratio * 100).toFixed(1)}%`;
  ui.meter.style.backgroundColor =
    dbfs > -6 ? "var(--bad)" : dbfs > -25 ? "var(--good)" : "var(--warn)";
}

function renderPartial(message) {
  ui.partial.textContent = message.original || "";
}

function renderFinal(message) {
  ui.placeholder?.remove();
  ui.partial.textContent = "";

  const p = document.createElement("p");
  p.className = "final";

  const meta = document.createElement("span");
  meta.className = "meta";
  const bits = [`${message.startTime.toFixed(1)}s`];
  if (message.lang) bits.push(message.lang);
  if (message.speakers?.length) bits.push(`語者 ${message.speakers.join("/")}`);
  if (message.confidence != null) bits.push(`信賴度 ${message.confidence.toFixed(2)}`);
  meta.textContent = bits.join(" · ");

  p.appendChild(meta);
  p.appendChild(document.createTextNode(message.original));
  ui.captions.appendChild(p);
  ui.captions.scrollIntoView({ block: "end", behavior: "smooth" });
}

// --------------------------------------------------------------------------- //
// 連線
// --------------------------------------------------------------------------- //

function buildWsUrl() {
  const params = new URLSearchParams({ preset: ui.preset.value });
  if (ui.lang.value) params.set("lang", ui.lang.value);
  if (ui.engine.value) params.set("engine", ui.engine.value);

  const scheme = location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${location.host}/ws/captions?${params}`;
}

function handleMessage(event) {
  const message = JSON.parse(event.data);

  switch (message.type) {
    case "ready":
      ui.sEngine.textContent = message.engine;
      ui.sRegion.textContent = message.region;
      ui.sLang.textContent = message.language.startsWith("auto:")
        ? "自動辨識"
        : message.language;
      setState("正在聆聽", "live");
      break;
    case "partial":
      renderPartial(message);
      break;
    case "final":
      renderFinal(message);
      break;
    case "done":
      setState("已結束");
      console.info("指標", message.stats);
      break;
    case "error":
      showError(message.message);
      setState("發生錯誤", "error");
      break;
    default:
      console.warn("未知訊息", message);
  }
}

// --------------------------------------------------------------------------- //
// 錄音
// --------------------------------------------------------------------------- //

async function start() {
  showError("");
  ui.start.disabled = true;
  finishing = false;
  sentSeconds = 0;
  ui.sSent.textContent = "0.0";
  setState("連線中…");

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch (err) {
    showError(`拿不到麥克風權限：${err.message}`);
    setState("尚未開始", "error");
    ui.start.disabled = false;
    return;
  }

  audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
  await audioContext.audioWorklet.addModule("/static/pcm-worklet.js");

  ws = new WebSocket(buildWsUrl());
  ws.binaryType = "arraybuffer";
  ws.onmessage = handleMessage;
  ws.onerror = () => showError("WebSocket 連線失敗");
  ws.onclose = () => {
    if (!finishing) setState("連線已關閉");
    cleanupAudio();
    ui.start.disabled = false;
    ui.stop.disabled = true;
    renderLevel(-Infinity);
  };

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.addEventListener("error", reject, { once: true });
  });

  sourceNode = audioContext.createMediaStreamSource(mediaStream);
  workletNode = new AudioWorkletNode(audioContext, "pcm-chunker", {
    numberOfOutputs: 0,
    processorOptions: { chunkMs: CHUNK_MS },
  });

  workletNode.port.onmessage = ({ data }) => {
    renderLevel(data.dbfs);
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(data.pcm);
      sentSeconds += data.pcm.byteLength / 2 / SAMPLE_RATE;
      ui.sSent.textContent = sentSeconds.toFixed(1);
    }
  };

  sourceNode.connect(workletNode);
  ui.stop.disabled = false;
}

function cleanupAudio() {
  workletNode?.port.close();
  sourceNode?.disconnect();
  workletNode?.disconnect();
  mediaStream?.getTracks().forEach((track) => track.stop());
  audioContext?.close();
  workletNode = null;
  sourceNode = null;
  mediaStream = null;
  audioContext = null;
}

function stop() {
  finishing = true;
  ui.stop.disabled = true;
  setState("收尾中…");

  // 先停止送音訊，再通知後端收完剩下的 final
  sourceNode?.disconnect();
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "stop" }));
  }
  mediaStream?.getTracks().forEach((track) => track.stop());
  renderLevel(-Infinity);
}

ui.start.addEventListener("click", () => {
  start().catch((err) => {
    showError(String(err.message || err));
    setState("發生錯誤", "error");
    ui.start.disabled = false;
  });
});

ui.stop.addEventListener("click", stop);

// 開頁時顯示後端目前的預設值
fetch("/api/config")
  .then((response) => response.json())
  .then((config) => {
    ui.sEngine.textContent = config.engine;
    ui.sRegion.textContent = config.region;
  })
  .catch(() => showError("讀不到後端設定，確認伺服器是否啟動"));
