/**
 * The server asks to send fewer requests: HTTP 429, or 418 that the e-IC frontend shows as
 * "Twoje żądanie nie może być obsłużone w tym momencie. Spróbuj ponownie lub wróć później."
 */
export class RateLimitError extends Error {
  /**
   * @param retryAfterMs - from the Retry-After header, or null when the header is missing or bad
   * @param status - 429 or 418
   */
  constructor(
    readonly retryAfterMs: number | null,
    readonly status = 429,
  ) {
    super(`HTTP ${status}`);
    this.name = 'RateLimitError';
  }
}

/** HTTP 404: no seat map for this train or wagon (unknown train, date, station or wagon). */
export class NotFoundError extends Error {
  constructor() {
    super('HTTP 404');
    this.name = 'NotFoundError';
  }
}

/** HTTP 5xx, a network error or a timeout, also after one retry. */
export class TransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransientError';
  }
}

/** HTTP 401 or 403: the server refuses the request. The extension must stop, not try again. */
export class RefusedError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
    this.name = 'RefusedError';
  }
}

/** The extension stopped all requests after the server refused them. */
export class StoppedError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'StoppedError';
  }
}

/**
 * Parse a Retry-After header: seconds ("120") or an HTTP date.
 * Returns milliseconds from `now`, or null.
 */
export function parseRetryAfter(value: string | null, now: number = Date.now()): number | null {
  if (!value) return null;
  const v = value.trim();
  if (/^\d+$/.test(v)) return Number(v) * 1000;
  // An HTTP date always ends with "GMT". Date.parse alone also accepts "-5" (year -5).
  if (!/GMT$/i.test(v)) return null;
  const date = Date.parse(v);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

/** No card on the screen needs this train any more, so the extension did not ask for it. */
export class CancelledError extends Error {
  constructor() {
    super('nie jest już potrzebne');
    this.name = 'CancelledError';
  }
}

/** Local data is not ready yet (the page did not load the station list). No request was sent. */
export class NotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotReadyError';
  }
}

/** The same train failed too many times in a row. IC3 does not ask for it again until the page reloads. */
export class GaveUpError extends Error {
  constructor(override readonly cause: Error) {
    super(cause.message);
    this.name = 'GaveUpError';
  }
}
