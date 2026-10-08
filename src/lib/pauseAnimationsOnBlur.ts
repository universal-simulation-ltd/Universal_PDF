// Endless animations rest while the window is not focused (James, 2026-10-08:
// "stop animations when it loses focus (once it's at the end of that current
// loop)").
//
// WHY. The welcome screen runs ~30 infinite animations — the drop ring's spin
// and its 25 glowing dots, the page being drawn, the brand bar's pulse — and
// every one of them keeps Chromium's compositor drawing at 60 fps for as long
// as the window is VISIBLE, focused or not. A desktop window sitting behind
// another app's window but still on screen is exactly that case: memory, CPU
// and battery spent on decoration nobody is looking at.
//
// HOW. On blur, each running infinite animation is left to finish the loop it
// is in, then parked on that loop's last frame — never frozen mid-motion,
// which reads as a glitch. On focus, every parked one plays on from there, and
// any still waiting for its loop to end simply carries on.
//
// ⚠️ Only animations with `iterations: Infinity`. A one-shot transition (a
// dialog sliding in, a toast fading) must always finish, focused or not.
//
// Covers CSS animations and Web Animations alike (`document.getAnimations()`),
// including the SDK's, so nothing here needs to know which component runs one.

type Parked = { timer: ReturnType<typeof setTimeout> | null }

export function installPauseAnimationsOnBlur(): () => void {
  if (typeof document === 'undefined' || typeof document.getAnimations !== 'function') return () => {}

  const parked = new Map<Animation, Parked>()
  let blurred = false

  function park(a: Animation) {
    if (parked.has(a) || a.playState !== 'running') return
    const timing = a.effect?.getComputedTiming()
    if (!timing || timing.iterations !== Infinity) return
    const duration = Number(timing.duration)
    const now = Number(a.currentTime)
    if (!(duration > 0) || !Number.isFinite(now)) return
    // Time into the current loop, from the animation's own clock — direction
    // (alternate, reverse) does not matter, a loop is a loop.
    const elapsed = now - Number(timing.delay ?? 0)
    const into = ((elapsed % duration) + duration) % duration
    const remaining = elapsed < 0 ? -elapsed + duration : duration - into
    // A hair short of the boundary, so it rests on THIS loop's last frame
    // rather than the first frame of the next.
    const boundary = now + remaining - 1
    const rate = Math.abs(a.playbackRate) || 1
    const entry: Parked = { timer: null }
    entry.timer = setTimeout(() => {
      entry.timer = null
      try {
        a.pause()
        a.currentTime = boundary
      } catch {
        /* the animation was cancelled meanwhile — nothing to park */
      }
    }, remaining / rate)
    parked.set(a, entry)
  }

  function onBlur() {
    blurred = true
    for (const a of document.getAnimations()) park(a)
  }

  function onFocus() {
    blurred = false
    for (const [a, entry] of parked) {
      if (entry.timer) clearTimeout(entry.timer)
      else if (a.playState === 'paused') a.play()
    }
    parked.clear()
  }

  // An animation that STARTS while the window is unfocused (a component
  // mounting in the background) is parked too. CSS animations announce
  // themselves; the event bubbles to the document.
  function onAnimationStart(e: AnimationEvent) {
    if (!blurred) return
    const target = e.target as Element | null
    for (const a of target?.getAnimations?.() ?? []) park(a)
  }

  window.addEventListener('blur', onBlur)
  window.addEventListener('focus', onFocus)
  document.addEventListener('animationstart', onAnimationStart, true)
  // Opened in the background (an OS "open with" while another app has focus).
  if (!document.hasFocus()) onBlur()

  return () => {
    window.removeEventListener('blur', onBlur)
    window.removeEventListener('focus', onFocus)
    document.removeEventListener('animationstart', onAnimationStart, true)
    onFocus()
  }
}
