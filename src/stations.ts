import { LIBRARY_STORAGE_KEY } from './config';
import { NotReadyError } from './errors';
import type { KeyValueStorage } from './types';

export type StationLookup = (code: number) => string;

interface Library {
  data: { stationsList: { kod: number; kodEPA: number }[] };
}

/**
 * Map the station code of the connection search (`kod`, e.g. 85) to the EPA code
 * of the seat-map API (`kodEPA`, e.g. 5100051). The page keeps the station list
 * in localStorage. Read it on first use, because the page loads it after start.
 */
export function createStationLookup(storage: KeyValueStorage): StationLookup {
  let epaByCode: Map<number, string> | null = null;

  function load(): Map<number, string> | null {
    const map = new Map<number, string>();
    try {
      const lib = JSON.parse(storage.getItem(LIBRARY_STORAGE_KEY) ?? 'null') as Library;
      for (const s of lib.data.stationsList) map.set(s.kod, String(s.kodEPA));
    } catch {
      /* the page did not load the station list yet */
    }
    return map.size ? map : null;
  }

  return (code) => {
    epaByCode ??= load();
    if (!epaByCode) throw new NotReadyError('brak listy stacji');
    const value = epaByCode.get(code);
    if (!value) throw new Error(`nieznana stacja ${code}`);
    return value;
  };
}
