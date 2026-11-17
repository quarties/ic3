import { describe, expect, mock, test } from 'bun:test';
import { createCache } from './cache';
import { CancelledError, GaveUpError, NotFoundError, NotReadyError } from './errors';
import { createQueue } from './queue';
import { createSeatService, mergeLegs, trainKey } from './seat-service';
import { connection, counts, fakeClock, memoryStorage, result, train } from './test-helpers';
import type { SeatCounts, Train } from './types';

function setup(count = mock(async (_t: Train, _w: () => boolean): Promise<SeatCounts> => counts({ free: 5 }))) {
  const clock = fakeClock();
  const storage = memoryStorage();
  const cache = createCache<SeatCounts>({ storage, key: 'c', ttlMs: 60_000, now: clock.now });
  const service = createSeatService({ count, cache, enqueue: createQueue(), ttlMs: 60_000, now: clock.now });
  return { clock, storage, cache, count, service };
}

test('trainKey has the departure date, so the same train on another day is another key', () => {
  expect(trainKey(train())).not.toBe(trainKey(train({ dataWyjazdu: '2026-11-16 09:53:00' })));
});

describe('train', () => {
  test('returns the counts with the fetch time', async () => {
    const { service, clock } = setup();
    expect(await service.train(train())).toEqual({ ...counts({ free: 5 }), time: clock.t });
  });

  test('two cards at the same time: one request', async () => {
    const { service, count } = setup();
    await Promise.all([service.train(train()), service.train(train())]);
    expect(count).toHaveBeenCalledTimes(1);
  });

  test('uses the cache for 60 s, then fetches again', async () => {
    const { service, count, clock } = setup();
    await service.train(train());
    clock.t += 59_000;
    await service.train(train());
    expect(count).toHaveBeenCalledTimes(1);
    clock.t += 1_000;
    await service.train(train());
    expect(count).toHaveBeenCalledTimes(2);
  });

  test('uses a cache entry from another tab (same storage)', async () => {
    const { cache, clock } = setup();
    cache.put(trainKey(train()), counts({ free: 9 }), clock.t - 10_000);
    const count = mock(async () => counts());
    const other = createSeatService({ count, cache, enqueue: createQueue(), ttlMs: 60_000, now: clock.now });
    expect((await other.train(train()))[1].free).toBe(9);
    expect(count).not.toHaveBeenCalled();
  });

  test('does not mix days: 16.11 is fetched, not taken from 15.11', async () => {
    const { service, count } = setup();
    await service.train(train());
    await service.train(train({ dataWyjazdu: '2026-11-16 09:53:00', dataPrzyjazdu: '2026-11-16 12:50:00' }));
    expect(count).toHaveBeenCalledTimes(2);
  });

  test('after an error, no new request for 60 s, then one', async () => {
    let fail = true;
    const { service, count, clock } = setup(
      mock(async () => {
        if (fail) throw new Error('HTTP 503');
        return counts();
      }),
    );
    await expect(service.train(train())).rejects.toThrow('HTTP 503');
    await Bun.sleep(0);
    fail = false;
    clock.t += 59_000;
    // Another card, or a new element for the same card: the same error, no request.
    await expect(service.train(train())).rejects.toThrow('HTTP 503');
    expect(count).toHaveBeenCalledTimes(1);
    clock.t += 1_000;
    await service.train(train());
    expect(count).toHaveBeenCalledTimes(2);
  });

  test('without retryMs: 60 s after an error, not the cache time', async () => {
    const { cache, clock } = setup();
    let fail = true;
    const count = mock(async (): Promise<SeatCounts> => {
      if (fail) throw new Error('HTTP 503');
      return counts();
    });
    const service = createSeatService({ count, cache, enqueue: createQueue(), ttlMs: 300_000, now: clock.now });
    await service.train(train()).catch(() => {});
    await Bun.sleep(0);
    fail = false;
    clock.t += 60_000;
    await service.train(train());
    expect(count).toHaveBeenCalledTimes(2);
  });

  test('after an error, the cache of another tab comes first', async () => {
    const { service, cache, clock } = setup(
      mock(async (): Promise<SeatCounts> => {
        throw new Error('HTTP 503');
      }),
    );
    await service.train(train()).catch(() => {});
    await Bun.sleep(0);
    cache.put(trainKey(train()), counts({ free: 4 }), clock.t);
    expect((await service.train(train()))[1].free).toBe(4);
  });

  test('3 errors in a row: GaveUpError, no more requests on this page', async () => {
    const { service, count, clock } = setup(
      mock(async () => {
        throw new Error('HTTP 400');
      }),
    );
    for (let i = 0; i < 3; i++) {
      await service.train(train()).catch(() => {});
      await Bun.sleep(0);
      clock.t += 60_000;
    }
    clock.t += 3_600_000;
    await expect(service.train(train())).rejects.toBeInstanceOf(GaveUpError);
    expect(count).toHaveBeenCalledTimes(3);
  });

  test('404 (no seat map): no new request on this page, and the error stays NotFoundError', async () => {
    const { service, count, clock } = setup(
      mock(async () => {
        throw new NotFoundError();
      }),
    );
    await expect(service.train(train())).rejects.toBeInstanceOf(NotFoundError);
    await Bun.sleep(0);
    clock.t += 3_600_000;
    await expect(service.train(train())).rejects.toBeInstanceOf(NotFoundError);
    expect(count).toHaveBeenCalledTimes(1);
  });

  test('a local error (no station list) is not remembered: the next call tries at once', async () => {
    let ready = false;
    const { service, count } = setup(
      mock(async () => {
        if (!ready) throw new NotReadyError('brak listy stacji');
        return counts();
      }),
    );
    await expect(service.train(train())).rejects.toBeInstanceOf(NotReadyError);
    await Bun.sleep(0);
    ready = true;
    await service.train(train());
    expect(count).toHaveBeenCalledTimes(2);
  });
});

describe('a card that left the screen', () => {
  test('the train is not counted when no card needs it when its turn comes', async () => {
    const { service, count } = setup();
    let onScreen = true;
    const first = service.train(train({ nrPociagu: 1 }));
    const second = service.train(train({ nrPociagu: 2 }), () => onScreen);
    onScreen = false; // the user scrolls away while train 1 is counted
    await first;
    await expect(second).rejects.toBeInstanceOf(CancelledError);
    expect(count).toHaveBeenCalledTimes(1);
  });

  test('another card still needs the same train: it is counted', async () => {
    const { service, count } = setup();
    const a = service.train(train(), () => false);
    const b = service.train(train(), () => true);
    expect(await a).toEqual(await b);
    expect(count).toHaveBeenCalledTimes(1);
  });

  test('a cancelled count leaves at once: no train pause, the next card gets a new count', async () => {
    const { cache, clock } = setup();
    let cancel = true;
    const count = mock(async (): Promise<SeatCounts> => {
      if (cancel) throw new CancelledError();
      return counts();
    });
    const sleep = mock(() => new Promise<void>(() => {})); // a pause would never end
    const service = createSeatService({ count, cache, enqueue: createQueue(), ttlMs: 60_000, now: clock.now, sleep, trainDelayMs: 300 });
    await expect(service.train(train())).rejects.toBeInstanceOf(CancelledError);
    expect(sleep).not.toHaveBeenCalled();
    cancel = false;
    const next = service.train(train());
    expect(count).toHaveBeenCalledTimes(1); // the queue starts the task later
    await Promise.race([next, Bun.sleep(0)]);
    expect(count).toHaveBeenCalledTimes(2);
  });

  test('after a cancel, the next call asks again', async () => {
    const { service, count } = setup();
    await expect(service.train(train(), () => false)).rejects.toBeInstanceOf(CancelledError);
    await Bun.sleep(0);
    await service.train(train());
    expect(count).toHaveBeenCalledTimes(1);
  });
});

describe('mergeLegs', () => {
  test('one leg: the same result', () => {
    const leg = result({ free: 3 });
    expect(mergeLegs([leg])).toBe(leg);
  });

  test('connection with changes: minimum of each class, oldest time, no types', () => {
    const merged = mergeLegs([
      result({ free: 4, special: 6, types: { OzN: 6 } }, { free: 0, special: 34 }, 200),
      result({ free: 0, special: 3 }, { free: 33, special: 2 }, 100),
    ]);
    expect(merged).toEqual(result({ free: 0, special: 3 }, { free: 0, special: 2 }, 100));
  });
});

test('connection: when one leg fails, the other legs are not counted', async () => {
  const count = mock(async (t: Train, wanted: () => boolean): Promise<SeatCounts> => {
    if (t.nrPociagu === 1) throw new Error('HTTP 500');
    if (!wanted()) throw new CancelledError();
    return counts();
  });
  const { service } = setup(count);
  const c = connection(train({ nrPociagu: 1 }), train({ nrPociagu: 2 }));
  await expect(service.connection(c)).rejects.toThrow('HTTP 500');
  await Bun.sleep(0);
  expect(count).toHaveBeenCalledTimes(1);
});

test('connection: one result for each leg and the total', async () => {
  const { service } = setup(mock(async (t: Train) => counts({ free: t.nrPociagu === 4161 ? 2 : 7 })));
  const res = await service.connection(connection(train({ nrPociagu: 4161 }), train({ nrPociagu: 1646 })));
  expect(res.legs.map((l) => l[1].free)).toEqual([2, 7]);
  expect(res.total[1].free).toBe(2);
});

describe('forget (the user opened the seat map of the train)', () => {
  // train(): IC 134, departure 2026-11-15 09:53
  const IC134 = { kat: 'IC', nr: '134', dep: '202611150953' };
  test('removes the train from the cache: the next count asks again', async () => {
    const { service, count } = setup();
    await service.train(train());
    expect(service.forget(IC134)).toBe(true);
    await service.train(train());
    expect(count).toHaveBeenCalledTimes(2);
  });

  test('another train or another departure: nothing changes', async () => {
    const { service, count } = setup();
    await service.train(train());
    expect(service.forget({ ...IC134, nr: '135' })).toBe(false);
    expect(service.forget({ ...IC134, dep: '202611160953' })).toBe(false);
    await service.train(train());
    expect(count).toHaveBeenCalledTimes(1);
  });

  test('keeps the wait after an error: no request for 60 s', async () => {
    const count = mock(async (): Promise<SeatCounts> => {
      throw new Error('HTTP 500');
    });
    const { service } = setup(count);
    await service.train(train()).catch(() => {});
    await Bun.sleep(0);
    expect(service.forget(IC134)).toBe(false);
    await expect(service.train(train())).rejects.toThrow('HTTP 500');
    expect(count).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['GaveUpError', new Error('HTTP 500'), GaveUpError],
    ['404', new NotFoundError(), NotFoundError],
  ])('keeps %s: no request until the page reloads', async (_name, error, expected) => {
    const count = mock(async (): Promise<SeatCounts> => {
      throw error;
    });
    const { service, clock } = setup(count);
    const calls = error instanceof NotFoundError ? 1 : 3;
    for (let i = 0; i < calls; i++) {
      await service.train(train()).catch(() => {});
      await Bun.sleep(0);
      clock.t += 60_000;
    }
    service.forget(IC134);
    await expect(service.train(train())).rejects.toBeInstanceOf(expected);
    expect(count).toHaveBeenCalledTimes(calls);
  });
});

describe('retryIn', () => {
  test('no error: null', async () => {
    const { service } = setup();
    expect(service.retryIn(connection(train()))).toBeNull();
  });

  test('counts from the error of the train, not from the card', async () => {
    const { service, clock } = setup(
      mock(async (): Promise<SeatCounts> => {
        throw new Error('HTTP 503');
      }),
    );
    await service.train(train()).catch(() => {});
    await Bun.sleep(0);
    clock.t += 50_000; // a second card gets the error later
    expect(service.retryIn(connection(train()))).toBe(10_000);
  });

  test('404 or gave up: Infinity', async () => {
    const { service } = setup(
      mock(async (): Promise<SeatCounts> => {
        throw new NotFoundError();
      }),
    );
    await service.train(train()).catch(() => {});
    await Bun.sleep(0);
    expect(service.retryIn(connection(train()))).toBe(Infinity);
  });
});
