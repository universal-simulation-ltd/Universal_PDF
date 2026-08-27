import { useOrg, useOrgBranding } from '@unisim/sdk'

/**
 * "You are signed in on behalf of ___" — the org's mark and name, for the
 * bottom of the profile dropdown.
 *
 * ⚠️ Nothing here is a new source of truth. Both hooks are the SDK's existing
 * org reads (`useOrgBranding` is literally `useOrg()` narrowed to the three
 * branding columns), so whatever an admin has already uploaded under My Company
 * → Branding is what appears — there is no PDF-specific logo to set, and no new
 * API was invented for this.
 *
 * `icon_url` before `logo_url` on purpose: the square 1:1 mark is the one meant
 * for compact chrome, and a wide horizontal wordmark squeezed into a 28px box
 * is unreadable. The wordmark is the fallback because SOME mark beats none, and
 * an initials tile in the org's own brand colour is the last resort.
 *
 * Renders nothing at all when there is no org — a guest, or a signed-in user
 * whose membership query hasn't landed. An empty grey square captioned with
 * nothing is worse than the row simply not being there.
 */
export default function CompanyBadge() {
  const { org } = useOrg()
  const branding = useOrgBranding()

  if (!org) return null

  const mark = branding.icon_url ?? branding.logo_url ?? null
  const initials = org.name.trim().slice(0, 2).toUpperCase() || '?'
  // The tenant's own colour where they have set one, the suite orange where
  // they haven't. Ink on top either way — white on the brand orange has never
  // reached AA (see BRAND.onOrange in the SDK).
  const tile = branding.brand_color ?? '#fe8c01'

  return (
    <div
      data-testid="profile-company"
      className="flex items-center gap-2.5 px-3.5 py-2 text-slate-700"
    >
      {mark ? (
        <img
          src={mark}
          alt=""
          className="h-7 w-7 shrink-0 rounded-md object-contain"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-slate-900"
          style={{ background: tile }}
        >
          {initials}
        </span>
      )}
      <span className="min-w-0">
        <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Company
        </span>
        <span className="block truncate text-[13px] font-medium leading-tight">{org.name}</span>
      </span>
    </div>
  )
}
