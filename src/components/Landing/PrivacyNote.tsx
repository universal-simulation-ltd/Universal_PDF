const REPO = 'https://github.com/universal-simulation-ltd/Universal_PDF'

/**
 * The privacy claim, stated where the anxiety is — under the drop circle,
 * at the moment someone is deciding whether to hand this page a document.
 *
 * Three deliberate choices:
 *
 * 1. **It names the alternative.** "Everything stays on your device" was
 *    already on this page three times over (the lead, the ring, the download
 *    row) and read as boilerplate, because every upload-and-scrape site says
 *    something similar. Naming what the other tools do — and *why* they do it,
 *    which is to view your file on their server and mine what is in it — is
 *    what makes the sentence carry information.
 *
 * 2. **"Guaranteed" is the link, not a badge.** A trust seal you cannot click
 *    is a claim about a claim. This one opens the source the page is running,
 *    which is the only guarantee anybody can actually check — so the word that
 *    makes the promise is the word that hands over the evidence.
 *
 * 3. ⚠️ **`except` is what keeps the sentence true.** This app CAN send a file
 *    off the device — "Store with UNI·SIM" (hosted backup) and "Send to sign"
 *    both do, by design. An unqualified "never leaves this computer" would be
 *    false, and false in the exact place the Guaranteed link invites people to
 *    go and look. It used to be a separate line below a hairline; folding it
 *    into the sentence is James's call (2026-08-28) and is better — a caveat
 *    set apart in smaller grey type reads as the bit you are meant to skip,
 *    which is the opposite of what an honest exception should look like.
 *
 *    When porting this to another app: work out what THAT app can send and
 *    write it here. Pass `except={null}` only for an app that genuinely never
 *    sends anything — then the claim is unqualified because it is unqualified,
 *    not because the caveat was inconvenient.
 */
export default function PrivacyNote({
  repo = REPO,
  subject = 'Your PDF',
  except = 'backup and signing',
  className = '',
}: {
  /** The app's own source, opened by "Guaranteed". */
  repo?: string
  /** What this app is handed — "Your PDF", "Your images", "Your video". */
  subject?: string
  /** ⚠️ The ways this app can send a file. `null` = it never can. See note 3. */
  except?: string | null
  className?: string
}) {
  return (
    <div
      className={`flex gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-3 ${className}`}
    >
      {/* A shield with a tick, not a padlock: a padlock is the browser's own
          mark for "this connection is encrypted", which is a promise about the
          wire and would be claiming the wrong thing. */}
      <svg
        viewBox="0 0 24 24"
        className="mt-0.5 h-5 w-5 shrink-0 text-slate-500"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3 5 6v5.5c0 4.3 2.9 8.2 7 9.5 4.1-1.3 7-5.2 7-9.5V6z" />
        <path d="m9.2 11.8 2 2 3.6-3.9" />
      </svg>

      <div className="text-[12.5px] leading-[1.45]">
        {/* The contrast sentence gets its own line. Run into the rest as one
            paragraph it read as small print, which is the one thing a claim
            like this cannot afford to look like. */}
        <p className="font-semibold text-slate-900">
          Other companies upload your files to view them and scrape your data.
        </p>
        <p className="mt-0.5 text-slate-600">
          We don&rsquo;t. {subject} never leaves this computer
          {except ? ` unless you choose it to (e.g. ${except})` : ''}.{' '}
          <a
            href={repo}
            target="_blank"
            rel="noopener noreferrer"
            className="whitespace-nowrap font-semibold text-orange-700 underline decoration-orange-300 underline-offset-2 hover:decoration-orange-600 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
            title="Every line of this app is public — read the source on GitHub"
          >
            Guaranteed
            <svg
              viewBox="0 0 24 24"
              className="ml-0.5 inline h-3 w-3 align-[-1px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M7 17 17 7M9 7h8v8" />
            </svg>
          </a>
        </p>
      </div>
    </div>
  )
}
