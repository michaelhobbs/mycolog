import en from './en'
import de from './de'

export type Locale = 'en' | 'de'

type Widen<T> = T extends string ? string : T extends object ? { [K in keyof T]: Widen<T[K]> } : T

export type Translations = Widen<typeof en>

const translations: Record<Locale, Translations> = { en, de }

export const locales: Locale[] = ['en', 'de']
export const defaultLocale: Locale = 'en'

export function getTranslations(locale: Locale): Translations {
  return translations[locale] ?? translations[defaultLocale]
}

export function formatDate(dateStr: string, locale: Locale): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
