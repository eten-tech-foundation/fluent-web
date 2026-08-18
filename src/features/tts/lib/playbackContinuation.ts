/**
 * Cross-page playback continuation (T16, §5.3).
 *
 * T16 says the end of a page PAUSES and asks; only confirmation navigates.
 * But "Continue on the next page?" promises more than a page turn — the
 * listener expects the reading to carry on. The queue cannot deliver that
 * itself: navigation tears the drafting route down (`gcTime: 0`), taking the
 * queue's session with it, so the intent has to survive the page change and
 * be re-armed by whatever mounts next.
 *
 * That intent lives here rather than in route state on purpose. History state
 * is replayed by Back/Forward and by a reload, and audio that starts because
 * someone pressed Back is a bug the user cannot explain. Module memory dies
 * with the document, which is exactly the lifetime the promise has.
 *
 * Three properties keep it from firing when nobody asked:
 *   1. **Addressed** — a claim only succeeds for the page that was promised,
 *      so a navigation that lands somewhere else never plays.
 *   2. **Single-shot** — a successful claim consumes it; a second mount of
 *      the same page is silent.
 *   3. **Perishable** — an unclaimed intent expires, so a navigation that
 *      never completes cannot make a later, unrelated visit start talking.
 */

/**
 * How long an armed continuation stays claimable. Generous next to a route
 * change (loader + render), short next to a human deciding to go somewhere on
 * their own — the window in which an unclaimed intent is still explicable.
 */
export const TTS_CONTINUATION_TTL_MS = 30_000;

interface ArmedContinuation {
  pageKey: string;
  armedAt: number;
}

let armed: ArmedContinuation | null = null;

/**
 * Record that playback should resume when `pageKey` arrives. Called BEFORE
 * navigating: the destination can mount before `navigate()` resolves.
 */
export const armTtsContinuation = (pageKey: string, now: number = Date.now()): void => {
  armed = { pageKey, armedAt: now };
};

/** Cancel an armed continuation — e.g. the navigation it was armed for failed. */
export const disarmTtsContinuation = (): void => {
  armed = null;
};

/**
 * True when this page is the one playback was promised to, consuming the
 * intent so it cannot fire twice.
 *
 * A mismatch deliberately leaves the intent alone: between arming and the
 * page change the OLD page re-renders and asks too, and clearing on its
 * miss would throw away the very intent it is about to hand over.
 */
export const claimTtsContinuation = (pageKey: string, now: number = Date.now()): boolean => {
  if (!armed) return false;

  if (now - armed.armedAt > TTS_CONTINUATION_TTL_MS) {
    armed = null;
    return false;
  }

  if (armed.pageKey !== pageKey) return false;

  armed = null;
  return true;
};
