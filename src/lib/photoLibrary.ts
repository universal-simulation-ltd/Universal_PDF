import { isNativeShell } from './nativeOpen'

/**
 * "Save to Photos" for the pages turned into pictures (James, 2026-10-25):
 * each page goes straight into the phone's photo library, in order, as the
 * other choice to one ZIP file. Through the app's own `PhotoLibrary` plugin:
 *
 *   iOS      ios/App/App/PhotoLibrary.swift — ADD-ONLY access (can add, never
 *            sees what is there); NSPhotoLibraryAddUsageDescription.
 *   Android  android/.../PhotoLibraryPlugin.java — MediaStore, Pictures/<PDF
 *            name>, no permission from Android 10; WRITE_EXTERNAL_STORAGE on 7–9.
 *
 * The phone apps only: the website and the desktop app keep the ZIP.
 */

interface PhotoLibraryPlugin {
  requestAccess(): Promise<{ access: 'granted' | 'denied' }>
  saveImage(options: { data: string; name: string; album?: string }): Promise<void>
  openSettings(): Promise<void>
}

/**
 * ⚠️ TEST SEAM: e2e/phone-pictures puts a stand-in plugin here to drive the
 * page in a browser, where there is no photo library. Nothing in the app sets it.
 */
type Fake = PhotoLibraryPlugin & { platform?: 'ios' | 'android' }
const fake = (): Fake | undefined => (globalThis as { __unipdfPhotoLibrary?: Fake }).__unipdfPhotoLibrary

// See lib/documentScanner.ts: never resolve a promise with a plugin.
let plugin: Promise<{ p: PhotoLibraryPlugin }> | null = null
function getPlugin(): Promise<{ p: PhotoLibraryPlugin }> {
  const f = fake()
  if (f) return Promise.resolve({ p: f })
  plugin ??= import('@capacitor/core').then(({ registerPlugin }) => ({
    p: registerPlugin<PhotoLibraryPlugin>('PhotoLibrary'),
  }))
  return plugin
}

/** Is there a photo library to save to (the phone apps)? */
export function canSaveToPhotos(): boolean {
  return !!fake() || isNativeShell()
}

/** Which one: iOS's Photos or Android's Gallery (they are named differently). */
export function photoLibraryKind(): 'photos' | 'gallery' {
  const f = fake()
  if (f) return f.platform === 'android' ? 'gallery' : 'photos'
  const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor
  try {
    return cap?.getPlatform?.() === 'android' ? 'gallery' : 'photos'
  } catch {
    return 'photos'
  }
}

export class PhotoAccessDenied extends Error {
  constructor() {
    super('Access to the photo library was refused')
  }
}

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

/**
 * Save every picture in the order given. Asks for access first (iOS asks the
 * person once; Android 10+ never needs to). Throws `PhotoAccessDenied` when
 * refused, before anything is saved. Resolves with how many were saved.
 */
export async function saveToPhotos(
  entries: { name: string; data: Uint8Array }[],
  album: string,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const { p } = await getPlugin()
  const { access } = await p.requestAccess()
  if (access !== 'granted') throw new PhotoAccessDenied()
  let done = 0
  for (const e of entries) {
    try {
      await p.saveImage({ data: toBase64(e.data), name: e.name, album })
    } catch (err) {
      if ((err as { code?: string })?.code === 'DENIED') throw new PhotoAccessDenied()
      throw err
    }
    onProgress?.(++done, entries.length)
  }
  return done
}

/** This app's page in the phone's Settings (to turn photo access back on). */
export async function openAppSettings(): Promise<void> {
  const { p } = await getPlugin()
  await p.openSettings()
}
