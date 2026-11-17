import type { KeyValueStorage } from './types';

export interface CacheEntry<T> {
  time: number;
  data: T;
}

export interface Cache<T> {
  get(id: string): CacheEntry<T> | null;
  put(id: string, data: T, time?: number): void;
  /** Remove the entries whose id matches. */
  remove(match: (id: string) => boolean): void;
}

/**
 * Small time-limited cache in Web Storage (localStorage). It survives a page reload
 * and all tabs of the same site share it. If the storage is full or blocked,
 * the cache does nothing and the extension works without it.
 */
export function createCache<T>(opts: {
  storage: KeyValueStorage;
  key: string;
  ttlMs: number;
  now?: () => number;
}): Cache<T> {
  const { storage, key, ttlMs, now = Date.now } = opts;

  function readAll(): Record<string, CacheEntry<T>> {
    try {
      return JSON.parse(storage.getItem(key) ?? 'null') ?? {};
    } catch {
      return {};
    }
  }

  const fresh = (entry: CacheEntry<T> | undefined): entry is CacheEntry<T> =>
    !!entry && now() - entry.time < ttlMs;

  return {
    get(id) {
      const entry = readAll()[id];
      return fresh(entry) ? entry : null;
    },
    put(id, data, time = now()) {
      try {
        const all = readAll();
        for (const k of Object.keys(all)) if (!fresh(all[k])) delete all[k];
        all[id] = { time, data };
        storage.setItem(key, JSON.stringify(all));
      } catch {
        /* storage full or blocked */
      }
    },
    remove(match) {
      try {
        const all = readAll();
        const ids = Object.keys(all).filter(match);
        if (!ids.length) return;
        for (const id of ids) delete all[id];
        storage.setItem(key, JSON.stringify(all));
      } catch {
        /* storage blocked */
      }
    },
  };
}
