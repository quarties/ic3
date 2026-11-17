// Shared helpers for the *.test.ts files. The extension code does not import this file.
import type { Connection, KeyValueStorage, SeatCounts, Train, TrainResult } from './types';

export const fixture = (name: string): Promise<string> =>
  Bun.file(new URL(`./__fixtures__/${name}`, import.meta.url)).text();

export const fixtureJson = async <T>(name: string): Promise<T> => JSON.parse(await fixture(name)) as T;

/** One train, as the connection search returns it. Default: IC 134, 15.11, Kraków Gł. -> Wrocław Gł. */
export const train = (over: Partial<Train> = {}): Train => ({
  kategoriaPociagu: 'IC',
  nrPociagu: 134,
  nazwaPociagu: 'Via regia / Wyczółkowski',
  dataWyjazdu: '2026-11-15 09:53:00',
  dataPrzyjazdu: '2026-11-15 12:50:00',
  stacjaWyjazdu: 85,
  stacjaPrzyjazdu: 248,
  ...over,
});

export const connection = (...trains: Train[]): Connection => ({
  pociagi: trains,
  dataWyjazdu: trains[0]!.dataWyjazdu,
  dataPrzyjazdu: trains.at(-1)!.dataPrzyjazdu,
});

type PartialClass = Partial<SeatCounts[1]>;

export const counts = (c1: PartialClass = {}, c2: PartialClass = {}): SeatCounts => ({
  1: { free: 0, special: 0, types: {}, ...c1 },
  2: { free: 0, special: 0, types: {}, ...c2 },
});

export const result = (c1: PartialClass = {}, c2: PartialClass = {}, time = 0): TrainResult => ({
  ...counts(c1, c2),
  time,
});

/** In-memory Web Storage. */
export function memoryStorage(): KeyValueStorage & { raw: Map<string, string> } {
  const raw = new Map<string, string>();
  return {
    raw,
    getItem: (k) => raw.get(k) ?? null,
    setItem: (k, v) => void raw.set(k, String(v)),
  };
}

/** A clock for tests: `now()` returns `t`, change `t` to move time. */
export function fakeClock(start = 1_000_000) {
  const clock = { t: start, now: () => clock.t };
  return clock;
}
