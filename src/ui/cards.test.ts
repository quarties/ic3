import { describe, expect, mock, spyOn, test } from 'bun:test';
import { createConnectionStore } from '../connections';
import type { SeatService } from '../seat-service';
import { connection, fixture, result, train } from '../test-helpers';
import { CancelledError, GaveUpError, NotFoundError, NotReadyError, StoppedError } from '../errors';
import { LIMIT_WAIT_TIP } from './badge';
import { createCardController, type SetTimer, type VisibilityWatcher } from './cards';

const CARD_HTML = await fixture('card.html');

const grottger = connection(
  train({ nrPociagu: 3604, dataWyjazdu: '2026-11-15 20:01:00', dataPrzyjazdu: '2026-11-15 22:50:00' }),
);

/** Timers that the test runs by hand. */
function fakeTimers() {
  const list: { fn: () => void; ms: number; live: boolean }[] = [];
  const setTimer: SetTimer = (fn, ms) => {
    const t = { fn, ms, live: true };
    list.push(t);
    return () => void (t.live = false);
  };
  /** Run the live timers of this delay, and give the started work time to finish. */
  const run = async (ms: number) => {
    for (const t of list.filter((x) => x.live && x.ms === ms)) {
      t.live = false;
      t.fn();
    }
    await Bun.sleep(0);
  };
  const pending = () => list.filter((t) => t.live).map((t) => t.ms);
  return { setTimer, run, pending };
}

function setup(
  seats: SeatService['connection'],
  visibility?: VisibilityWatcher,
  timers = fakeTimers(),
  retryIn: SeatService['retryIn'] = () => 60_000,
) {
  document.body.innerHTML = CARD_HTML;
  const connections = createConnectionStore();
  connections.remember({ polaczenia: [grottger] });
  const service: SeatService = {
    train: mock(),
    connection: mock(seats),
    forget: mock(() => false),
    retryIn: mock(retryIn),
  };
  const controller = createCardController({
    doc: document,
    connections,
    seats: service,
    searchDate: () => '2026-11-15',
    visibility,
    notReadyRetryMs: 2_000,
    delayMs: 300,
    setTimer: timers.setTimer,
  });
  const badges = () => [...document.querySelectorAll<HTMLElement>('.ic3')];
  return { controller, service, badges, timers, connections };
}

test('shows the counts under each class price', async () => {
  const leg = result({ free: 36 }, { special: 7 }, Date.parse('2026-11-13T18:41:01'));
  const { controller, badges } = setup(async () => ({ legs: [leg], total: leg }));
  await controller.processAll();
  expect(badges().map((b) => [b.dataset.state, b.textContent])).toEqual([
    ['ok', '36 wolnych'],
    ['special', 'tylko specjalne: 7'],
  ]);
  expect(badges()[0]!.dataset.tip).toStartWith('Dane z ');
});

test('a second scan of the same card does not ask again', async () => {
  const leg = result({ free: 1 });
  const { controller, service } = setup(async () => ({ legs: [leg], total: leg }));
  await controller.processAll();
  await controller.processAll();
  expect(service.connection).toHaveBeenCalledTimes(1);
});

test('an error shows nothing on the card, only a console line; the card is counted again after 60 s', async () => {
  const warn = spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const { controller, service, badges, timers } = setup(async () => {
      throw new Error('HTTP 500');
    });
    await controller.processAll();
    expect(badges()).toHaveLength(0);
    expect(document.querySelector('.ic3-cell')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toStartWith('[IC3] IC 3604');
    // The badge removal changes the page, and that starts a new scan at once: it must not ask.
    await controller.processAll();
    expect(service.connection).toHaveBeenCalledTimes(1);
    expect(timers.pending()).toEqual([60_000]);
    await timers.run(60_000); // the retry timer schedules a scan
    await timers.run(300); // the scan
    expect(service.connection).toHaveBeenCalledTimes(2);
  } finally {
    warn.mockRestore();
  }
});

test.each([
  ['the train failed too many times', new GaveUpError(new Error('HTTP 400'))],
  ['the server refused', new StoppedError('serwer odmówił (HTTP 403)')],
])('%s: nothing on the card, and the card does not ask again', async (_name, error) => {
  const warn = spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const { controller, service, badges, timers } = setup(async () => {
      throw error;
    });
    await controller.processAll();
    expect(badges()).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(timers.pending()).toEqual([]);
    await controller.processAll();
    expect(service.connection).toHaveBeenCalledTimes(1);
  } finally {
    warn.mockRestore();
  }
});

test('no station list yet: the card tries again after 2 s, then 4 s, 8 s, … up to 60 s', async () => {
  const warn = spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const { controller, timers } = setup(async () => {
      throw new NotReadyError('brak listy stacji');
    });
    await controller.processAll();
    const delays: number[] = [];
    for (let i = 0; i < 7; i++) {
      const [ms] = timers.pending();
      delays.push(ms!);
      await timers.run(ms!); // the retry timer schedules a scan
      await timers.run(300); // the scan
    }
    expect(delays).toEqual([2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000]);
  } finally {
    warn.mockRestore();
  }
});

test('after an error, the card waits as long as seat-service blocks the train', async () => {
  const warn = spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const { controller, timers } = setup(
      async () => {
        throw new Error('HTTP 500');
      },
      undefined,
      fakeTimers(),
      () => 10_000,
    );
    await controller.processAll();
    expect(timers.pending()).toEqual([10_000]);
  } finally {
    warn.mockRestore();
  }
});

test('a hidden browser tab: no requests', async () => {
  const leg = result({ free: 1 });
  const { controller, service } = setup(async () => ({ legs: [leg], total: leg }));
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
  try {
    await controller.processAll();
    expect(service.connection).not.toHaveBeenCalled();
  } finally {
    delete (document as { hidden?: boolean }).hidden; // back to the value of Document.prototype
  }
});

test('a card without class cells: no request', async () => {
  const leg = result({ free: 1 });
  const { controller, service } = setup(async () => ({ legs: [leg], total: leg }));
  document.body.innerHTML = CARD_HTML.replace(/Klasa/g, 'Xyz').replace(/Class /g, 'Xyz ');
  await controller.processAll();
  expect(service.connection).not.toHaveBeenCalled();
});

test('the card shows another connection when the old answer comes: the old answer does not change the card', async () => {
  let fail!: (e: Error) => void;
  const { controller, badges } = setup(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
  );
  const card = document.querySelector<HTMLElement>('li[class*="tripPropositionDesktop__container__"]')!;
  const run = controller.processCard(card);
  card.dataset.ic3 = 'another connection'; // a newer run took the card
  badges().forEach((b) => (b.textContent = '9 wolnych'));
  fail(new Error('HTTP 500'));
  await run;
  expect(badges().map((b) => b.textContent)).toEqual(['9 wolnych', '9 wolnych']);
});

test('the card left the screen before its request: no badge, counted when visible again', async () => {
  const leg = result({ free: 3 });
  let cancel = true;
  const { controller, service, badges } = setup(async (_c, wanted) => {
    expect(wanted?.()).toBe(true);
    if (cancel) throw new CancelledError();
    return { legs: [leg], total: leg };
  });
  await controller.processAll();
  expect(badges()).toHaveLength(0);
  expect(document.querySelectorAll('.ic3-cell, .ic3-row')).toHaveLength(0);
  cancel = false;
  await controller.processAll();
  expect(service.connection).toHaveBeenCalledTimes(2);
  expect(badges()[0]!.textContent).toBe('3 wolne');
});

test('the same card element shows the same train to a nearer station: it is counted again', async () => {
  const leg = result({ free: 2 });
  const { controller, service, connections } = setup(async () => ({ legs: [leg], total: leg }));
  await controller.processAll();
  // A new search: the page changes only the arrival time in the same <li>.
  const card = document.querySelector<HTMLElement>('li[class*="tripPropositionDesktop__container__"]')!;
  const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.textContent?.includes('22:50')) n.textContent = n.textContent.replace('22:50', '22:10');
  }
  const nearer = connection(
    train({ nrPociagu: 3604, dataWyjazdu: '2026-11-15 20:01:00', dataPrzyjazdu: '2026-11-15 22:10:00' }),
  );
  connections.remember({ polaczenia: [nearer] });
  await controller.processAll();
  expect(service.connection).toHaveBeenCalledTimes(2);
});

test('a card without a known connection gets no badge', async () => {
  const { controller, badges } = setup(async () => {
    throw new Error('not called');
  });
  document.body.innerHTML = CARD_HTML.replace('20:01', '21:00');
  await controller.processAll();
  expect(badges()).toHaveLength(0);
});

describe('only cards on the screen', () => {
  /** A watcher that the test controls: `show(card)` and `hide(card)` like scrolling. */
  function fakeWatcher() {
    let onChange: (card: HTMLElement, visible: boolean) => void = () => {};
    const watched: HTMLElement[] = [];
    const watcher: VisibilityWatcher = (cb) => {
      onChange = cb;
      return { watch: (card) => void watched.push(card) };
    };
    return { watcher, watched, show: (c: HTMLElement) => onChange(c, true), hide: (c: HTMLElement) => onChange(c, false) };
  }
  const leg = result({ free: 5 });
  const ok = async () => ({ legs: [leg], total: leg });

  test('a card below the screen is watched, but not counted', async () => {
    const w = fakeWatcher();
    const { controller, service, badges } = setup(ok, w.watcher);
    await controller.processAll();
    expect(w.watched).toHaveLength(1);
    expect(service.connection).not.toHaveBeenCalled();
    expect(badges()).toHaveLength(0);
  });

  test('the card scrolls into view: it is counted', async () => {
    const w = fakeWatcher();
    const { controller, service, badges } = setup(ok, w.watcher);
    await controller.processAll();
    w.show(w.watched[0]!);
    await Bun.sleep(0);
    expect(service.connection).toHaveBeenCalledTimes(1);
    expect(badges()[0]!.textContent).toBe('5 wolnych');
  });

  test('a scan watches each card only once', async () => {
    const w = fakeWatcher();
    const { controller } = setup(ok, w.watcher);
    await controller.processAll();
    await controller.processAll();
    expect(w.watched).toHaveLength(1);
  });

  test('wanted() is false after the card leaves the screen', async () => {
    const w = fakeWatcher();
    let wanted: (() => boolean) | undefined;
    const { controller } = setup(async (_c, want) => {
      wanted = want;
      return { legs: [leg], total: leg };
    }, w.watcher);
    await controller.processAll();
    w.show(w.watched[0]!);
    await Bun.sleep(0);
    expect(wanted?.()).toBe(true);
    w.hide(w.watched[0]!);
    expect(wanted?.()).toBe(false);
  });

  test('a visible card is counted again when new search data comes', async () => {
    const w = fakeWatcher();
    const { controller, service } = setup(ok, w.watcher);
    await controller.processAll();
    w.hide(w.watched[0]!);
    await controller.processAll();
    expect(service.connection).not.toHaveBeenCalled();
    w.show(w.watched[0]!);
    await Bun.sleep(0);
    expect(service.connection).toHaveBeenCalledTimes(1);
  });
});

test('no seat map (404): the card shows "brak mapy miejsc" and does not ask again', async () => {
  const { controller, service, badges } = setup(async () => {
    throw new NotFoundError();
  });
  await controller.processAll();
  expect(badges().map((b) => [b.dataset.state, b.textContent])).toEqual([
    ['nomap', 'brak mapy miejsc'],
    ['nomap', 'brak mapy miejsc'],
  ]);
  await controller.processAll();
  expect(service.connection).toHaveBeenCalledTimes(1);
});


describe('wait for the request limit', () => {
  const leg = result({ free: 5 });
  const pending = () => new Promise<never>(() => {});

  test('the loading badges get a tooltip while the requests wait, and lose it after', async () => {
    const { controller, badges } = setup(pending);
    void controller.processAll();
    await Bun.sleep(0);
    expect(badges()[0]!.dataset.tip).toBe('');
    controller.setWaiting(true);
    expect(badges().map((b) => b.dataset.tip)).toEqual([LIMIT_WAIT_TIP, LIMIT_WAIT_TIP]);
    controller.setWaiting(false);
    expect(badges().map((b) => b.dataset.tip)).toEqual(['', '']);
  });

  test('a card that starts to count during the wait gets the tooltip at once', async () => {
    const { controller, badges } = setup(pending);
    controller.setWaiting(true);
    void controller.processAll();
    await Bun.sleep(0);
    expect(badges()[0]!.dataset.tip).toBe(LIMIT_WAIT_TIP);
  });

  test('a badge with a result keeps its own tooltip', async () => {
    const { controller, badges } = setup(async () => ({ legs: [leg], total: leg }));
    await controller.processAll();
    controller.setWaiting(true);
    expect(badges()[0]!.dataset.tip).toStartWith('Dane z ');
  });
});

describe('refresh (seat-service forgot a train)', () => {
  const IC3604 = { kat: 'IC', nr: '3604', dep: '202611152001' };
  const leg = result({ free: 5 });

  test('counts the cards of this train again', async () => {
    const { controller, service, timers } = setup(async () => ({ legs: [leg], total: leg }));
    await controller.processAll();
    controller.refresh(IC3604);
    await timers.run(300);
    expect(service.connection).toHaveBeenCalledTimes(2);
  });

  test('another train: the card is not counted again', async () => {
    const { controller, service, timers } = setup(async () => ({ legs: [leg], total: leg }));
    await controller.processAll();
    controller.refresh({ ...IC3604, nr: '3605' });
    controller.refresh({ ...IC3604, dep: '202611162001' });
    await timers.run(300);
    expect(service.connection).toHaveBeenCalledTimes(1);
  });

  test('a count in progress is not cancelled and not started again', async () => {
    let finish!: () => void;
    let wanted: (() => boolean) | undefined;
    const { controller, service, badges, timers } = setup(
      (_c, want) =>
        new Promise((resolve) => {
          wanted = want;
          finish = () => resolve({ legs: [leg], total: leg });
        }),
    );
    const run = controller.processAll();
    await Bun.sleep(0);
    controller.refresh(IC3604);
    expect(wanted?.()).toBe(true);
    await timers.run(300);
    finish();
    await run;
    expect(service.connection).toHaveBeenCalledTimes(1);
    expect(badges()[0]!.textContent).toBe('5 wolnych');
  });

  test('a card with an error keeps it: no new count before its timer', async () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { controller, service, timers } = setup(async () => {
        throw new Error('HTTP 500');
      });
      await controller.processAll();
      controller.refresh(IC3604);
      await timers.run(300);
      expect(service.connection).toHaveBeenCalledTimes(1);
      expect(timers.pending()).toEqual([60_000]);
    } finally {
      warn.mockRestore();
    }
  });
});
