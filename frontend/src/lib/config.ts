export type AwsRegion = 'us-east-1' | 'us-west-2'

export interface CoreAwsConfig {
  region: AwsRegion
  identityPoolId: string
}

export interface BedrockConfig extends CoreAwsConfig {
  knowledgeBaseId: string
  modelArn: string
}

export interface ConversationConfig extends CoreAwsConfig {
  tableName: string
}

export class ConfigurationError extends Error {
  readonly missingKeys: string[]

  constructor(missingKeys: string[], message?: string) {
    super(message ?? `尚未取得 AWS 設定，請確認後端已啟動。缺少：${missingKeys.join('、')}`)
    this.name = 'ConfigurationError'
    this.missingKeys = missingKeys
  }
}

// --- 從後端動態載入設定 ---

interface RemoteConfig {
  region: string
  identityPoolId: string
  knowledgeBaseId: string
  modelArn: string
  tableName: string
  backendUrl: string
}

let cachedConfig: RemoteConfig | undefined
let fetchPromise: Promise<RemoteConfig> | undefined

async function fetchRemoteConfig(): Promise<RemoteConfig> {
  // 第一次呼叫時 cache 還沒有，用 env 或空字串
  const backendUrl = nonBlankValue(import.meta.env.VITE_BACKEND_URL) ?? ''
  const resp = await fetch(`${backendUrl}/api/aws-config`)

  if (!resp.ok) {
    throw new ConfigurationError([], `後端回傳錯誤 (${resp.status})，請確認 LiveCaption backend 已啟動。`)
  }

  const data: unknown = await resp.json()

  if (typeof data !== 'object' || data === null || 'error' in data) {
    const errorMsg = (data as { error?: string })?.error ?? '未知錯誤'
    throw new ConfigurationError([], `後端無法讀取設定：${errorMsg}`)
  }

  const config = data as RemoteConfig
  cachedConfig = config
  return config
}

/**
 * 取得遠端設定（快取）。首次呼叫會打 /api/aws-config。
 * 若後端未啟動，會拋出 ConfigurationError。
 */
export async function loadRemoteConfig(): Promise<RemoteConfig> {
  if (cachedConfig !== undefined) {
    return cachedConfig
  }

  if (fetchPromise === undefined) {
    fetchPromise = fetchRemoteConfig().finally(() => {
      fetchPromise = undefined
    })
  }

  return fetchPromise
}

// --- 同步版本（向後相容）---
// 優先用 VITE_* 環境變數（build time），若沒有就用快取的遠端設定

function nonBlankValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === '' || trimmed === undefined ? undefined : trimmed
}

function isAwsRegion(value: string | undefined): value is AwsRegion {
  return value === 'us-east-1' || value === 'us-west-2'
}

function getValueOrCached(envKey: string, cacheKey: keyof RemoteConfig): string | undefined {
  // 優先用 build-time 環境變數
  const envValue = nonBlankValue(import.meta.env[envKey])
  if (envValue !== undefined) return envValue

  // 退回用快取的遠端設定
  if (cachedConfig !== undefined) {
    const val = cachedConfig[cacheKey]
    return typeof val === 'string' && val.trim() !== '' ? val : undefined
  }

  return undefined
}

export function getCoreAwsConfig(): CoreAwsConfig {
  const regionValue = getValueOrCached('VITE_AWS_REGION', 'region')

  if (!isAwsRegion(regionValue)) {
    throw new ConfigurationError(
      ['VITE_AWS_REGION'],
      '尚未取得 AWS 區域設定。請確認後端已啟動並呼叫 loadRemoteConfig()。',
    )
  }

  const identityPoolId = getValueOrCached('VITE_COGNITO_IDENTITY_POOL_ID', 'identityPoolId')

  if (identityPoolId === undefined) {
    throw new ConfigurationError(['VITE_COGNITO_IDENTITY_POOL_ID'])
  }

  return { region: regionValue, identityPoolId }
}

export function getBedrockConfig(): BedrockConfig {
  const core = getCoreAwsConfig()
  const knowledgeBaseId = getValueOrCached('VITE_BEDROCK_KB_ID', 'knowledgeBaseId')
  const modelArn = getValueOrCached('VITE_BEDROCK_MODEL_ARN', 'modelArn')

  if (knowledgeBaseId === undefined) {
    throw new ConfigurationError(['VITE_BEDROCK_KB_ID'])
  }

  if (modelArn === undefined) {
    throw new ConfigurationError(['VITE_BEDROCK_MODEL_ARN'])
  }

  return { ...core, knowledgeBaseId, modelArn }
}

export function getConversationConfig(): ConversationConfig {
  const core = getCoreAwsConfig()
  const tableName = getValueOrCached('VITE_DDB_TABLE_NAME', 'tableName')

  if (tableName === undefined) {
    throw new ConfigurationError(['VITE_DDB_TABLE_NAME'])
  }

  return { ...core, tableName }
}

/**
 * 取得後端 URL。優先用 VITE_BACKEND_URL 環境變數（build-time），
 * 沒有就用 Secrets Manager 回傳的值，最後退回空字串（相對路徑）。
 */
export function getBackendUrl(): string {
  const envValue = nonBlankValue(import.meta.env.VITE_BACKEND_URL)
  if (envValue !== undefined) return envValue
  if (cachedConfig?.backendUrl) return cachedConfig.backendUrl
  return ''
}

export function getConfigurationIssues(): string[] {
  const issues: string[] = []

  const regionValue = getValueOrCached('VITE_AWS_REGION', 'region')
  if (!isAwsRegion(regionValue)) {
    issues.push('AWS 區域')
  }

  if (getValueOrCached('VITE_COGNITO_IDENTITY_POOL_ID', 'identityPoolId') === undefined) {
    issues.push('Cognito Identity Pool ID')
  }

  if (getValueOrCached('VITE_BEDROCK_KB_ID', 'knowledgeBaseId') === undefined) {
    issues.push('Bedrock Knowledge Base ID')
  }

  if (getValueOrCached('VITE_BEDROCK_MODEL_ARN', 'modelArn') === undefined) {
    issues.push('Bedrock 模型 ARN')
  }

  if (getValueOrCached('VITE_DDB_TABLE_NAME', 'tableName') === undefined) {
    issues.push('DynamoDB 資料表名稱')
  }

  return issues
}
