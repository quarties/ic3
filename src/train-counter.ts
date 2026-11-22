import type { SeatMapApi } from './api';
import { CancelledError, NotFoundError } from './errors';
import type { Gate } from './gate';
import { addCounts, countWagonSvg, emptyCounts } from './seats';
import type { StationLookup } from './stations';
import type { SeatCounts, Train } from './types';

export interface CountDeps {
  api: SeatMapApi;
  epa: StationLookup;
  sleep: (ms: number) => Promise<void>;
  wagonDelayMs?: number;
  parser?: DOMParser;
  /** Each request goes through the gate: it pauses or stops on 429, 401 and 403 (gate.ts). */
  gate?: Pick<Gate, 'run'>;
  /**
   * Checked before the composition request, after a gate pause and before its retry.
   * False: stop with CancelledError. After the composition request, the count goes to the end.
   */
  wanted?: () => boolean;
}

/**
 * Count the free seats of one train on one leg: get the composition, then the seat map
 * of each wagon. Skip wagons that have no seat map (e.g. a restaurant car or a sleeper),
 * also when the API answers 404 for one wagon.
 * `wagonyNiedostepne` is not used: the page does not read it either, and for a night train
 * (arrival on the next day) it lists all wagons, also wagons with free seats (docs/api.md).
 * A 404 for the composition passes through: there is no seat map for this train.
 * A count stops (CancelledError) only before its first request. A started count goes to the end,
 * so the cache gets its data and a card that comes back does not send the same requests again.
 */
export async function countTrain(train: Train, deps: CountDeps): Promise<SeatCounts> {
  const { api, epa, sleep, wagonDelayMs = 0, parser, gate, wanted = () => true } = deps;

  const send = <T>(request: () => Promise<T>, check?: () => boolean): Promise<T> =>
    gate ? gate.run(request, check) : request();

  const from = epa(train.stacjaWyjazdu);
  const to = epa(train.stacjaPrzyjazdu);
  // The first request: only while a card still needs this train.
  if (!wanted()) throw new CancelledError();
  const composition = await send(() => api.composition(train, from, to, wanted), wanted);
  const total = emptyCounts();

  for (const wagon of composition.wagony ?? []) {
    const schema = composition.wagonySchemat?.[wagon];
    if (!schema) continue;
    try {
      addCounts(total, countWagonSvg(await send(() => api.wagonSvg(train, wagon, schema, from, to)), parser));
    } catch (e) {
      if (!(e instanceof NotFoundError)) throw e;
    }
    if (wagonDelayMs) await sleep(wagonDelayMs);
  }
  return total;
}
