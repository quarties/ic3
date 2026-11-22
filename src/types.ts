/**
 * Types of the e-IC 2.0 API (see docs/api.md) and of the seat counts.
 * Field names of the API stay in Polish, as the API sends them.
 */

/** One train on one leg: one item of `pociagi[]` in the connection search. */
export interface Train {
  kategoriaPociagu: string; // "IC", "TLK", "EIP", …
  nrPociagu: number;
  nazwaPociagu?: string;
  dataWyjazdu: string; // "2026-11-15 09:53:00"
  dataPrzyjazdu: string;
  stacjaWyjazdu: number; // station code `kod` of the search, not EPA
  stacjaPrzyjazdu: number;
}

/** One connection: one or more trains (with changes). One item of `polaczenia[]`. */
export interface Connection {
  pociagi: Train[];
  dataWyjazdu: string;
  dataPrzyjazdu: string;
}

/** Response of `POST /server/public/endpoint/Pociagi` with `metoda: "wyszukajPolaczenia"`. */
export interface SearchResponse {
  polaczenia: Connection[];
}

/** Response of `GET /grm/sklad/…`: the composition of a train. */
export interface Composition {
  wagony: number[];
  /** Not reliable, IC3 does not use it: see docs/api.md. */
  wagonyNiedostepne?: number[];
  /** Wagon number -> seat-map schema, e.g. "2022,WITH_COMPARTMENTS". */
  wagonySchemat?: Record<string, string>;
  klasa1?: number[];
  klasa2?: number[];
}

export type SeatClass = 1 | 2;

/** Free seats in one class. */
export interface ClassCount {
  /** Normal seats that anyone can buy. */
  free: number;
  /** Seats for a group of passengers (disabled, wheelchair, carer, child, bicycle). */
  special: number;
  /** Special seats by type, e.g. { "Miejsce dla osoby z rowerem": 6 }. */
  types: Record<string, number>;
}

export type SeatCounts = Record<SeatClass, ClassCount>;

/** Seat counts of one train, with the time (ms) when the data was fetched. */
export type TrainResult = SeatCounts & { time: number };

export interface ConnectionResult {
  /** One result for each train of the connection. */
  legs: TrainResult[];
  /** What a passenger can use on the whole connection. */
  total: TrainResult;
}

/** The subset of Web Storage that the extension uses. */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;
