import { API_BASE } from './config';
import { CancelledError, NotFoundError, parseRetryAfter, RateLimitError, RefusedError, TransientError } from './errors';
import { apiTime } from './time';
import type { Composition, Train } from './types';

/**
 * Seat-map endpoints of the e-IC 2.0 API. See docs/api.md.
 * `from` and `to` are EPA station codes.
 */

/** Note: arrival time comes before departure time in this URL. */
export const compositionUrl = (train: Train, from: string, to: string): string =>
  `${API_BASE}grm/sklad/wbnet/${train.kategoriaPociagu}/${train.nrPociagu}/` +
  `${apiTime(train.dataPrzyjazdu)}/${from}/${apiTime(train.dataWyjazdu)}/${to}`;

/** The train of a composition URL that the page sends: category, number, departure time (YYYYMMDDHHMM). */
export function parseCompositionUrl(url: string): { kat: string; nr: string; dep: string } | null {
  const m = /\/grm\/sklad\/wbnet\/([^/]+)\/([^/]+)\/\d{12}\/[^/]+\/(\d{12})\/[^/?#]+/.exec(url);
  return m ? { kat: decodeURIComponent(m[1]!), nr: decodeURIComponent(m[2]!), dep: m[3]! } : null;
}

/** Here departure time comes before arrival time. */
export const wagonUrl = (train: Train, wagon: number, schema: string, from: string, to: string): string =>
  `${API_BASE}grm/wagon/svg/wbnet/${train.kategoriaPociagu}/${train.nrPociagu}/${wagon}/${schema}/` +
  `${apiTime(train.dataWyjazdu)}/${apiTime(train.dataPrzyjazdu)}/${from}/${to}`;

export function apiHeaders(appVersion: string): Record<string, string> {
  return {
    accept: 'application/json, text/plain, */*',
    'app-version': appVersion,
    [`app-version-${appVersion}`]: '',
  };
}

export interface SeatMapApi {
  /** `wanted` is checked before the retry: false gives CancelledError. */
  composition(train: Train, from: string, to: string, wanted?: () => boolean): Promise<Composition>;
  wagonSvg(train: Train, wagon: number, schema: string, from: string, to: string): Promise<string>;
}

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export interface ApiDeps {
  /** The page's original fetch (not the wrapped one). */
  fetch: FetchFn;
  /** Returns the version that the page sends now. */
  appVersion: () => string;
  sleep?: (ms: number) => Promise<void>;
  /** Wait before the one retry after a 5xx, a network error or a timeout. */
  retryDelayMs?: number;
  /** A request without an answer after this time counts as a network error. */
  timeoutMs?: number;
}

/**
 * Responses of the seat-map API (tested in November 2026, see docs/api.md):
 * - 404 JSON: unknown train, date, station or wagon -> NotFoundError
 * - 429, and 418 ("try again later" in the e-IC frontend) -> RateLimitError (gate.ts decides)
 * - 401, 403 -> RefusedError (gate.ts stops all requests)
 * - 5xx, network error, timeout -> one retry, then TransientError.
 *   Before the retry, `wanted` decides if the request is still needed: if not, CancelledError.
 */
export function createApi(deps: ApiDeps): SeatMapApi {
  const { sleep = (ms) => new Promise((r) => setTimeout(r, ms)), retryDelayMs = 2000, timeoutMs = 15_000 } = deps;

  async function get(url: string, wanted?: () => boolean): Promise<Response> {
    const again = async () => {
      await sleep(retryDelayMs);
      if (wanted && !wanted()) throw new CancelledError();
    };
    for (let attempt = 1; ; attempt++) {
      const retry = attempt < 2;
      let res: Response;
      try {
        res = await deps.fetch(url, {
          headers: apiHeaders(deps.appVersion()),
          credentials: 'include',
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        if (retry) {
          await again();
          continue;
        }
        throw new TransientError('brak odpowiedzi serwera');
      }
      const { status } = res;
      if (status === 429 || status === 418) {
        throw new RateLimitError(parseRetryAfter(res.headers.get('retry-after')), status);
      }
      if (status === 401 || status === 403) throw new RefusedError(status);
      if (status === 404) throw new NotFoundError();
      if (status >= 500) {
        if (retry) {
          await again();
          continue;
        }
        throw new TransientError(`HTTP ${status}`);
      }
      if (!res.ok) throw new Error(`HTTP ${status}`);
      return res;
    }
  }
  return {
    composition: async (train, from, to, wanted) =>
      (await get(compositionUrl(train, from, to), wanted)).json() as Promise<Composition>,
    wagonSvg: async (train, wagon, schema, from, to) => (await get(wagonUrl(train, wagon, schema, from, to))).text(),
  };
}
