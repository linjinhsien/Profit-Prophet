export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function readString(value: Record<string, unknown>, key: string): string | undefined {
  const candidate = value[key]
  return isNonBlankString(candidate) ? candidate : undefined
}

export function readNumber(value: Record<string, unknown>, key: string): number | undefined {
  const candidate = value[key]
  return isFiniteNumber(candidate) ? candidate : undefined
}

export function isSafeExternalUrl(value: unknown): value is string {
  if (!isNonBlankString(value)) {
    return false
  }

  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}
