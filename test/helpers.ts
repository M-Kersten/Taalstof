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

/**
 * Controleert een waarde tegen het deel van JSON Schema dat LES_SCHEMA gebruikt.
 * Geeft een lijst met afwijkingen, leeg als alles klopt.
 */
export function schemaFouten(schema: any, waarde: unknown, pad = '$'): string[] {
  if (schema.enum) return schema.enum.includes(waarde) ? [] : [`${pad}: niet een van ${schema.enum.join(', ')}`];
  if (schema.type === 'string') return typeof waarde === 'string' ? [] : [`${pad}: geen tekst`];
  if (schema.type === 'integer') return Number.isInteger(waarde) ? [] : [`${pad}: geen geheel getal`];
  if (schema.type === 'array') {
    if (!Array.isArray(waarde)) return [`${pad}: geen lijst`];
    return waarde.flatMap((v, i) => schemaFouten(schema.items, v, `${pad}[${i}]`));
  }
  if (schema.type === 'object') {
    if (!waarde || typeof waarde !== 'object' || Array.isArray(waarde)) return [`${pad}: geen object`];
    const obj = waarde as Record<string, unknown>;
    const keys = Object.keys(obj);
    return [
      ...schema.required.filter((k: string) => !keys.includes(k)).map((k: string) => `${pad}.${k}: ontbreekt`),
      ...keys.filter((k) => !(k in schema.properties)).map((k) => `${pad}.${k}: onbekend veld`),
      ...keys.filter((k) => k in schema.properties).flatMap((k) => schemaFouten(schema.properties[k], obj[k], `${pad}.${k}`)),
    ];
  }
  return [`${pad}: onbekend schema`];
}
