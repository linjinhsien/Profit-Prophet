// @ts-nocheck
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { getCoreAwsConfig } from '../lib/config'
import { getCredentialsProvider } from '../lib/credentials'

const TABLE_NAME = 'caremate-ai_elder_profile'

function getDocClient() {
  const config = getCoreAwsConfig()
  const client = new DynamoDBClient({
    region: config.region,
    credentials: getCredentialsProvider(),
  })
  return DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  })
}

export interface ElderProfile {
  elder_id: string
  name: string
  age: number
  gender: string
  language: string
  phone?: string
  address?: string
  emergency_contact?: string
  emergency_phone?: string
  diseases?: string[]
  medications?: string[]
  allergies?: string[]
  preferences?: {
    wake_time?: string
    sleep_time?: string
    favorite_topics?: string[]
    preferred_language?: string
    favorite_food?: string
    dislike?: string
  }
  family_info?: {
    children?: string
    grandchildren?: string
    spouse?: string
    frequent_visitor?: string
  }
  created_at?: string
  updated_at?: string
}

/**
 * 從 DynamoDB 讀取所有長者資料
 */
export async function loadElderProfiles(): Promise<ElderProfile[]> {
  const doc = getDocClient()
  const resp = await doc.send(new ScanCommand({ TableName: TABLE_NAME }))
  return (resp.Items || []) as ElderProfile[]
}

/**
 * 新增或更新長者資料
 */
export async function saveElderProfile(profile: ElderProfile): Promise<void> {
  const doc = getDocClient()
  await doc.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      ...profile,
      updated_at: new Date().toISOString(),
      created_at: profile.created_at || new Date().toISOString(),
    },
  }))
}

/**
 * 刪除長者資料
 */
export async function deleteElderProfile(elderId: string): Promise<void> {
  const doc = getDocClient()
  await doc.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: { elder_id: elderId },
  }))
}

/**
 * 批次寫入預設長者資料（首次使用時）
 */
export async function seedDefaultElders(elders: ElderProfile[]): Promise<void> {
  const doc = getDocClient()
  for (const elder of elders) {
    await doc.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        ...elder,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      ConditionExpression: 'attribute_not_exists(elder_id)',
    })).catch(() => {}) // Ignore if already exists
  }
}
