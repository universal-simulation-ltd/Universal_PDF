// The build-time configuration every shipped bundle MUST carry, and the check
// that refuses to build without it.
//
//   npm run test:build-env
//
// ⚠️ WHY THIS EXISTS. `src/main.tsx` hands `UniversalProvider` a Supabase URL
// and anon key read from `import.meta.env`. Vite INLINES those at build time:
// when the variables are absent it substitutes `undefined` and the build
// succeeds — a green build, a normal-looking bundle, and an app that throws
// during provider init and shows the ErrorBoundary card ("Universal PDF failed
// to start") to every user who opens it.
//
// It is not hypothetical and it is not a one-off. It has shipped twice:
//   · in CI, before the release workflow passed the two secrets (PR #80);
//   · in the 0.6.15 macOS desktop build of 2026-08-31, produced in a checkout
//     with no `.env.local` — which is EVERY fresh clone and every `git
//     worktree`, because the file is gitignored. That build installed happily
//     into /Applications and died on launch.
//
// Both times the artefact was the first thing to notice. This module moves the
// failure to the build, where the person who can fix it is still watching.
//
// ⚠️ Deliberately dependency-free. It is imported by `vite.config.ts` (which
// runs under esbuild) and by a test under Node's type-stripping, so it must not
// import `vite`, the SDK, or anything else — the caller does the `loadEnv` and
// passes the result in. Same rule as `src/lib/hostedPaths.ts`.

/**
 * The variables `src/main.tsx` reads. Names are the PLATFORM-prefixed pair —
 * the suite-wide Supabase project shared by every Universal App — not the
 * bare `VITE_SUPABASE_*` names, which some `.env.local` files also carry for
 * other tooling. Adding a name here makes it mandatory for every build.
 */
export const REQUIRED_BUILD_ENV = [
  'VITE_PLATFORM_SUPABASE_URL',
  'VITE_PLATFORM_SUPABASE_ANON_KEY',
] as const

export interface BuildEnvProblem {
  key: string
  /** 'missing' — absent or empty. 'malformed' — present but unusable. */
  reason: 'missing' | 'malformed'
  detail: string
}

/**
 * What is wrong with this environment, if anything.
 *
 * ⚠️ An empty string counts as missing, and that is the case that actually
 * bites: GitHub Actions passes an unset secret as an EMPTY variable rather than
 * an absent one (the same landmine `release.yml` documents for `CSC_LINK`), so
 * a `key in env` test would pass on exactly the run that ships a broken app.
 */
export function checkBuildEnv(
  env: Record<string, string | undefined>,
): BuildEnvProblem[] {
  const problems: BuildEnvProblem[] = []

  for (const key of REQUIRED_BUILD_ENV) {
    const value = (env[key] ?? '').trim()
    if (!value) {
      problems.push({ key, reason: 'missing', detail: 'not set (or set to an empty value)' })
      continue
    }
    // A shape check, not a credential check — nothing here can tell a valid key
    // from a revoked one. It catches the mangled-secret cases that would
    // otherwise reach a user as the same blank error card: a URL that is not a
    // URL, and a key that is obviously not a JWT.
    if (key.endsWith('_URL') && !/^https:\/\/[^\s/]+/.test(value)) {
      problems.push({ key, reason: 'malformed', detail: `not an https:// URL (got ${JSON.stringify(truncate(value))})` })
    }
    if (key.endsWith('_ANON_KEY') && value.split('.').length !== 3) {
      problems.push({ key, reason: 'malformed', detail: 'not a JWT (expected three dot-separated segments)' })
    }
  }

  return problems
}

/** The message the build dies with. It has to be enough to act on alone. */
export function buildEnvError(problems: BuildEnvProblem[], mode: string): string {
  const lines = problems.map((p) => `  · ${p.key} — ${p.detail}`)
  return [
    `Universal PDF: build-time configuration is incomplete (vite mode "${mode}").`,
    '',
    ...lines,
    '',
    'Vite inlines these values, so building without them does NOT fail the build —',
    'it produces a bundle whose Supabase client cannot be constructed. Every user',
    'then sees "Universal PDF failed to start" and nothing else. Refusing here is',
    'the whole point; do not skip this by editing it out.',
    '',
    'Locally: this checkout needs .env.local. It is gitignored, so a fresh clone or',
    'a git worktree will NOT have it — copy it from a checkout that does.',
    '',
    'In CI: pass them as environment variables from the repo secrets, the way',
    '.github/workflows/release.yml already does for the desktop and Android jobs.',
  ].join('\n')
}

function truncate(value: string): string {
  return value.length > 40 ? `${value.slice(0, 40)}…` : value
}
