// The view rows a person can double-tap to make the default (SDK 0.170.0's
// useDefaultView), named once so the buttons and their Tune this app rows
// (SignatureDefaultViewRows) cannot drift apart.
//
// James, 2026-09-30: "Where there are buttons that offer a different view to
// default, allow the user to double click the button to set that as their
// default view." In this app that is the Sign menu's tabs and the signature
// pad's Draw / Send to sign toggle. Not the open-document tabs (they are
// different documents, not views of one), and not Convert's two modes or
// Export's Original / Compressed: which way to convert is chosen by the entry
// point that opens the dialog, and compression is an export setting.
//
// Stored per device by the SDK (`unisim:default-view:pdf:<id>`), so Reset to
// defaults clears them with no help from here.

/** Sign menu: which tab it opens on. */
export const SIGN_MENU_VIEW = 'sign-menu-tab'
export const SIGN_MENU_TABS = ['signatures', 'stamps', 'request'] as const
export type SignMenuTab = (typeof SIGN_MENU_TABS)[number]

/** Signature pad: draw here, or hand it to a phone. */
export const SIGN_PAD_VIEW = 'sign-pad-mode'
export const SIGN_PAD_MODES = ['draw', 'phone'] as const
export type SignPadMode = (typeof SIGN_PAD_MODES)[number]
