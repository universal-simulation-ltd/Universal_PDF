import { intlLocale, type Translator } from '../../i18n'

// File sizes and percentages as the export, compress and convert dialogs show
// them — in the active language's digits and decimal separator. No grouping, so
// "1023 KB" never becomes "1,023 KB".

export function formatNumber(t: Translator, value: number, digits: number): string {
  return new Intl.NumberFormat(intlLocale(t.lang), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: false
  }).format(value)
}

export function formatSize(t: Translator, bytes: number): string {
  if (bytes < 1024) return t('tools.size.bytes', { n: formatNumber(t, bytes, 0) })
  if (bytes < 1024 * 1024) return t('tools.size.kb', { n: formatNumber(t, bytes / 1024, 0) })
  return t('tools.size.mb', { n: formatNumber(t, bytes / 1024 / 1024, 2) })
}
