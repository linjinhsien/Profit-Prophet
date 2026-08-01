import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly'
import { getCoreAwsConfig } from '../lib/config'
import { getCredentialsProvider } from '../lib/credentials'
import { toServiceError } from '../lib/serviceErrors'

const MAX_SEGMENT_LENGTH = 3000

function splitForPolly(text: string): string[] {
  const sentences = text.match(/[^。！？.!?]+[。！？.!?]?/g) ?? [text]
  const segments: string[] = []
  let segment = ''

  for (const sentence of sentences) {
    const normalized = sentence.trim()

    if (normalized.length === 0) {
      continue
    }

    if (normalized.length > MAX_SEGMENT_LENGTH) {
      if (segment !== '') {
        segments.push(segment)
        segment = ''
      }

      for (let index = 0; index < normalized.length; index += MAX_SEGMENT_LENGTH) {
        segments.push(normalized.slice(index, index + MAX_SEGMENT_LENGTH))
      }

      continue
    }

    if ((segment + normalized).length > MAX_SEGMENT_LENGTH) {
      segments.push(segment)
      segment = normalized
    } else {
      segment += normalized
    }
  }

  if (segment !== '') {
    segments.push(segment)
  }

  return segments
}

export async function synthesizeSpeech(text: string): Promise<Blob> {
  const normalized = text.trim()

  if (normalized.length === 0) {
    throw new Error('沒有可轉換為語音的文字。')
  }

  try {
    const config = getCoreAwsConfig()
    const client = new PollyClient({
      region: config.region,
      credentials: getCredentialsProvider(),
    })
    const audioParts: ArrayBuffer[] = []

    for (const segment of splitForPolly(normalized)) {
      const response = await client.send(
        new SynthesizeSpeechCommand({
          Engine: 'neural',
          LanguageCode: 'cmn-CN',
          OutputFormat: 'mp3',
          SampleRate: '16000',
          Text: segment,
          VoiceId: 'Zhiyu',
        }),
      )

      if (response.AudioStream === undefined) {
        throw new Error('Polly 沒有回傳音訊資料。')
      }

      const bytes = await response.AudioStream.transformToByteArray()
      const audioBuffer = new ArrayBuffer(bytes.byteLength)
      new Uint8Array(audioBuffer).set(bytes)
      audioParts.push(audioBuffer)
    }

    return new Blob(audioParts, { type: 'audio/mpeg' })
  } catch (error) {
    throw toServiceError('polly', error)
  }
}
