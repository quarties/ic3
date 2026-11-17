import { describe, expect, test } from 'bun:test';
import { createConnectionStore } from './connections';
import { connection, train } from './test-helpers';

const ic54 = (date: string) =>
  connection(train({ nrPociagu: 54, dataWyjazdu: `${date} 04:10:00`, dataPrzyjazdu: `${date} 07:06:00` }));

const card = { dep: '04:10', arr: '07:06', text: 'IC 54 Odra Kraków Gł. Wrocław Gł.' };

test('remember: false for JSON that is not a search response', () => {
  const store = createConnectionStore();
  expect(store.remember({ cenyPolaczen: [] })).toBe(false);
  expect(store.remember(null)).toBe(false);
});

describe('find', () => {
  test('finds the connection by date, times and train number', () => {
    const store = createConnectionStore();
    store.remember({ polaczenia: [ic54('2026-11-15')] });
    expect(store.find({ date: '2026-11-15', ...card })?.dataWyjazdu).toBe('2026-11-15 04:10:00');
  });

  // Bug in v0.1 before the fix: the page of 16.11 showed the data of 15.11.
  test('does not mix days: the same train and times on 16.11 gives the 16.11 connection', () => {
    const store = createConnectionStore();
    store.remember({ polaczenia: [ic54('2026-11-15')] });
    store.remember({ polaczenia: [ic54('2026-11-16')] });
    expect(store.find({ date: '2026-11-16', ...card })?.dataWyjazdu).toBe('2026-11-16 04:10:00');
    expect(store.find({ date: '2026-11-15', ...card })?.dataWyjazdu).toBe('2026-11-15 04:10:00');
  });

  test('a date without a matching connection: null, not a connection of another day', () => {
    const store = createConnectionStore();
    store.remember({ polaczenia: [ic54('2026-11-16')] });
    expect(store.find({ date: '2026-11-15', ...card })).toBeNull();
  });

  test('the date from a real search URL of the page matches the key', () => {
    // Copied from ebilet.intercity.pl in November 2026.
    const url = '?dwyj=2026-11-15&swyj=85&sprzy=242&time=21%3A00&przy=0&sprzez=&ticket100=1010&ticket50=&polbez=0';
    const store = createConnectionStore();
    store.remember({ polaczenia: [ic54('2026-11-15')] });
    expect(store.find({ date: new URLSearchParams(url).get('dwyj'), ...card })).not.toBeNull();
  });

  test('no date in the URL: use the most recent response', () => {
    const store = createConnectionStore();
    store.remember({ polaczenia: [ic54('2026-11-15')] });
    store.remember({ polaczenia: [ic54('2026-11-16')] });
    expect(store.find({ date: null, ...card })?.dataWyjazdu).toBe('2026-11-16 04:10:00');
  });

  test('two connections at the same times: choose by the train numbers on the card', () => {
    const store = createConnectionStore();
    const a = connection(train({ nrPociagu: 4161, dataWyjazdu: '2026-11-15 18:05:00' }), train({ nrPociagu: 1646 }));
    const b = connection(train({ nrPociagu: 4161, dataWyjazdu: '2026-11-15 18:05:00' }), train({ nrPociagu: 302 }));
    store.remember({ polaczenia: [a, b] });
    const q = { date: '2026-11-15', dep: '18:05', arr: '12:50' };
    expect(store.find({ ...q, text: '4161 Beskidy 302 Danubius' })).toBe(b);
    expect(store.find({ ...q, text: '4161 Beskidy 1646 Konopnicka' })).toBe(a);
  });

  test('not sure which connection: return null, not a wrong train', () => {
    const store = createConnectionStore();
    const a = connection(train({ nrPociagu: 1, dataWyjazdu: '2026-11-15 10:00:00' }));
    const b = connection(train({ nrPociagu: 2, dataWyjazdu: '2026-11-15 10:00:00' }));
    store.remember({ polaczenia: [a, b] });
    expect(store.find({ date: '2026-11-15', dep: '10:00', arr: '12:50', text: 'no numbers' })).toBeNull();
  });

  test('the same response twice does not add duplicates', () => {
    const store = createConnectionStore();
    const json = { polaczenia: [ic54('2026-11-15')] };
    store.remember(json);
    store.remember(structuredClone(json));
    expect(store.find({ date: '2026-11-15', ...card, text: '' })).not.toBeNull();
  });
});
