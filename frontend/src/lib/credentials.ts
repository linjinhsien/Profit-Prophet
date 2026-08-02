import { CognitoIdentityClient, GetIdCommand, GetOpenIdTokenCommand } from '@aws-sdk/client-cognito-identity'
import { AssumeRoleWithWebIdentityCommand, STSClient } from '@aws-sdk/client-sts'
import { type AwsCredentialIdentity, type Provider } from '@aws-sdk/types'
import { getCoreAwsConfig } from './config'

export type CognitoLogins = Record<string, string>

export class AuthenticationRequiredError extends Error {
  constructor() {
    super('需要已驗證的 Cognito User Pool 或外部 IdP token，未登入身分不得取得 AWS 憑證。')
    this.name = 'AuthenticationRequiredError'
  }
}

export type CognitoIdentityCredentialProvider = Provider<AwsCredentialIdentity & { identityId?: string }>

let authenticatedLogins: CognitoLogins | undefined
let credentialProvider: CognitoIdentityCredentialProvider | undefined
let cachedIdentityId: string | undefined

/**
 * Supplies verified login tokens from the host authentication integration.
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
  cachedIdentityId = undefined
}

export function clearAuthenticatedCognitoLogins(): void {
  authenticatedLogins = undefined
  credentialProvider = undefined
  cachedIdentityId = undefined
}

export function hasAuthenticatedCognitoLogin(): boolean {
  return true
}

const ROLE_ARN = 'arn:aws:iam::056724761684:role/profit-prophet-cognito-unauth'

/**
 * Basic (classic) auth flow using AWS SDK clients:
 * 1. GetId → get Cognito identity
 * 2. GetOpenIdToken → get OIDC token
 * 3. AssumeRoleWithWebIdentity → get full AWS credentials (no session policy restriction)
 */
async function resolveCredentials(): Promise<AwsCredentialIdentity & { identityId: string }> {
  const config = getCoreAwsConfig()

  // Cognito client doesn't need credentials for GetId/GetOpenIdToken
  const cognitoClient = new CognitoIdentityClient({ region: config.region })

  // Step 1: Get Identity ID
  const getIdResp = await cognitoClient.send(
    new GetIdCommand({
      IdentityPoolId: config.identityPoolId,
      ...(authenticatedLogins !== undefined ? { Logins: authenticatedLogins } : {}),
    }),
  )

  const identityId = getIdResp.IdentityId
  if (!identityId) {
    throw new Error('Cognito 未回傳 Identity ID')
  }
  cachedIdentityId = identityId

  // Step 2: Get OpenID Token
  const tokenResp = await cognitoClient.send(
    new GetOpenIdTokenCommand({
      IdentityId: identityId,
      ...(authenticatedLogins !== undefined ? { Logins: authenticatedLogins } : {}),
    }),
  )

  const oidcToken = tokenResp.Token
  if (!oidcToken) {
    throw new Error('Cognito 未回傳 OpenID Token')
  }

  // Step 3: AssumeRoleWithWebIdentity via STS SDK client (no credentials needed)
  const stsClient = new STSClient({ region: config.region })
  const assumeResp = await stsClient.send(
    new AssumeRoleWithWebIdentityCommand({
      RoleArn: ROLE_ARN,
      RoleSessionName: 'profit-prophet-frontend',
      WebIdentityToken: oidcToken,
      DurationSeconds: 3600,
    }),
  )

  const creds = assumeResp.Credentials
  if (!creds?.AccessKeyId || !creds.SecretAccessKey || !creds.SessionToken) {
    throw new Error('STS 回傳的憑證不完整')
  }

  return {
    accessKeyId: creds.AccessKeyId,
    secretAccessKey: creds.SecretAccessKey,
    sessionToken: creds.SessionToken,
    expiration: creds.Expiration,
    identityId,
  }
}

let cachedCredentials: (AwsCredentialIdentity & { identityId: string }) | undefined
let credentialExpiration: Date | undefined

/**
 * Returns the credential provider used by every AWS service client.
 * Uses basic (classic) auth flow to avoid session policy restrictions.
 */
export function getCredentialsProvider(): CognitoIdentityCredentialProvider {
  if (credentialProvider !== undefined) {
    return credentialProvider
  }

  credentialProvider = async () => {
    // Return cached credentials if still valid (5 min buffer)
    if (cachedCredentials && credentialExpiration) {
      const now = new Date()
      const buffer = 5 * 60 * 1000 // 5 minutes
      if (credentialExpiration.getTime() - now.getTime() > buffer) {
        return cachedCredentials
      }
    }

    // Resolve fresh credentials
    cachedCredentials = await resolveCredentials()
    credentialExpiration = cachedCredentials.expiration as Date | undefined
    return cachedCredentials
  }

  return credentialProvider
}

export async function refreshTemporaryCredentials(): Promise<void> {
  cachedCredentials = undefined
  credentialExpiration = undefined
  await getCredentialsProvider()()
}

/**
 * Returns the Cognito identity ID for the current session.
 */
export async function getCognitoIdentityId(): Promise<string> {
  if (cachedIdentityId) {
    return cachedIdentityId
  }

  await getCredentialsProvider()()

  if (!cachedIdentityId) {
    throw new Error('Cognito 憑證沒有回傳可用的 identity ID。')
  }

  return cachedIdentityId
}
