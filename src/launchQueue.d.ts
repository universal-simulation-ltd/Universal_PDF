// The File Handling API, which TypeScript's DOM lib does not yet declare.
// Chromium desktop only, and only for an INSTALLED PWA — `window.launchQueue`
// is simply absent everywhere else, which is the feature check the app uses.
export {}

declare global {
  interface LaunchParams {
    readonly files: readonly FileSystemFileHandle[]
    readonly targetURL?: string
  }

  interface LaunchQueue {
    setConsumer(consumer: (params: LaunchParams) => void): void
  }

  interface Window {
    launchQueue?: LaunchQueue
  }
}
