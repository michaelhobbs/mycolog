import type { Locale } from './i18n';
import type { LocalizedString } from '../types/mushroom';

export function l10n(value: LocalizedString | undefined, locale: Locale): string {
  if (!value) return '';
  return value[locale] ?? value.en ?? '';
}
