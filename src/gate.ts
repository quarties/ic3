import { CancelledError, RateLimitError, RefusedError, StoppedError } from './errors';

/** Wait at most this long after a 429. A longer Retry-After stops the extension. */
export const MAX_RETRY_AFTER_MS = 60_000;
/** Wait this long after a 429 without a usable Retry-After. */
export const DEFAULT_RETRY_AFTER_MS = 30_000;

export interface GateDeps {
  now?: () => number;
  sleep: (ms: number) => Promise<void>;
  /** At most `max` requests in any `windowMs`. Then the next request waits. */
  rate?: { max: number; windowMs: number };
  /** Called with true when requests start to wait (limit or 429 pause), and with false when the wait ends. */
  onWait?: (waiting: boolean) => void;
}

/**
 * One switch for all requests of the page. The server decides:
 * - the first 429: pause all requests for Retry-After, then send that request once more,
 * - 401 or 403, a second 429 on this page, or a Retry-After longer than 60 s: stop until the page reloads.
 * The extension never tries to get past a refusal.
 */
export function createGate({ now = Date.now, sleep, rate, onWait }: GateDeps) {
  let pausedUntil = 0;
  let rateLimits = 0;
  let stopped: string | null = null;
  /** Start times of the recent requests. */
  const sent: number[] = [];
  /** Requests that wait now. */
  let waiting = 0;

  async function wait(ms: number): Promise<void> {
    if (waiting++ === 0) onWait?.(true);
    try {
      await sleep(ms);
    } finally {
      if (--waiting === 0) onWait?.(false);
    }
  }

  function stop(reason: string): never {
    stopped ??= reason;
    throw new StoppedError(stopped);
  }

  async function ready(): Promise<void> {
    if (stopped) throw new StoppedError(stopped);
    const left = pausedUntil - now();
    if (left > 0) await wait(Math.min(left, MAX_RETRY_AFTER_MS)); // at most 60 s, also if the clock went back
    if (stopped) throw new StoppedError(stopped);
  }

  /** Wait while `rate.max` requests went out in the last `rate.windowMs`. */
  async function slot(): Promise<void> {
    if (!rate) return;
    for (;;) {
      if (stopped) throw new StoppedError(stopped);
      const t = now();
      while (sent.length && (t - sent[0]! >= rate.windowMs || sent[0]! > t)) sent.shift(); // also if the clock went back
      if (sent.length < rate.max) return;
      await wait(Math.min(sent[0]! + rate.windowMs - t, rate.windowMs));
    }
  }

  /**
   * Run `task` (one request) when the gate allows it. Handle 429, 401 and 403 as described above.
   * After a pause, `wanted` decides if the request is still needed: if not, throw CancelledError.
   */
  async function run<T>(task: () => Promise<T>, wanted?: () => boolean): Promise<T> {
    for (;;) {
      await ready();
      await slot();
      // A pause or the limit can be long: the user can scroll away in that time.
      if (wanted && !wanted()) throw new CancelledError();
      sent.push(now());
      try {
        return await task();
      } catch (e) {
        if (e instanceof RefusedError) stop(`serwer odmówił (${e.message})`);
        if (!(e instanceof RateLimitError)) throw e;
        rateLimits++;
        const pause = e.retryAfterMs ?? DEFAULT_RETRY_AFTER_MS;
        if (rateLimits >= 2 || pause > MAX_RETRY_AFTER_MS) stop(`serwer ogranicza zapytania (${e.message})`);
        pausedUntil = Math.max(pausedUntil, now() + pause);
      }
    }
  }

  return { run, isStopped: () => stopped !== null };
}

export type Gate = ReturnType<typeof createGate>;
