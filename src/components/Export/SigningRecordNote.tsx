import { useT } from '../../i18n'
import { useSigningRecordAhead } from '../../lib/signingRecord'

/**
 * "A Signing record page goes at the end …": said before the file is made,
 * so the extra page is no surprise. Only while a signature from the UNI·SIM
 * Hub app is on the document (lib/signingRecord.ts). Export, Advanced export
 * and the phone's Send it on its way.
 */
export function SigningRecordNote({ className = '' }: { className?: string }) {
  const t = useT()
  if (!useSigningRecordAhead()) return null
  return (
    <p data-testid="signing-record-note" className={className || 'mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900'}>
      {t('sign.record_note')}
    </p>
  )
}
