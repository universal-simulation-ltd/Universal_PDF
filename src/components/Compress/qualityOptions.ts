import type { CompressQuality } from '../../lib/export'
import type { Translator } from '../../i18n'

/** The three compression levels, in the active language. Shared by both compress modals. */
export function qualityOptions(t: Translator): { value: CompressQuality; label: string; hint: string }[] {
  return [
    { value: 'light', label: t('tools.compress.light'), hint: t('tools.compress.light_hint') },
    { value: 'balanced', label: t('tools.compress.balanced'), hint: t('tools.compress.balanced_hint') },
    { value: 'strong', label: t('tools.compress.maximum'), hint: t('tools.compress.maximum_hint') }
  ]
}
