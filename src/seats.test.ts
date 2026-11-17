import { describe, expect, test } from 'bun:test';
import { addCounts, bicycleSeats, countWagonSvg, emptyCounts, parseSeatLabel } from './seats';
import { counts, fixture } from './test-helpers';

describe('parseSeatLabel', () => {
  test('normal seat in class 1', () => {
    expect(parseSeatLabel('Miejsce 15 klasa 1,  okno,  Wolne , niewybrane ')).toEqual({ cls: 1, type: null });
  });

  test('special seat: type without the number in brackets', () => {
    expect(
      parseSeatLabel('Miejsce 93 klasa 1,  środek,  Wolne , niewybrane , Miejsce dla OzN – nie na wózku (4)'),
    ).toEqual({ cls: 1, type: 'Miejsce dla OzN – nie na wózku' });
  });

  test('quiet zone is a normal seat, not a special seat', () => {
    expect(parseSeatLabel('Miejsce 21 klasa 2,  okno,  Wolne , niewybrane , Strefa Ciszy*')).toEqual({
      cls: 2,
      type: null,
    });
  });

  test.each([
    'Miejsce dla osoby na wózku',
    'Miejsce dla opiekuna osoby na wózku',
    'Przedział dla osoby z dzieckiem do lat 6',
    'Miejsce dla os. z dzieckiem do lat 6',
    'Miejsce dla osoby z rowerem',
  ])('special type: %s', (type) => {
    expect(parseSeatLabel(`Miejsce 1 klasa 2,  Wolne , niewybrane , ${type}`).type).toBe(type);
  });

  test('"klasa 12" is not class 1', () => {
    expect(parseSeatLabel('Miejsce 1 klasa 12, Wolne , niewybrane ').cls).toBe(2);
  });
});

describe('countWagonSvg with real seat maps', () => {
  test('IC 134, wagon 272, class 1: only 4 seats for disabled passengers are free', async () => {
    const c = countWagonSvg(await fixture('wagon-ic134-272.svg'));
    expect(c[1]).toEqual({ free: 0, special: 4, types: { 'Miejsce dla OzN – nie na wózku': 4 } });
    expect(c[2]).toEqual({ free: 0, special: 0, types: {} });
  });

  test('IC 134, wagon 275: class 2 wagon without compartments', async () => {
    const c = countWagonSvg(await fixture('wagon-ic134-275.svg'));
    expect(c[2]).toEqual({
      free: 0,
      special: 3,
      types: { 'Miejsce dla osoby na wózku': 1, 'Miejsce dla opiekuna osoby na wózku': 2 },
    });
  });

  test('IC 3816, wagon 13: normal seats and bicycle seats', async () => {
    const c = countWagonSvg(await fixture('wagon-ic3816-13.svg'));
    expect(c[2].free).toBe(6);
    expect(c[2].special).toBe(20);
    expect(bicycleSeats(c[2])).toBe(6);
  });

  test('free + special equals the number of status="1" seats in the file', async () => {
    for (const name of ['wagon-ic134-272.svg', 'wagon-ic134-275.svg', 'wagon-ic3816-13.svg']) {
      const svg = await fixture(name);
      const c = countWagonSvg(svg);
      expect(c[1].free + c[1].special + c[2].free + c[2].special).toBe(svg.match(/status="1"/g)!.length);
    }
  });

  test('a taken seat (status="3") is not counted', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <g aria-label="Miejsce 1 klasa 2,  Niedostepne , niewybrane "><image status="3"/></g>
      <g aria-label="Miejsce 2 klasa 2,  Wolne , niewybrane "><image status="1"/></g>
    </svg>`;
    expect(countWagonSvg(svg)[2].free).toBe(1);
  });
});

test('addCounts adds free seats, special seats and types', () => {
  const total = emptyCounts();
  addCounts(total, counts({ free: 2, special: 1, types: { X: 1 } }, { free: 3 }));
  addCounts(total, counts({ free: 1, special: 2, types: { X: 1, Y: 1 } }));
  expect(total).toEqual(counts({ free: 3, special: 3, types: { X: 2, Y: 1 } }, { free: 3 }));
});

test('bicycleSeats counts only the bicycle types', () => {
  expect(bicycleSeats({ free: 0, special: 5, types: { 'Miejsce dla osoby z rowerem': 3, OzN: 2 } })).toBe(3);
});
