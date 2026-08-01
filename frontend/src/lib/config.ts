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

const ENVIRONMENT_LABELS = {
  VITE_AWS_REGION: 'AWS 區域',
  VITE_COGNITO_IDENTITY_POOL_ID: 'Cognito Identity Pool ID',
  VITE_BEDROCK_KB_ID: 'Bedrock Knowledge Base ID',
  VITE_BEDROCK_MODEL_ARN: 'Bedrock 模型 ARN',
  VITE_DDB_TABLE_NAME: 'DynamoDB 資料表名稱',
}

const REQUIRED_SETTING_KEYS: Array<keyof typeof ENVIRONMENT_LABELS> = [
  'VITE_COGNITO_IDENTITY_POOL_ID',
  'VITE_BEDROCK_KB_ID',
  'VITE_BEDROCK_MODEL_ARN',
  'VITE_DDB_TABLE_NAME',
]

export class ConfigurationError extends Error {
  readonly missingKeys: string[]

  constructor(missingKeys: string[], message?: string) {
    super(message ?? `請在 .env.local 設定：${missingKeys.join('、')}`)
    this.name = 'ConfigurationError'
    this.missingKeys = missingKeys
  }
}

function nonBlankValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === '' || trimmed === undefined ? undefined : trimmed
}

function isAwsRegion(value: string | undefined): value is AwsRegion {
  return value === 'us-east-1' || value === 'us-west-2'
}

function requiredValue(key: keyof typeof ENVIRONMENT_LABELS): string {
  const value = nonBlankValue(import.meta.env[key])

  if (value === undefined) {
    throw new ConfigurationError([key])
  }

  return value
}

export function getCoreAwsConfig(): CoreAwsConfig {
  const regionValue = requiredValue('VITE_AWS_REGION')

  if (!isAwsRegion(regionValue)) {
    throw new ConfigurationError(
      ['VITE_AWS_REGION'],
      'VITE_AWS_REGION 只能是 us-east-1 或 us-west-2。',
    )
  }

  return {
    region: regionValue,
    identityPoolId: requiredValue('VITE_COGNITO_IDENTITY_POOL_ID'),
  }
}

export function getBedrockConfig(): BedrockConfig {
  return {
    ...getCoreAwsConfig(),
    knowledgeBaseId: requiredValue('VITE_BEDROCK_KB_ID'),
    modelArn: requiredValue('VITE_BEDROCK_MODEL_ARN'),
  }
}

export function getConversationConfig(): ConversationConfig {
  return {
    ...getCoreAwsConfig(),
    tableName: requiredValue('VITE_DDB_TABLE_NAME'),
  }
}

export function getConfigurationIssues(): string[] {
  const issues: string[] = []
  const regionValue = nonBlankValue(import.meta.env.VITE_AWS_REGION)

  if (!isAwsRegion(regionValue)) {
    issues.push(ENVIRONMENT_LABELS.VITE_AWS_REGION)
  }

  for (const key of REQUIRED_SETTING_KEYS) {
    if (nonBlankValue(import.meta.env[key]) === undefined) {
      issues.push(ENVIRONMENT_LABELS[key])
    }
  }

  return issues
}
