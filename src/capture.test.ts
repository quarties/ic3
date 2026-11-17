import { expect, mock, spyOn, test } from 'bun:test';
import { installCapture } from './capture';

/** A minimal window with a fake XMLHttpRequest and fetch. */
function fakeWindow(responseText: string) {
  class FakeXhr {
    responseText = responseText;
    private listeners: Record<string, (() => void)[]> = {};
    open(_m: string, _u: string) {}
    setRequestHeader(_n: string, _v: string) {}
    addEventListener(type: string, fn: () => void) {
      (this.listeners[type] ??= []).push(fn);
    }
    send() {
      this.listeners.load?.forEach((fn) => fn());
    }
  }
  const fetch = mock(async (_input: unknown, _init?: unknown) => new Response(responseText));
  return { XMLHttpRequest: FakeXhr, fetch } as unknown as Window & typeof globalThis;
}

const SEARCH = 'https://api-gateway.intercity.pl/server/public/endpoint/Pociagi';
const body = JSON.stringify({ polaczenia: [] });

test('XHR: passes the search response and the app version', () => {
  const win = fakeWindow(body);
  const onSearch = mock((_json: unknown) => {});
  const onAppVersion = mock((_v: string) => {});
  installCapture({ win, onSearch, onAppVersion });

  const xhr = new win.XMLHttpRequest();
  xhr.open('POST', SEARCH);
  xhr.setRequestHeader('App-Version', '1.6.20');
  xhr.send();

  expect(onSearch).toHaveBeenCalledWith({ polaczenia: [] });
  expect(onAppVersion).toHaveBeenCalledWith('1.6.20');
});

test('XHR: ignores other endpoints', () => {
  const win = fakeWindow(body);
  const onSearch = mock((_json: unknown) => {});
  installCapture({ win, onSearch, onAppVersion: () => {} });
  const xhr = new win.XMLHttpRequest();
  xhr.open('POST', 'https://api-gateway.intercity.pl/server/public/endpoint/Sprzedaz');
  xhr.send();
  expect(onSearch).not.toHaveBeenCalled();
});

test('XHR: a response that is not JSON does not throw', () => {
  const win = fakeWindow('<html>');
  const onSearch = mock((_json: unknown) => {});
  installCapture({ win, onSearch, onAppVersion: () => {} });
  const xhr = new win.XMLHttpRequest();
  xhr.open('POST', SEARCH);
  expect(() => xhr.send()).not.toThrow();
  expect(onSearch).not.toHaveBeenCalled();
});

test('fetch: passes the search response; returns the original fetch', async () => {
  const win = fakeWindow(body);
  const original = win.fetch;
  const onSearch = mock((_json: unknown) => {});
  const pageFetch = installCapture({ win, onSearch, onAppVersion: () => {} });

  await win.fetch(SEARCH);
  await Bun.sleep(0);
  expect(onSearch).toHaveBeenCalledTimes(1);

  // The extension's own requests use the original fetch and are not captured.
  await pageFetch(SEARCH);
  await Bun.sleep(0);
  expect(onSearch).toHaveBeenCalledTimes(1);
  expect(original).toHaveBeenCalledTimes(2);
});

const COMPOSITION = 'https://api-gateway.intercity.pl/grm/sklad/wbnet/IC/134/202611151250/5100051/202611150953/5100143';

test('XHR and fetch: report a composition request of the page', async () => {
  const win = fakeWindow('{}');
  const onComposition = mock((_url: string) => {});
  installCapture({ win, onSearch: () => {}, onAppVersion: () => {}, onComposition });
  const xhr = new win.XMLHttpRequest();
  xhr.open('GET', COMPOSITION);
  xhr.send();
  await win.fetch(COMPOSITION);
  expect(onComposition.mock.calls).toEqual([[COMPOSITION], [COMPOSITION]]);
});

test('the fetch that IC3 uses itself is not reported', async () => {
  const win = fakeWindow('{}');
  const onComposition = mock((_url: string) => {});
  const pageFetch = installCapture({ win, onSearch: () => {}, onAppVersion: () => {}, onComposition });
  await pageFetch(COMPOSITION);
  expect(onComposition).not.toHaveBeenCalled();
});

test('an error in onComposition does not stop the request of the page', async () => {
  const warn = spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const win = fakeWindow('{}');
    const send = spyOn(win.XMLHttpRequest.prototype, 'send');
    const onComposition = () => {
      throw new URIError('URI malformed');
    };
    installCapture({ win, onSearch: () => {}, onAppVersion: () => {}, onComposition });
    const xhr = new win.XMLHttpRequest();
    xhr.open('GET', COMPOSITION);
    xhr.send();
    expect(send).toHaveBeenCalledTimes(1);
    expect(await (await win.fetch(COMPOSITION)).text()).toBe('{}');
    expect(warn).toHaveBeenCalledTimes(2);
  } finally {
    warn.mockRestore();
  }
});
