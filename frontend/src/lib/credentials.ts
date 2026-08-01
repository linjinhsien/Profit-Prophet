import {
  fromCognitoIdentityPool,
  type CognitoIdentityCredentialProvider,
} from '@aws-sdk/credential-provider-cognito-identity'
import { getCoreAwsConfig } from './config'

export type CognitoLogins = Record<string, string>

export class AuthenticationRequiredError extends Error {
  constructor() {
    super('需要已驗證的 Cognito User Pool 或外部 IdP token，未登入身分不得取得 AWS 憑證。')
    this.name = 'AuthenticationRequiredError'
  }
}

let authenticatedLogins: CognitoLogins | undefined
let credentialProvider: CognitoIdentityCredentialProvider | undefined

/**
 * Supplies verified login tokens from the host authentication integration.
 * Tokens are kept only in memory and are never copied to Vite environment values.
 */
export function configureAuthenticatedCognitoLogins(logins: CognitoLogins): void {
  const validLogins: CognitoLogins = {}

  for (const [providerName, token] of Object.entries(logins)) {
    if (providerName.trim() !== '' && token.trim() !== '') {
      validLogins[providerName] = token
    }
  }

  if (Object.keys(validLogins).length === 0) {
    throw new AuthenticationRequiredError()
  }

  authenticatedLogins = validLogins
  credentialProvider = undefined
}

export function clearAuthenticatedCognitoLogins(): void {
  authenticatedLogins = undefined
  credentialProvider = undefined
}

export function hasAuthenticatedCognitoLogin(): boolean {
  return authenticatedLogins !== undefined
}

function requireAuthenticatedLogins(): CognitoLogins {
  if (authenticatedLogins === undefined) {
    throw new AuthenticationRequiredError()
  }

  return authenticatedLogins
}

/**
 * Returns the authenticated Cognito temporary-credential provider used by every
 * AWS service client. The SDK resolves this provider for each request and refreshes
 * expired credentials without a page reload.
 */
export function getCredentialsProvider(): CognitoIdentityCredentialProvider {
  if (credentialProvider !== undefined) {
    return credentialProvider
  }

  const config = getCoreAwsConfig()
  credentialProvider = fromCognitoIdentityPool({
    clientConfig: { region: config.region },
    identityPoolId: config.identityPoolId,
    logins: requireAuthenticatedLogins(),
  })

  return credentialProvider
}

export async function refreshTemporaryCredentials(): Promise<void> {
  await getCredentialsProvider()()
}

/**
 * Uses the identity resolved by the same credential provider that signs DynamoDB
 * requests, so the partition key remains compatible with IAM LeadingKeys.
 */
export async function getCognitoIdentityId(): Promise<string> {
  const credentials = await getCredentialsProvider()()

  if (typeof credentials.identityId !== 'string' || credentials.identityId.trim() === '') {
    throw new Error('Cognito 憑證沒有回傳可用的 identity ID。')
  }

  return credentials.identityId
}
