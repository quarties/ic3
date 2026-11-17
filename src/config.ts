export const API_BASE = 'https://api-gateway.intercity.pl/';

/** Fetch seat data for one train at most once in this period. */
export const CACHE_TTL_MS = 5 * 60 * 1000;
/** After a failed count, ask for the train again after this time. */
export const RETRY_MS = 60 * 1000;
/** At most this many requests to the server from one tab, in any RATE_WINDOW_MS. */
export const MAX_REQUESTS_PER_WINDOW = 400;
/** The same as the cache: in this time, IC3 does not ask for the same train again. */
export const RATE_WINDOW_MS = 5 * 60 * 1000;
export const CACHE_STORAGE_KEY = 'ic3-cache';

/** Pauses between requests, so the API gets one train at a time. */
export const WAGON_DELAY_MS = 150;
export const TRAIN_DELAY_MS = 300;

/** The page sends its version in a header. This value is used until the page sends one. */
export const DEFAULT_APP_VERSION = '1.6.20';

/** localStorage key where ebilet.intercity.pl keeps its dictionaries (stations and more). */
export const LIBRARY_STORAGE_KEY = 'eic2-library';
