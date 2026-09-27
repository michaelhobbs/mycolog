import type { Locale } from '../i18n'

export interface RailDay {
  date: string
  count: number
  meta?: string
}

export interface RailMonth {
  key: string
  label: string
  days: RailDay[]
}

function intlLocale(locale: Locale): string {
  return locale === 'de' ? 'de-DE' : 'en-GB'
}

function parts(dateStr: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateStr.split('-').map(Number)
  return { year, month, day }
}

/**
 * A `YYYY-MM-DD` string parsed at *local* midnight. `new Date(dateStr)` treats
 * the string as UTC midnight, so anywhere west of UTC it formats as the previous
 * day — which silently mislabels every dated page in a date-first UI.
 */
export function toLocalDate(dateStr: string): Date {
  const { year, month, day } = parts(dateStr)
  return new Date(year, month - 1, day)
}

export function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7)
}

export function formatMonth(key: string, locale: Locale): string {
  const [year, month] = key.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString(intlLocale(locale), {
    month: 'long',
    year: 'numeric',
  })
}

export function formatDay(dateStr: string, locale: Locale): string {
  return toLocalDate(dateStr).toLocaleDateString(intlLocale(locale), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export function formatDayLong(dateStr: string, locale: Locale): string {
  return toLocalDate(dateStr).toLocaleDateString(intlLocale(locale), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function groupByMonth(days: RailDay[], locale: Locale): RailMonth[] {
  const months = new Map<string, RailDay[]>()
  for (const day of days) {
    const key = monthKey(day.date)
    const bucket = months.get(key)
    if (bucket) bucket.push(day)
    else months.set(key, [day])
  }
  return [...months.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, entries]) => ({
      key,
      label: formatMonth(key, locale),
      days: entries.sort((a, b) => (a.date < b.date ? 1 : -1)),
    }))
}
