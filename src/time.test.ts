import { expect, test } from 'bun:test';
import { apiTime, datePart, hhmm } from './time';

test('apiTime, datePart, hhmm', () => {
  const t = '2026-11-15 09:53:00';
  expect(apiTime(t)).toBe('202611150953');
  expect(datePart(t)).toBe('2026-11-15');
  expect(hhmm(t)).toBe('09:53');
});
