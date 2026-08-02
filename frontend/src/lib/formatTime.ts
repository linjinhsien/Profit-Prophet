const SECOND = 1_000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const MONTH = 30 * DAY
const YEAR = 365 * DAY

interface TimeThreshold {
  limit: number
  divisor: number
  unit: Intl.RelativeTimeFormatUnit
}

const THRESHOLDS: readonly TimeThreshold[] = [
  { limit: MINUTE, divisor: SECOND, unit: 'second' },
  { limit: HOUR, divisor: MINUTE, unit: 'minute' },
  { limit: DAY, divisor: HOUR, unit: 'hour' },
  { limit: WEEK, divisor: DAY, unit: 'day' },
  { limit: MONTH, divisor: WEEK, unit: 'week' },
  { limit: YEAR, divisor: MONTH, unit: 'month' },
]

/**
 * Formats an ISO 8601 timestamp as a relative time string (e.g., "3 分鐘前").
 *
 * Uses `Intl.RelativeTimeFormat` for locale-aware output.
 * Returns the absolute date string if the timestamp is invalid.
 *
 * @param isoTimestamp - ISO 8601 timestamp string
 * @param locale - BCP 47 locale tag, defaults to 'zh-TW'
 * @param now - Reference time for calculating the difference (defaults to Date.now())
 */
export function formatRelativeTime(
  isoTimestamp: string,
  locale: string = 'zh-TW',
  now: number = Date.now(),
): string {
  const date = new Date(isoTimestamp)
  const time = date.getTime()

  if (!Number.isFinite(time)) {
    return isoTimestamp
  }

  const elapsed = now - time
  const absoluteElapsed = Math.abs(elapsed)
  const sign = elapsed >= 0 ? -1 : 1

  if (absoluteElapsed < SECOND) {
    return '剛剛'
  }

  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

  for (const threshold of THRESHOLDS) {
    if (absoluteElapsed < threshold.limit) {
      const value = Math.round(absoluteElapsed / threshold.divisor) * sign
      return formatter.format(value, threshold.unit)
    }
  }

  // Beyond 1 year
  const value = Math.round(absoluteElapsed / YEAR) * sign
  return formatter.format(value, 'year')
}

/**
 * Formats an ISO 8601 timestamp as a localized date-time string.
 *
 * @param isoTimestamp - ISO 8601 timestamp string
 * @param locale - BCP 47 locale tag, defaults to 'zh-TW'
 */
export function formatAbsoluteTime(
  isoTimestamp: string,
  locale: string = 'zh-TW',
): string {
  const date = new Date(isoTimestamp)
  const time = date.getTime()

  if (!Number.isFinite(time)) {
    return isoTimestamp
  }

  return date.toLocaleString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
