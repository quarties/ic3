import { datePart, hhmm } from './time';
import type { Connection, SearchResponse } from './types';

/** Key of a connection: departure date and time + arrival time, e.g. "2026-11-15 04:10>07:06". */
export const connectionKey = (date: string, dep: string, arr: string): string => `${date} ${dep}>${arr}`;

const trainNumbers = (c: Connection) => c.pociagi.map((t) => t.nrPociagu).join();
const sameConnection = (a: Connection, b: Connection) =>
  a.dataWyjazdu === b.dataWyjazdu && trainNumbers(a) === trainNumbers(b);

const isSearchResponse = (json: unknown): json is SearchResponse =>
  !!json && Array.isArray((json as SearchResponse).polaczenia);

export interface CardQuery {
  /** Search date from the URL ("dwyj"), e.g. "2026-11-15". */
  date: string | null;
  /** Departure "HH:MM" on the card. */
  dep: string;
  /** Arrival "HH:MM" on the card. */
  arr: string;
  /** All text of the card, to check the train numbers. */
  text: string;
}

export interface ConnectionStore {
  /** Add the connections of one search response. Returns false for other JSON. */
  remember(json: unknown): boolean;
  /** Find the connection of one card on the page. */
  find(q: CardQuery): Connection | null;
}

/** Connections from the search responses of the page. */
export function createConnectionStore(): ConnectionStore {
  const byKey = new Map<string, Connection[]>();
  let lastBatch: Connection[] = []; // connections from the most recent response, for a URL without a date

  return {
    remember(json) {
      if (!isSearchResponse(json)) return false;
      lastBatch = json.polaczenia;
      for (const c of json.polaczenia) {
        const key = connectionKey(datePart(c.dataWyjazdu), hhmm(c.dataWyjazdu), hhmm(c.dataPrzyjazdu));
        const list = byKey.get(key) ?? [];
        if (!list.some((x) => sameConnection(x, c))) list.push(c);
        byKey.set(key, list);
      }
      return true;
    },

    find({ date, dep, arr, text }) {
      // The list on the page shows only departures on the date in the URL ("Later" stops at
      // midnight, checked in November 2026). So with a date, never use a connection of another day.
      // Without a date, use the most recent response.
      const list = date
        ? (byKey.get(connectionKey(date, dep, arr)) ?? [])
        : lastBatch.filter((c) => hhmm(c.dataWyjazdu) === dep && hhmm(c.dataPrzyjazdu) === arr);
      if (!list.length) return null;
      const match = list.find((c) => c.pociagi.every((t) => text.includes(String(t.nrPociagu))));
      // If the train numbers do not decide, show nothing rather than data of a wrong train.
      return match ?? (list.length === 1 ? list[0]! : null);
    },
  };
}
