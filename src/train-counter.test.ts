import { expect, mock, test } from 'bun:test';
import type { SeatMapApi } from './api';
import { fixture, fixtureJson, train } from './test-helpers';
import { CancelledError, NotFoundError, RateLimitError } from './errors';
import { createGate } from './gate';
import { countTrain } from './train-counter';
import type { Composition } from './types';

const epa = (code: number) => ({ 85: '5100051', 248: '5100143' })[code]!;

test('IC 134: adds all wagons, skips wagon 274 (not available)', async () => {
  const composition = await fixtureJson<Composition>('sklad-ic134.json');
  const svgs: Record<number, string> = {
    272: await fixture('wagon-ic134-272.svg'),
    275: await fixture('wagon-ic134-275.svg'),
  };
  const empty = '<svg xmlns="http://www.w3.org/2000/svg"/>';
  const api: SeatMapApi = {
    composition: mock(async () => composition),
    wagonSvg: mock(async (_t, wagon: number) => svgs[wagon] ?? empty),
  };

  const c = await countTrain(train(), { api, epa, sleep: async () => {} });

  expect(api.composition).toHaveBeenCalledWith(train(), '5100051', '5100143', expect.any(Function));
  const asked = (api.wagonSvg as ReturnType<typeof mock>).mock.calls.map((call) => call[1]);
  expect(asked).not.toContain(274);
  expect(asked).toHaveLength(composition.wagony.length - 1);
  expect(c[1]).toEqual({ free: 0, special: 4, types: { 'Miejsce dla OzN – nie na wózku': 4 } });
  expect(c[2].special).toBe(3);
});

test('skips a wagon without a seat-map schema', async () => {
  const api: SeatMapApi = {
    composition: async () => ({ wagony: [1, 2], wagonySchemat: { '1': 'A' } }),
    wagonSvg: mock(async () => '<svg xmlns="http://www.w3.org/2000/svg"/>'),
  };
  await countTrain(train(), { api, epa, sleep: async () => {} });
  expect(api.wagonSvg).toHaveBeenCalledTimes(1);
});

test('waits between wagons', async () => {
  const sleep = mock(async (_ms: number) => {});
  const api: SeatMapApi = {
    composition: async () => ({ wagony: [1, 2], wagonySchemat: { '1': 'A', '2': 'B' } }),
    wagonSvg: async () => '<svg xmlns="http://www.w3.org/2000/svg"/>',
  };
  await countTrain(train(), { api, epa, sleep, wagonDelayMs: 150 });
  expect(sleep.mock.calls).toEqual([[150], [150]]);
});

test('a 404 for one wagon: skip it and count the other wagons', async () => {
  const svg = await fixture('wagon-ic3816-13.svg');
  const api: SeatMapApi = {
    composition: async () => ({ wagony: [1, 2], wagonySchemat: { '1': 'A', '2': 'B' } }),
    wagonSvg: async (_t, wagon) => {
      if (wagon === 1) throw new NotFoundError();
      return svg;
    },
  };
  const c = await countTrain(train(), { api, epa, sleep: async () => {} });
  expect(c[2].free).toBe(6);
});

test('a 404 for the composition passes through (no seat map for this train)', async () => {
  const api: SeatMapApi = {
    composition: async () => {
      throw new NotFoundError();
    },
    wagonSvg: async () => '',
  };
  await expect(countTrain(train(), { api, epa, sleep: async () => {} })).rejects.toBeInstanceOf(NotFoundError);
});

const twoWagons = (): SeatMapApi => ({
  composition: mock(async () => ({ wagony: [1, 2], wagonySchemat: { '1': 'A', '2': 'B' } })),
  wagonSvg: mock(async () => '<svg xmlns="http://www.w3.org/2000/svg"/>'),
});

test('no card needs the train: no request, CancelledError', async () => {
  const api = twoWagons();
  await expect(countTrain(train(), { api, epa, sleep: async () => {}, wanted: () => false })).rejects.toBeInstanceOf(
    CancelledError,
  );
  expect(api.composition).not.toHaveBeenCalled();
});

test('the card leaves the screen during the count: the count goes to the end', async () => {
  const api = twoWagons();
  let wanted = true;
  const sleep = async () => {
    wanted = false; // the user scrolls away after wagon 1
  };
  const gate = createGate({ sleep: async () => {} });
  await countTrain(train(), { api, epa, sleep, wagonDelayMs: 150, gate, wanted: () => wanted });
  expect(api.wagonSvg).toHaveBeenCalledTimes(2);
});

test('the composition request gets wanted() for its retry', async () => {
  const api = twoWagons();
  const wanted = () => true;
  await countTrain(train(), { api, epa, sleep: async () => {}, wanted });
  expect(api.composition).toHaveBeenCalledWith(train(), '5100051', '5100143', wanted);
});

test('a 429 for one wagon: only that request goes again, after the pause', async () => {
  const api = twoWagons();
  let first = true;
  api.wagonSvg = mock(async (_t, wagon: number) => {
    if (wagon === 2 && first) {
      first = false;
      throw new RateLimitError(1_000);
    }
    return '<svg xmlns="http://www.w3.org/2000/svg"/>';
  });
  const gate = createGate({ sleep: async () => {} });
  await countTrain(train(), { api, epa, sleep: async () => {}, gate });
  expect(api.composition).toHaveBeenCalledTimes(1);
  expect((api.wagonSvg as ReturnType<typeof mock>).mock.calls.map((c) => c[1])).toEqual([1, 2, 2]);
});
