import { describe, expect, test } from 'bun:test';
import { result } from '../test-helpers';
import type { TrainResult } from '../types';
import { badgeText, seats, tooltipText } from './format';

const one = (leg: TrainResult) => ({ legs: [leg], total: leg });
const BIKE = 'Miejsce dla osoby z rowerem';

describe('badgeText', () => {
  test('free seats, no special seats: no "+0"', () => {
    expect(badgeText(one(result({ free: 36 })), 1)).toEqual({ state: 'ok', main: '36 wolnych', sub: '' });
  });

  test('free seats and special seats with bicycles', () => {
    const r = one(result({}, { free: 87, special: 32, types: { [BIKE]: 18, OzN: 14 } }));
    expect(badgeText(r, 2)).toEqual({ state: 'ok', main: '87 wolnych', sub: '+32 specjalne (🚲 18)' });
  });

  test('only special seats: the number is in the main line', () => {
    expect(badgeText(one(result({}, { special: 7 })), 2)).toEqual({
      state: 'special',
      main: 'tylko specjalne: 7',
      sub: '',
    });
  });

  test('only special seats with bicycles', () => {
    expect(badgeText(one(result({}, { special: 3, types: { [BIKE]: 3 } })), 2).sub).toBe('w tym 🚲 3');
  });

  test('no seats', () => {
    expect(badgeText(one(result()), 1)).toEqual({ state: 'none', main: 'brak miejsc', sub: '' });
  });

  test('connection with changes: no bicycle note', () => {
    const leg = result({}, { free: 5, special: 2, types: { [BIKE]: 2 } });
    expect(badgeText({ legs: [leg, leg], total: leg }, 2).sub).toBe('+2 specjalne');
  });
});

describe('tooltipText', () => {
  const time = () => '19:08:59';

  test('one train: types sorted by number, then the time', () => {
    const r = one(result({ special: 7, types: { A: 2, B: 5 } }));
    expect(tooltipText(r, 1, time)).toBe('B: 5\nA: 2\n\nDane z 19:08:59');
  });

  test('no special seats: only the time', () => {
    expect(tooltipText(one(result({ free: 3 })), 1, time)).toBe('Dane z 19:08:59');
  });

  test('connection with changes: a block for each leg, oldest time', () => {
    const a = result({ free: 4, special: 6, types: { OzN: 6 } }, {}, 200);
    const b = result({ free: 0, special: 0 }, {}, 100);
    const seen: number[] = [];
    const text = tooltipText({ legs: [a, b], total: a }, 1, (t) => (seen.push(t), 'T'));
    expect(text).toBe('Odcinek 1: 4 zwykłe, 6 specjalnych\n   OzN: 6\nOdcinek 2: 0 zwykłych, 0 specjalnych\n\nDane z T');
    expect(seen).toEqual([100]);
  });
});

test.each([
  [1, '1 wolne'],
  [2, '2 wolne'],
  [4, '4 wolne'],
  [5, '5 wolnych'],
  [11, '11 wolnych'],
  [12, '12 wolnych'],
  [14, '14 wolnych'],
  [22, '22 wolne'],
  [25, '25 wolnych'],
  [112, '112 wolnych'],
  [124, '124 wolne'],
  [0, '0 wolnych'],
])('Polish plural: %i -> %s', (n, text) => {
  expect(seats(n, 'wolne', 'wolnych')).toBe(text);
});
