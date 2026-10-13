import { useContext } from 'react'
import { PreferencesThemeContext } from '@unisim/sdk'
import { useT } from '../../i18n'
import { useToolPrefs } from '../../stores/toolPrefsStore'

/**
 * Tune this app ▸ "Stay on the last tool" and "Don't confirm annotations"
 * (James, 2026-10-13). Both off by default, like every switch in the suite;
 * what they do is in stores/toolPrefsStore.ts. Same look as the
 * "Lock saved signatures" row (SignatureVaultRow).
 */
export default function ToolBehaviourRows() {
  const t = useT()
  const stayOnTool = useToolPrefs((s) => s.stayOnTool)
  const noConfirm = useToolPrefs((s) => s.noConfirm)
  const setStayOnTool = useToolPrefs((s) => s.setStayOnTool)
  const setNoConfirm = useToolPrefs((s) => s.setNoConfirm)
  return (
    <>
      <SwitchRow
        label={t('viewer.prefs.stay_on_tool')}
        note={t('viewer.prefs.stay_on_tool_note')}
        checked={stayOnTool}
        onChange={setStayOnTool}
      />
      <SwitchRow
        label={t('viewer.prefs.no_confirm')}
        note={t('viewer.prefs.no_confirm_note')}
        checked={noConfirm}
        onChange={setNoConfirm}
      />
    </>
  )
}

function SwitchRow({
  label,
  note,
  checked,
  onChange
}: {
  label: string
  note: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  const theme = useContext(PreferencesThemeContext)
  const body = theme === 'dark' ? '#e2e8f0' : '#334155'
  const muted = theme === 'dark' ? '#94a3b8' : '#64748b'
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 0', cursor: 'pointer' }}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: body }}>{label}</span>
        <span style={{ fontSize: 12, color: muted }}>{note}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 20, height: 20, accentColor: '#2353c9', flex: 'none' }}
      />
    </label>
  )
}
