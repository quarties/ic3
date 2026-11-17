import type { FetchFn } from './api';

interface CaptureOptions {
  win: Window & typeof globalThis;
  /** Called with each parsed search response. */
  onSearch: (json: unknown) => void;
  /** Called with the value of the `app-version` header that the page sends. */
  onAppVersion: (version: string) => void;
  /** Called with the URL when the page itself asks for a train composition (the user opened the seat map). */
  onComposition?: (url: string) => void;
}

type TaggedXhr = XMLHttpRequest & { __ic3Url?: string };

const isComposition = (url: string | undefined): boolean => !!url && url.includes('/grm/sklad/');
const isSearch = (url: string | undefined): boolean => !!url && url.includes('/endpoint/Pociagi');

/**
 * Read the page's own connection search responses and its app version header.
 * The page uses XMLHttpRequest (axios). fetch is wrapped too, in case that changes.
 *
 * @returns the original fetch, for the extension's own requests
 */
export function installCapture({ win, onSearch, onAppVersion, onComposition }: CaptureOptions): FetchFn {
  const parse = (text: string) => {
    try {
      onSearch(JSON.parse(text));
    } catch {
      /* not JSON */
    }
  };

  /** An error in IC3 must not stop the page's own request. */
  const composition = (url: string) => {
    try {
      onComposition?.(url);
    } catch (e) {
      console.warn('[IC3]', e);
    }
  };

  const XHR = win.XMLHttpRequest.prototype;
  const { open, send, setRequestHeader } = XHR;

  XHR.open = function (this: TaggedXhr, method: string, url: string | URL, ...rest: unknown[]) {
    this.__ic3Url = String(url);
    return (open as (...a: unknown[]) => void).call(this, method, url, ...rest);
  };
  XHR.setRequestHeader = function (this: XMLHttpRequest, name: string, value: string) {
    if (name.toLowerCase() === 'app-version' && value) onAppVersion(value);
    return setRequestHeader.call(this, name, value);
  };
  XHR.send = function (this: TaggedXhr, body?: Document | XMLHttpRequestBodyInit | null) {
    if (isComposition(this.__ic3Url)) composition(this.__ic3Url!);
    if (isSearch(this.__ic3Url)) this.addEventListener('load', () => parse(this.responseText));
    return send.call(this, body);
  };

  const originalFetch = win.fetch.bind(win);
  const wrappedFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (isComposition(url)) composition(url);
    const res = await originalFetch(input, init);
    if (isSearch(url)) res.clone().text().then(parse, () => {});
    return res;
  };
  // The Bun types add extra fields to `typeof fetch` that a browser fetch does not have.
  win.fetch = wrappedFetch as typeof win.fetch;

  return originalFetch;
}
