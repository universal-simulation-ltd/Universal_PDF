// The single page container for the landing view. The navbar (via the SDK's
// `contentClassName`), the landing page and the footer all share it, so the
// suite switcher lines up with the left edge of the page content — and the
// profile/changelog cluster with its right edge — at every breakpoint.
//
// Scope: the universal navbar is landing-page only (while a document is open
// the dark toolbar is the whole chrome, and it tracks the document width
// instead — see App.tsx), so this container governs the landing view only.
export const CONTAINER = 'mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8'
