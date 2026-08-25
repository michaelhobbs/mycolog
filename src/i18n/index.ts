import en from './en';
import de from './de';

export type Locale = 'en' | 'de';
export type Translations = typeof en;

const translations = { en, de } as const;

export const locales: Locale[] = ['en', 'de'];
export const defaultLocale: Locale = 'en';

export function getTranslations(locale: Locale): Translations {
  return translations[locale] ?? translations[defaultLocale];
}

export function formatDate(dateStr: string, locale: Locale): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
