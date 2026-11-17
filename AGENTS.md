# AGENTS.md

IC3 is a browser extension (Chrome, Firefox) that shows free seat counts on the ebilet.intercity.pl connection list. It runs as one content script in the page world and calls the unofficial e-IC 2.0 seat-map API from the user's own session.

## Hard rules

These keep the project legal and keep the API open. A change that breaks one of them needs the owner's explicit approval.

- **Ask only for what the user sees.** Request seat data only for connection cards on the screen (`IntersectionObserver` in `src/ui/cards.ts`). Keep the 5 min cache (`CACHE_TTL_MS`), the 60 s wait after an error (`RETRY_MS`), the limit of 400 requests per 5 min per tab (`MAX_REQUESTS_PER_WINDOW` in `src/gate.ts`) and the pauses between requests. The cache of a train ends early only when the page itself asks for its composition (the user opened the seat map). A count stops only before its first request: a started count goes to the end and fills the cache, so a card that scrolls back sends no request twice.
- **Accept every refusal.** 401, 403, a second 429/418 or a long `Retry-After` stop all requests until the page reloads (`src/gate.ts`). Send requests exactly as the page does: same headers, same cookies, the page's own `fetch`. Leave Akamai cookies, sensor data and user agent untouched.
- **Read only.** The extension shows information. It buys, reserves and holds nothing, and it sends no data to anyone but PKP Intercity.
- **Keep the brand apart.** Use no PKP Intercity logo shapes (the "iC" sign) and not their orange + navy pair. Product texts call IC3 unofficial.

## Gotchas

- `content.js` runs in `world: "MAIN"`, which cannot import modules. `scripts/build.ts` bundles `src/main.ts` into one IIFE per browser in `dist/`. Load `dist/firefox/` or `dist/chrome/` in the browser, never `src/`.
- The price endpoint (`sprawdzCenyLite`) returns a price also when only special seats are left. Seat availability comes only from the wagon SVGs.
- Special seats: a free seat whose `aria-label` attribute matches `SPECIAL_SEAT` in `src/seats.ts`. Other attributes, e.g. "Strefa Ciszy*", are normal seats.
- The composition URL has arrival time before departure time, the wagon URL the other way round. `src/api.test.ts` pins both.
- A connection card matches a search result by date (URL `dwyj`) + times + train numbers (`src/connections.ts`). Without the date, the same train on another day shows wrong data.
- The version lives only in `package.json`. `static/manifest.json` has none, the build adds it. Stores accept only `X.Y.Z`.

API facts, endpoints and error responses: [docs/api.md](docs/api.md). Read it before you touch `src/api.ts`, `src/gate.ts` or the request flow.

Release steps: [docs/releasing.md](docs/releasing.md).

## Conventions

- Bun for everything (install, test, build). `bun run check` must pass before each commit.
- TypeScript, strict. Each module gets its dependencies (fetch, storage, clock, sleep) as parameters, so tests can replace them.
- Tests sit next to the module (`*.test.ts`). Fixtures in `src/__fixtures__/` are real API responses: add a new one from the live API when the format changes, do not hand-write it.
- Code, comments, commits: English. Texts for users (badges, tooltips, README, CHANGELOG): Polish.
