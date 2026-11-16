import { vi } from 'vitest';

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Nep-fetch die per aanroep de volgende route-handler zoekt op een stuk van de URL. */
export function mockFetch(routes: [match: string | RegExp, reply: (url: URL, init?: RequestInit) => Response][]) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const hit = routes.find(([m]) => (typeof m === 'string' ? url.href.includes(m) : m.test(url.href)));
    if (!hit) throw new Error(`onverwachte fetch: ${url.href}`);
    return hit[1](url, init);
  });
}
