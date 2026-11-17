import { expect, test } from 'bun:test';
import { LIBRARY_STORAGE_KEY } from './config';
import { createStationLookup } from './stations';
import { memoryStorage } from './test-helpers';

const library = {
  data: {
    stationsList: [
      { kod: 85, nazwa: 'Kraków Gł.', kodEPA: 5100051, kodEVA: 5100028 },
      { kod: 248, nazwa: 'Wrocław Gł.', kodEPA: 5100143, kodEVA: 5100069 },
    ],
  },
};

test('maps the search code to the EPA code', () => {
  const storage = memoryStorage();
  storage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(library));
  const epa = createStationLookup(storage);
  expect(epa(85)).toBe('5100051');
  expect(epa(248)).toBe('5100143');
});

test('unknown station: error with the code', () => {
  const storage = memoryStorage();
  storage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(library));
  expect(() => createStationLookup(storage)(999)).toThrow('nieznana stacja 999');
});

test('reads the list again later, if the page did not load it yet', () => {
  const storage = memoryStorage();
  const epa = createStationLookup(storage);
  expect(() => epa(85)).toThrow('brak listy stacji');
  storage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(library));
  expect(epa(85)).toBe('5100051');
});
