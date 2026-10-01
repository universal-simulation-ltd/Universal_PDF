// Sign-on-phone handoff protocol, mirroring Ergo Assess: the desktop shows a
// QR (one-time token in the URL) plus a 6-digit PIN; the phone page draws a
// signature and broadcasts it back over a Supabase Realtime channel; the
// desktop only accepts the payload if the PIN matches. Broadcast messages are
// ephemeral — no DB rows are written.

import { publicAppBase } from './appUrl'

export function randomToken(): string {
  return (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/-/g, '')
}

export function randomPin(): string {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')
}

export function mobileSignChannel(token: string): string {
  return `mobile-sig:${token}`
}

/** URL the phone opens — the hosted web app, wherever this one is running. */
export function mobileSignUrl(token: string): string {
  return `${publicAppBase()}?sign=${token}`
}

export interface MobileSignPayload {
  pin?: string
  /** Base64 PNG (no data: prefix), white background, drawn on the phone. */
  signature?: string
}
