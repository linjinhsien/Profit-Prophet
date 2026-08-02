import { describe, it, expect } from 'vitest'
import { formatRelativeTime, formatAbsoluteTime } from './formatTime'

describe('formatRelativeTime', () => {
  const BASE_TIME = new Date('2026-08-01T12:00:00.000Z').getTime()

  it('returns "剛剛" for timestamps less than 1 second ago', () => {
    const timestamp = new Date(BASE_TIME - 500).toISOString()
    const result = formatRelativeTime(timestamp, 'zh-TW', BASE_TIME)
    expect(result).toBe('剛剛')
  })

  it('returns "剛剛" for the exact same time', () => {
    const timestamp = new Date(BASE_TIME).toISOString()
    const result = formatRelativeTime(timestamp, 'zh-TW', BASE_TIME)
    expect(result).toBe('剛剛')
  })

  it('formats seconds ago', () => {
    const timestamp = new Date(BASE_TIME - 30_000).toISOString()
    const result = formatRelativeTime(timestamp, 'zh-TW', BASE_TIME)
    expect(result).toContain('30')
    expect(result).toContain('秒')
  })

  it('formats minutes ago', () => {
    const timestamp = new Date(BASE_TIME - 5 * 60_000).toISOString()
    const result = formatRelativeTime(timestamp, 'zh-TW', BASE_TIME)
    expect(result).toContain('5')
    expect(result).toContain('分鐘')
  })

  it('formats hours ago', () => {
    const timestamp = new Date(BASE_TIME - 3 * 3_600_000).toISOString()
    const result = formatRelativeTime(timestamp, 'zh-TW', BASE_TIME)
    expect(result).toContain('3')
    expect(result).toContain('小時')
  })

  it('formats days ago', () => {
    const timestamp = new Date(BASE_TIME - 2 * 86_400_000).toISOString()
    const result = formatRelativeTime(timestamp, 'zh-TW', BASE_TIME)
    expect(result).toContain('2')
    expect(result).toContain('天')
  })

  it('formats weeks ago', () => {
    const timestamp = new Date(BASE_TIME - 14 * 86_400_000).toISOString()
    const result = formatRelativeTime(timestamp, 'zh-TW', BASE_TIME)
    expect(result).toContain('2')
    expect(result).toContain('週')
  })

  it('formats months ago', () => {
    const timestamp = new Date(BASE_TIME - 60 * 86_400_000).toISOString()
    const result = formatRelativeTime(timestamp, 'zh-TW', BASE_TIME)
    expect(result).toContain('2')
    expect(result).toContain('月')
  })

  it('formats years ago', () => {
    const timestamp = new Date(BASE_TIME - 400 * 86_400_000).toISOString()
    const result = formatRelativeTime(timestamp, 'zh-TW', BASE_TIME)
    expect(result).toContain('1')
    expect(result).toContain('年')
  })

  it('returns the raw string for invalid timestamps', () => {
    const result = formatRelativeTime('not-a-date', 'zh-TW', BASE_TIME)
    expect(result).toBe('not-a-date')
  })

  it('handles future timestamps', () => {
    const timestamp = new Date(BASE_TIME + 5 * 60_000).toISOString()
    const result = formatRelativeTime(timestamp, 'zh-TW', BASE_TIME)
    expect(result).toContain('5')
    expect(result).toContain('分鐘')
  })

  it('uses en locale when specified', () => {
    const timestamp = new Date(BASE_TIME - 5 * 60_000).toISOString()
    const result = formatRelativeTime(timestamp, 'en', BASE_TIME)
    expect(result).toContain('5')
    expect(result).toContain('minute')
  })

  it('defaults to zh-TW locale', () => {
    const timestamp = new Date(BASE_TIME - 60_000).toISOString()
    const result = formatRelativeTime(timestamp, undefined, BASE_TIME)
    expect(result).toContain('1')
    expect(result).toContain('分鐘')
  })
})

describe('formatAbsoluteTime', () => {
  it('formats a valid ISO timestamp to localized string', () => {
    const result = formatAbsoluteTime('2026-08-01T12:30:00.000Z', 'en-US')
    expect(result).toContain('2026')
    expect(result).toContain('08')
    expect(result).toContain('01')
  })

  it('returns the raw string for invalid timestamps', () => {
    const result = formatAbsoluteTime('invalid-date')
    expect(result).toBe('invalid-date')
  })

  it('uses zh-TW locale by default', () => {
    const result = formatAbsoluteTime('2026-08-01T12:30:00.000Z')
    expect(result).toContain('2026')
  })
})
