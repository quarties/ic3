import { expect, test } from 'bun:test';
import { createCache } from './cache';
import { fakeClock, memoryStorage } from './test-helpers';

const setup = () => {
  const storage = memoryStorage();
  const clock = fakeClock();
  const cache = createCache<string>({ storage, key: 'k', ttlMs: 60_000, now: clock.now });
  return { storage, clock, cache };
};

test('returns an entry until the TTL ends', () => {
  const { clock, cache } = setup();
  cache.put('a', 'data');
  clock.t += 59_999;
  expect(cache.get('a')).toEqual({ time: clock.t - 59_999, data: 'data' });
  clock.t += 1;
  expect(cache.get('a')).toBeNull();
});

test('a new cache on the same storage sees the entries (page reload, other tab)', () => {
  const { storage, clock, cache } = setup();
  cache.put('a', 'data');
  const other = createCache<string>({ storage, key: 'k', ttlMs: 60_000, now: clock.now });
  expect(other.get('a')?.data).toBe('data');
});

test('put removes old entries', () => {
  const { storage, clock, cache } = setup();
  cache.put('old', 'x');
  clock.t += 60_000;
  cache.put('new', 'y');
  expect(Object.keys(JSON.parse(storage.getItem('k')!))).toEqual(['new']);
});

test('broken JSON in storage: empty cache, no error', () => {
  const { storage, cache } = setup();
  storage.setItem('k', '{not json');
  expect(cache.get('a')).toBeNull();
});

test('storage full or blocked: put does not throw', () => {
  const cache = createCache<string>({
    storage: {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    },
    key: 'k',
    ttlMs: 1000,
  });
  expect(() => cache.put('a', 'x')).not.toThrow();
});
