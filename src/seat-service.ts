import { RETRY_MS } from './config';
import { apiTime } from './time';
import type { Cache } from './cache';
import { CancelledError, GaveUpError, NotFoundError, NotReadyError, StoppedError } from './errors';
import type { Enqueue } from './queue';
import type { Connection, ConnectionResult, SeatCounts, Train, TrainResult } from './types';

/** Key of one train on one leg. The departure date is part of it, so days never mix. */
export const trainKey = (t: Train): string =>
  [t.kategoriaPociagu, t.nrPociagu, t.dataWyjazdu, t.stacjaWyjazdu, t.stacjaPrzyjazdu].join('|');

/** A train as a composition URL of the page names it: category, number, departure time (YYYYMMDDHHMM). */
export interface TrainRef {
  kat: string;
  nr: string;
  dep: string;
}

export const isTrain = (t: Train, ref: TrainRef): boolean =>
  t.kategoriaPociagu === ref.kat && String(t.nrPociagu) === ref.nr && apiTime(t.dataWyjazdu) === ref.dep;

/** For a connection with changes, a passenger needs a seat on every leg: use the minimum. */
export function mergeLegs(legs: TrainResult[]): TrainResult {
  if (legs.length === 1) return legs[0]!;
  const min = (pick: (l: TrainResult) => number) => Math.min(...legs.map(pick));
  return {
    time: min((l) => l.time),
    1: { free: min((l) => l[1].free), special: min((l) => l[1].special), types: {} },
    2: { free: min((l) => l[2].free), special: min((l) => l[2].special), types: {} },
  };
}

/** Returns true while a card on the screen still needs the result. */
export type Wanted = () => boolean;

export interface SeatService {
  /** Without `wanted`, the train is always counted. */
  train(t: Train, wanted?: Wanted): Promise<TrainResult>;
  connection(c: Connection, wanted?: Wanted): Promise<ConnectionResult>;
  /**
   * Forget the seat data of one train, so the next count asks again.
   * The error state stays: the wait after an error, GaveUpError and 404.
   * Returns true when this tab had data for the train.
   */
  forget(ref: TrainRef): boolean;
  /**
   * Milliseconds until IC3 asks again for the failed trains of this connection.
   * Infinity: not on this page. Null: no error is stored.
   */
  retryIn(c: Connection): number | null;
}

export interface SeatServiceDeps {
  /** Counts the seats of one train (train-counter.ts). Stops with CancelledError when `wanted()` is false before the first request. */
  count: (t: Train, wanted: Wanted) => Promise<SeatCounts>;
  cache: Cache<SeatCounts>;
  enqueue: Enqueue;
  ttlMs: number;
  /** After a failed count, the same train gets no new request for this time. Default: RETRY_MS (60 s). */
  retryMs?: number;
  /** After this many failed counts in a row, IC3 does not ask for the train again (GaveUpError). */
  maxFailures?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  trainDelayMs?: number;
}

export const MAX_FAILURES = 3;

interface Pending {
  time: number;
  promise: Promise<TrainResult>;
  /** The cards that wait for this count. Empty when the count is done. */
  wanted: Wanted[];
  done: boolean;
}

interface Failure {
  error: Error;
  /** No new request before this time. */
  until: number;
  /** Failed counts in a row. */
  count: number;
}

/** Errors that say nothing about the train: do not remember them. */
const isLocal = (e: unknown) => e instanceof CancelledError || e instanceof NotReadyError || e instanceof StoppedError;

/**
 * Seat results for trains and connections, with a cache and one request queue.
 * - A count starts only while a card on the screen needs the train. If not, it fails with CancelledError.
 *   A started count goes to the end and fills the cache.
 * - After a failed count, the train gets no new request for `retryMs`: all cards get the same error.
 *   After `maxFailures` failures in a row, the train fails with GaveUpError until the page reloads.
 */
export function createSeatService(deps: SeatServiceDeps): SeatService {
  const { count, cache, enqueue, ttlMs, now = Date.now, sleep, trainDelayMs = 0 } = deps;
  const { retryMs = RETRY_MS, maxFailures = MAX_FAILURES } = deps;
  // One request for each train in this tab, also when many cards ask at the same time.
  const pending = new Map<string, Pending>();
  const failures = new Map<string, Failure>();

  function remember(key: string, error: unknown): void {
    if (isLocal(error) || error instanceof GaveUpError) return;
    // 404: no seat map for this train. The answer does not change, so do not ask again.
    if (error instanceof NotFoundError) return void failures.set(key, { error, until: Infinity, count: 1 });
    const count = (failures.get(key)?.count ?? 0) + 1;
    const gaveUp = count >= maxFailures;
    failures.set(key, {
      error: gaveUp ? new GaveUpError(error as Error) : (error as Error),
      until: gaveUp ? Infinity : now() + retryMs,
      count,
    });
  }

  function train(t: Train, wanted: Wanted = () => true): Promise<TrainResult> {
    const key = trainKey(t);
    const hit = pending.get(key);
    if (hit && now() - hit.time < ttlMs) {
      if (!hit.done) hit.wanted.push(wanted);
      return hit.promise;
    }

    // Another tab can have the data, also when this tab failed: the cache comes first.
    const stored = cache.get(key);
    if (stored) {
      const promise = Promise.resolve({ ...stored.data, time: stored.time });
      pending.set(key, { time: stored.time, promise, wanted: [], done: true });
      return promise;
    }

    const failed = failures.get(key);
    if (failed && now() < failed.until) return Promise.reject(failed.error);

    const waiting: Wanted[] = [wanted];
    const stillWanted = () => waiting.some((w) => w());
    /** A cancelled count must not catch the next card that asks for this train. */
    const cancel = (): never => {
      if (pending.get(key) === entry) pending.delete(key);
      throw new CancelledError();
    };
    const promise = enqueue(async (): Promise<TrainResult> => {
      // Another tab can fill the cache while this task waits in the queue.
      const late = cache.get(key);
      if (late) return { ...late.data, time: late.time };
      if (!stillWanted()) cancel();
      let data: SeatCounts;
      try {
        data = await count(t, stillWanted);
      } catch (e) {
        if (e instanceof CancelledError) cancel();
        // No request went out (or all requests stopped): no pause before the next train.
        if (isLocal(e)) throw e;
        if (trainDelayMs && sleep) await sleep(trainDelayMs);
        throw e;
      }
      const time = now();
      cache.put(key, data, time);
      if (trainDelayMs && sleep) await sleep(trainDelayMs);
      return { ...data, time };
    });
    const entry: Pending = { time: now(), promise, wanted: waiting, done: false };
    pending.set(key, entry);
    // When the count is done, drop the closures: they hold card elements.
    const done = () => {
      entry.done = true;
      waiting.length = 0;
    };
    promise.then(
      () => {
        done();
        failures.delete(key);
      },
      (error) => {
        done();
        if (pending.get(key) === entry) pending.delete(key);
        remember(key, error);
      },
    );
    return promise;
  }

  /** Count all legs. When one leg fails, the other legs are not needed any more. */
  async function connection(c: Connection, wanted: Wanted = () => true): Promise<ConnectionResult> {
    let failed = false;
    const legWanted = () => !failed && wanted();
    const legs = await Promise.all(
      c.pociagi.map((t) =>
        train(t, legWanted).catch((e: unknown) => {
          failed = true;
          throw e;
        }),
      ),
    );
    return { legs, total: mergeLegs(legs) };
  }

  function forget(ref: TrainRef): boolean {
    const match = (key: string) => {
      const [k, n, d] = key.split('|');
      return k === ref.kat && n === ref.nr && apiTime(d ?? '') === ref.dep;
    };
    let found = false;
    for (const [key, entry] of pending) {
      // A count that still runs gives new data: keep it.
      if (match(key) && entry.done) found = pending.delete(key) || found;
    }
    // Keep the failures: the seat map of the page does not make the API answer IC3 again.
    cache.remove(match);
    return found;
  }

  function retryIn(c: Connection): number | null {
    let wait: number | null = null;
    for (const t of c.pociagi) {
      const failed = failures.get(trainKey(t));
      if (failed) wait = Math.max(wait ?? 0, failed.until - now());
    }
    return wait === null ? null : Math.max(0, wait);
  }

  return { train, connection, forget, retryIn };
}
