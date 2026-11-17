import { expect, test } from 'bun:test';
import { parseRetryAfter } from './errors';

test('Retry-After in seconds', () => {
  expect(parseRetryAfter('120')).toBe(120_000);
  expect(parseRetryAfter(' 0 ')).toBe(0);
});

test('Retry-After as an HTTP date', () => {
  const now = Date.parse('Fri, 13 Nov 2026 20:00:00 GMT');
  expect(parseRetryAfter('Fri, 13 Nov 2026 20:00:30 GMT', now)).toBe(30_000);
  expect(parseRetryAfter('Fri, 13 Nov 2026 19:59:00 GMT', now)).toBe(0);
});

test('Retry-After missing or bad: null', () => {
  expect(parseRetryAfter(null)).toBeNull();
  expect(parseRetryAfter('soon')).toBeNull();
  expect(parseRetryAfter('-5')).toBeNull();
});
