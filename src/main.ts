// IC3: show free seat counts on the ebilet.intercity.pl connection list.
// Runs in the page world (MAIN), so all requests use the page's own session and cookies.
import { createApi, parseCompositionUrl } from './api';
import { createCache } from './cache';
import { installCapture } from './capture';
import { CACHE_STORAGE_KEY, CACHE_TTL_MS, DEFAULT_APP_VERSION, MAX_REQUESTS_PER_WINDOW, RATE_WINDOW_MS, RETRY_MS, TRAIN_DELAY_MS, WAGON_DELAY_MS } from './config';
import { createConnectionStore } from './connections';
import { createGate } from './gate';
import { createQueue } from './queue';
import { createSeatService, type SeatService } from './seat-service';
import { createStationLookup } from './stations';
import { sleep } from './time';
import { countTrain } from './train-counter';
import type { SeatCounts } from './types';
import { createCardController, intersectionWatcher } from './ui/cards';
import { injectStyle } from './ui/style';
import { createTooltip } from './ui/tooltip';

declare global {
  interface Window {
    __ic3?: boolean;
  }
}

function start() {
  if (window.__ic3) return;
  window.__ic3 = true;

  let appVersion = DEFAULT_APP_VERSION;
  const connections = createConnectionStore();
  let cards: ReturnType<typeof createCardController> | null = null;
  let seats: SeatService | null = null;

  // Install at document_start, before the page sends its first request.
  const pageFetch = installCapture({
    win: window,
    onSearch: (json) => {
      if (connections.remember(json)) cards?.schedule();
    },
    onAppVersion: (v) => (appVersion = v),
    // The user opened the seat map of a train: the page has fresh data, so IC3 counts this train again.
    onComposition: (url) => {
      const t = parseCompositionUrl(url);
      if (t && seats?.forget(t)) cards?.refresh(t);
    },
  });

  const api = createApi({ fetch: pageFetch, appVersion: () => appVersion });
  // Each request goes through the gate: it pauses or stops on 429, 401 and 403.
  const gate = createGate({
    sleep,
    rate: { max: MAX_REQUESTS_PER_WINDOW, windowMs: RATE_WINDOW_MS },
    onWait: (waiting) => cards?.setWaiting(waiting),
  });
  const epa = createStationLookup(localStorage);
  const service = createSeatService({
    count: (train, wanted) => countTrain(train, { api, epa, sleep, wagonDelayMs: WAGON_DELAY_MS, gate, wanted }),
    cache: createCache<SeatCounts>({ storage: localStorage, key: CACHE_STORAGE_KEY, ttlMs: CACHE_TTL_MS }),
    enqueue: createQueue(),
    ttlMs: CACHE_TTL_MS,
    retryMs: RETRY_MS,
    sleep,
    trainDelayMs: TRAIN_DELAY_MS,
  });
  seats = service;

  function onReady() {
    injectStyle(document);
    const controller = createCardController({
      doc: document,
      connections,
      seats: service,
      tooltip: createTooltip(document, window),
      searchDate: () => new URLSearchParams(location.search).get('dwyj'),
      visibility: 'IntersectionObserver' in window ? intersectionWatcher(window) : undefined,
    });
    cards = controller;
    new MutationObserver(() => controller.schedule()).observe(document.body, { childList: true, subtree: true });
    // IC3 sends no requests from a hidden tab. Count the cards again when the tab is visible.
    document.addEventListener('visibilitychange', () => controller.schedule());
    controller.schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
  else onReady();
}

start();
