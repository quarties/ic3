import { describe, expect, mock, test } from 'bun:test';
import { apiHeaders, compositionUrl, createApi, parseCompositionUrl, wagonUrl } from './api';
import { CancelledError, NotFoundError, RateLimitError, RefusedError, TransientError } from './errors';
import { train } from './test-helpers';

describe('URLs: the same as the page sends', () => {
  test('composition: arrival time before departure time', () => {
    expect(compositionUrl(train(), '5100051', '5100143')).toBe(
      'https://api-gateway.intercity.pl/grm/sklad/wbnet/IC/134/202611151250/5100051/202611150953/5100143',
    );
  });

  test('wagon: departure time before arrival time', () => {
    expect(wagonUrl(train(), 273, '2022,WITH_COMPARTMENTS', '5100051', '5100143')).toBe(
      'https://api-gateway.intercity.pl/grm/wagon/svg/wbnet/IC/134/273/2022,WITH_COMPARTMENTS/202611150953/202611151250/5100051/5100143',
    );
  });
});

test('apiHeaders: the version is also in the name of an empty header', () => {
  expect(apiHeaders('1.6.20')).toEqual({
    accept: 'application/json, text/plain, */*',
    'app-version': '1.6.20',
    'app-version-1.6.20': '',
  });
});

describe('createApi', () => {
  test('sends the session cookies and the current app version', async () => {
    const fetch = mock(async (_url: string, _init?: RequestInit) => new Response('{"wagony":[]}'));
    let version = '1.6.20';
    const api = createApi({ fetch, appVersion: () => version });
    version = '1.7.0';
    await api.composition(train(), '1', '2');
    const init = fetch.mock.calls[0]![1]!;
    expect(init.credentials).toBe('include');
    expect((init.headers as Record<string, string>)['app-version']).toBe('1.7.0');
  });

  test('429: RateLimitError with Retry-After in ms', async () => {
    const res = new Response('', { status: 429, headers: { 'Retry-After': '7' } });
    const api = createApi({ fetch: async () => res, appVersion: () => 'x' });
    const error = await api.composition(train(), '1', '2').catch((e) => e);
    expect(error).toBeInstanceOf(RateLimitError);
    expect(error.retryAfterMs).toBe(7_000);
  });

  test.each([401, 403])('%i: RefusedError', async (status) => {
    const api = createApi({ fetch: async () => new Response('', { status }), appVersion: () => 'x' });
    const error = await api.composition(train(), '1', '2').catch((e) => e);
    expect(error).toBeInstanceOf(RefusedError);
    expect(error.status).toBe(status);
  });

  test('throws on an HTTP error', async () => {
    const api = createApi({ fetch: async () => new Response('', { status: 403 }), appVersion: () => 'x' });
    await expect(api.wagonSvg(train(), 1, 's', '1', '2')).rejects.toThrow('HTTP 403');
  });
});

describe('error responses found in the real API (November 2026)', () => {
  /** A fetch that answers with the given responses in order (an Error = network error). */
  function sequence(...answers: (Response | Error)[]) {
    return mock(async (_url: string, _init?: RequestInit) => {
      const a = answers.shift()!;
      if (a instanceof Error) throw a;
      return a;
    });
  }
  const json404 = () => new Response('{"statusCode":404,"error":"Not found","fullScreen":false}', { status: 404 });
  const ok = () => new Response('{"wagony":[1]}');
  const make = (fetch: ReturnType<typeof sequence>) => {
    const sleep = mock(async (_ms: number) => {});
    return { api: createApi({ fetch, appVersion: () => 'x', sleep, retryDelayMs: 2000 }), sleep };
  };

  test('404 (unknown train, date, station or wagon): NotFoundError, no retry', async () => {
    const fetch = sequence(json404());
    const { api } = make(fetch);
    expect(await api.composition(train(), '1', '2').catch((e) => e)).toBeInstanceOf(NotFoundError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('418 ("try again later" in the e-IC frontend): RateLimitError with status 418', async () => {
    const { api } = make(sequence(new Response('', { status: 418 })));
    const error = await api.composition(train(), '1', '2').catch((e) => e);
    expect(error).toBeInstanceOf(RateLimitError);
    expect(error.status).toBe(418);
    expect(error.retryAfterMs).toBeNull();
  });

  test('500 once: wait 2 s and try again', async () => {
    const fetch = sequence(new Response('', { status: 500 }), ok());
    const { api, sleep } = make(fetch);
    expect(await api.composition(train(), '1', '2')).toEqual({ wagony: [1] });
    expect(sleep.mock.calls).toEqual([[2000]]);
  });

  test('500 twice: TransientError', async () => {
    const { api } = make(sequence(new Response('', { status: 500 }), new Response('', { status: 503 })));
    const error = await api.composition(train(), '1', '2').catch((e) => e);
    expect(error).toBeInstanceOf(TransientError);
    expect(error.message).toBe('HTTP 503');
  });

  test.each([
    ['500', new Response('', { status: 500 })],
    ['a network error', new TypeError('Failed to fetch')],
  ])('%s, and no card needs the train after the wait: CancelledError, no retry', async (_name, first) => {
    const fetch = sequence(first, ok());
    const { api } = make(fetch);
    expect(await api.composition(train(), '1', '2', () => false).catch((e) => e)).toBeInstanceOf(CancelledError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('network error or timeout once: try again', async () => {
    const fetch = sequence(new TypeError('Failed to fetch'), ok());
    const { api } = make(fetch);
    expect(await api.composition(train(), '1', '2')).toEqual({ wagony: [1] });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('network error twice: TransientError', async () => {
    const { api } = make(sequence(new TypeError('x'), new DOMException('timeout', 'TimeoutError')));
    expect(await api.composition(train(), '1', '2').catch((e) => e)).toBeInstanceOf(TransientError);
  });

  test('each request has a timeout signal', async () => {
    const fetch = sequence(ok());
    await make(fetch).api.composition(train(), '1', '2');
    expect(fetch.mock.calls[0]![1]!.signal).toBeInstanceOf(AbortSignal);
  });
});

test('parseCompositionUrl reads the train from a URL that compositionUrl makes', () => {
  expect(parseCompositionUrl(compositionUrl(train(), '5100051', '5100143'))).toEqual({
    kat: 'IC',
    nr: '134',
    dep: '202611150953',
  });
  expect(parseCompositionUrl('https://api-gateway.intercity.pl/grm/wagon/svg/wbnet/IC/134/1')).toBeNull();
});
