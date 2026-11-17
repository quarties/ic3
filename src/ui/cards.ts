import { RETRY_MS } from '../config';
import type { ConnectionStore } from '../connections';
import { CancelledError, GaveUpError, NotFoundError, NotReadyError, StoppedError } from '../errors';
import { isTrain, type SeatService, type TrainRef } from '../seat-service';
import type { Connection, SeatClass } from '../types';
import { badgeFor, LIMIT_WAIT_TIP, removeBadge, showLoading, showNoSeatMap, showResult } from './badge';
import { CARD_SELECTOR, cardTimes, classCells } from './card';
import type { Tooltip } from './tooltip';

/** Tells which cards are on the screen. In the page: IntersectionObserver. */
export type VisibilityWatcher = (onChange: (card: HTMLElement, visible: boolean) => void) => {
  watch(card: HTMLElement): void;
};

/** Run `fn` after `ms`. Returns a function that cancels it. */
export type SetTimer = (fn: () => void, ms: number) => () => void;

const browserTimer: SetTimer = (fn, ms) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

/** Count a card a little before it scrolls into view, so the numbers are ready. */
const MARGIN = '200px 0px';

export const intersectionWatcher =
  (win: Window & typeof globalThis): VisibilityWatcher =>
  (onChange) => {
    const io = new win.IntersectionObserver(
      (entries) => entries.forEach((e) => onChange(e.target as HTMLElement, e.isIntersecting)),
      { rootMargin: MARGIN },
    );
    return { watch: (card) => io.observe(card) };
  };

export interface CardControllerDeps {
  doc: Document;
  connections: ConnectionStore;
  seats: SeatService;
  tooltip?: Tooltip;
  /** Search date from the page URL ("dwyj"). */
  searchDate: () => string | null;
  /** Without a watcher, every card counts as visible (tests, old browsers). */
  visibility?: VisibilityWatcher;
  /** Wait after the last page change before a scan. */
  delayMs?: number;
  /**
   * After a local error without a request (no station list yet), count the card again after this time.
   * The time doubles after each such error in a row, up to RETRY_MS.
   */
  notReadyRetryMs?: number;
  setTimer?: SetTimer;
}

/**
 * Show seat counts on the connection cards that are on the screen. Cards below the screen
 * wait until the user scrolls to them: the extension asks only for what the user sees.
 * A hidden browser tab sends no requests.
 */
export function createCardController(deps: CardControllerDeps) {
  const { doc, connections, seats, tooltip, searchDate, visibility, delayMs = 300 } = deps;
  const { notReadyRetryMs = 2000, setTimer = browserTimer } = deps;
  const watched = new WeakSet<HTMLElement>();
  const visible = new Set<HTMLElement>();
  /** The connection that each card shows. */
  const shown = new WeakMap<HTMLElement, Connection>();
  /** Cards with a count in progress. */
  const busy = new WeakSet<HTMLElement>();
  /** NotReadyError in a row for each card. */
  const notReady = new WeakMap<HTMLElement, number>();
  /** The requests wait for the limit now. */
  let waiting = false;

  /** When to count a card again after an error. */
  function retryDelay(card: HTMLElement, conn: Connection, e: unknown): number {
    if (e instanceof NotReadyError) {
      const n = notReady.get(card) ?? 0;
      notReady.set(card, n + 1);
      return Math.min(notReadyRetryMs * 2 ** n, RETRY_MS);
    }
    // seat-service knows when the train gets a new request: from the error of the train, not of this card.
    return seats.retryIn(conn) ?? RETRY_MS;
  }

  async function processCard(card: HTMLElement): Promise<void> {
    if (doc.hidden) return;
    const times = cardTimes(card);
    if (!times) return;
    const conn = connections.find({ date: searchDate(), ...times, text: card.textContent ?? '' });
    if (!conn) return;

    const cells = Object.entries(classCells(card)) as [string, HTMLElement][];
    // No class cells yet (e.g. the prices did not load): no place for a result, so do not ask.
    if (!cells.length) return;
    // A card element can show another connection later, so compare with a signature.
    // The arrival time is in it: the same train to a nearer station has other seat data.
    const sig = [conn.dataWyjazdu, conn.dataPrzyjazdu, conn.pociagi.map((t) => t.nrPociagu).join('+')].join('|');
    if (card.dataset.ic3 === sig && (card.dataset.ic3Error || cells.every(([, cell]) => cell.querySelector(':scope > .ic3'))))
      return;
    card.dataset.ic3 = sig;
    delete card.dataset.ic3Error;
    shown.set(card, conn);
    /** False when the card shows another connection now. Then this run must not change the card. */
    const current = () => card.dataset.ic3 === sig;
    // The queue asks the server only if the card still shows this connection on the screen.
    const wanted = () => !doc.hidden && card.isConnected && current() && (!watcher || visible.has(card));

    const badges = cells.map(([cls, cell]) => [Number(cls) as SeatClass, badgeFor(cell, tooltip)] as const);
    badges.forEach(([, b]) => showLoading(b, waiting));
    busy.add(card);
    try {
      const result = await seats.connection(conn, wanted).finally(() => busy.delete(card));
      notReady.delete(card);
      if (!current()) return;
      badges.forEach(([cls, b]) => showResult(b, result, cls));
    } catch (e) {
      if (!current()) return;
      if (e instanceof CancelledError) {
        // The user scrolled away before the request. Count the card when it is on the screen again.
        badges.forEach(([, b]) => removeBadge(b, tooltip));
        card.dataset.ic3 = '';
        return;
      }
      if (e instanceof NotFoundError) {
        badges.forEach(([, b]) => showNoSeatMap(b));
        return; // the same answer next time: do not ask again
      }
      // An error shows nothing on the page: only a line in the console.
      // The ic3Error mark stops a new scan from asking at once, because the card has no badge now.
      badges.forEach(([, b]) => removeBadge(b, tooltip));
      card.dataset.ic3Error = '1';
      const train = conn.pociagi.map((t) => `${t.kategoriaPociagu} ${t.nrPociagu}`).join(' + ');
      console.warn(`[IC3] ${train}, ${conn.dataWyjazdu}:`, e);
      // Stopped or gave up: keep the mark, IC3 does not ask again on this page.
      if (e instanceof StoppedError || e instanceof GaveUpError) return;
      setTimer(() => {
        if (!current()) return;
        card.dataset.ic3 = '';
        delete card.dataset.ic3Error;
        schedule();
      }, retryDelay(card, conn, e));
    }
  }

  const watcher = visibility?.((card, isVisible) => {
    if (!isVisible) return void visible.delete(card);
    visible.add(card);
    void processCard(card);
  });

  /** Watch new cards. Count the visible ones (all, without a watcher). */
  function processAll(): Promise<void> {
    const cards = [...doc.querySelectorAll<HTMLElement>(CARD_SELECTOR)];
    if (!watcher) return Promise.all(cards.map(processCard)).then(() => {});
    for (const card of cards) {
      if (!watched.has(card)) {
        watched.add(card);
        watcher.watch(card);
      }
    }
    // Cards that left the page: forget them. Visible cards: try again (new search data).
    for (const card of visible) if (!card.isConnected) visible.delete(card);
    return Promise.all([...visible].map(processCard)).then(() => {});
  }

  let cancelScan = () => {};
  /** Scan the cards a short time after the last change of the page. */
  function schedule() {
    cancelScan();
    cancelScan = setTimer(() => void processAll(), delayMs);
  }

  /**
   * Count again the cards that show this train (seat-service forgot its data).
   * Skip a card with a count in progress: its result is new. Skip a card with an error: the error stays.
   */
  function refresh(ref: TrainRef) {
    for (const card of doc.querySelectorAll<HTMLElement>(CARD_SELECTOR)) {
      const conn = shown.get(card);
      if (!conn || !card.dataset.ic3 || card.dataset.ic3Error || busy.has(card)) continue;
      if (conn.pociagi.some((t) => isTrain(t, ref))) card.dataset.ic3 = '';
    }
    schedule();
  }

  /** Show on the loading badges that the requests wait for the limit (or stop to show it). */
  function setWaiting(value: boolean) {
    waiting = value;
    for (const b of doc.querySelectorAll<HTMLElement>('.ic3[data-state="loading"]')) b.dataset.tip = value ? LIMIT_WAIT_TIP : '';
  }

  return {
    schedule,
    refresh,
    setWaiting,
    processAll,
    processCard,
  };
}
