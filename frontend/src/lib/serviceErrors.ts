import { ConfigurationError } from './config'
import { isRecord, readString } from './guards'

export type AwsService = 'bedrock' | 'cognito' | 'dynamodb' | 'polly' | 'transcribe'
export type ServiceErrorKind =
  | 'authentication'
  | 'configuration'
  | 'network'
  | 'service'
  | 'throttled'
  | 'unknown'

export class ServiceError extends Error {
  readonly kind: ServiceErrorKind
  readonly service: AwsService

  constructor(service: AwsService, kind: ServiceErrorKind, message: string) {
    super(message)
    this.name = 'ServiceError'
    this.kind = kind
    this.service = service
  }
}

export function toServiceError(service: AwsService, error: unknown): ServiceError {
  if (error instanceof ConfigurationError) {
    return new ServiceError(service, 'configuration', error.message)
  }

  if (error instanceof ServiceError) {
    return error
  }

  const errorName = isRecord(error) ? readString(error, 'name') : undefined

  if (errorName === 'CredentialsProviderError' || errorName === 'NotAuthorizedException') {
    return new ServiceError(service, 'authentication', '暫時憑證無效或權限不足，請確認 Cognito 與 IAM 設定。')
  }

  if (errorName === 'ThrottlingException' || errorName === 'TooManyRequestsException') {
    return new ServiceError(service, 'throttled', '服務目前限流，請稍後再試。')
  }

  if (errorName === 'TypeError') {
    return new ServiceError(service, 'network', '網路連線失敗，請確認網路後再試。')
  }

  return new ServiceError(service, 'service', `${service} 服務暫時無法使用，請稍後再試。`)
}
