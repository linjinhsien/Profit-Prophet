/**
 * Float32 → PCM16 轉換與切塊。
 *
 * AudioContext 本身已經用 sampleRate: 16000 建立，瀏覽器會幫我們重取樣，
 * 所以這裡只負責兩件事：轉成 16-bit 整數、湊滿一個 chunk 再送出。
 * 音量（dBFS）順手一起算，前端拿去畫音量條。
 */
class PcmChunker extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const chunkMs = options?.processorOptions?.chunkMs ?? 100;
    this.chunkSamples = Math.max(1, Math.round((sampleRate * chunkMs) / 1000));
    this.buffer = new Int16Array(this.chunkSamples);
    this.filled = 0;
    this.sumSquares = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) {
      return true;
    }

    for (let i = 0; i < channel.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, channel[i]));
      this.buffer[this.filled] = Math.round(sample * 32767);
      this.sumSquares += sample * sample;
      this.filled += 1;

      if (this.filled === this.chunkSamples) {
        const rms = Math.sqrt(this.sumSquares / this.chunkSamples);
        const chunk = this.buffer.slice();
        this.port.postMessage(
          { pcm: chunk.buffer, dbfs: rms > 0 ? 20 * Math.log10(rms) : -Infinity },
          [chunk.buffer],
        );
        this.filled = 0;
        this.sumSquares = 0;
      }
    }

    return true;
  }
}

registerProcessor("pcm-chunker", PcmChunker);
