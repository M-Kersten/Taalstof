/** Wat een les kost, opgeteld over alle aanroepen die ervoor nodig waren. */
export interface Kosten {
  invoer: number;
  cacheLezen: number;
  cacheSchrijven: number;
  uitvoer: number;
  zoekopdrachten: number;
  /** Bedrag in dollars, of null als de prijzen van het model hier niet bekend zijn. */
  dollar: number | null;
  /** De les kwam uit de cache en kostte niets. */
  uitCache: boolean;
}

/** Dollars per miljoen tokens, volgens de prijslijst van Anthropic (november 2026). */
const PRIJZEN: Record<string, { invoer: number; uitvoer: number; cacheSchrijven: number; cacheLezen: number }> = {
  'claude-opus-5-5': { invoer: 4, uitvoer: 20, cacheSchrijven: 5, cacheLezen: 0.2 },
  'claude-sonnet-5-5': { invoer: 2, uitvoer: 10, cacheSchrijven: 2.5, cacheLezen: 0.1 },
};
const PER_ZOEKOPDRACHT = 0.01;

/** Het deel van `usage` uit een antwoord van de API dat we nodig hebben. */
export interface Gebruik {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
}

export function leegKosten(uitCache = false): Kosten {
  return { invoer: 0, cacheLezen: 0, cacheSchrijven: 0, uitvoer: 0, zoekopdrachten: 0, dollar: uitCache ? 0 : null, uitCache };
}

export function telOp(k: Kosten, u: Gebruik | null | undefined, model: string): Kosten {
  const n = {
    ...k,
    invoer: k.invoer + (u?.input_tokens ?? 0),
    cacheLezen: k.cacheLezen + (u?.cache_read_input_tokens ?? 0),
    cacheSchrijven: k.cacheSchrijven + (u?.cache_creation_input_tokens ?? 0),
    uitvoer: k.uitvoer + (u?.output_tokens ?? 0),
    zoekopdrachten: k.zoekopdrachten + (u?.server_tool_use?.web_search_requests ?? 0),
  };
  const p = PRIJZEN[model];
  n.dollar = p
    ? (n.invoer * p.invoer + n.uitvoer * p.uitvoer + n.cacheSchrijven * p.cacheSchrijven + n.cacheLezen * p.cacheLezen) / 1e6 +
      n.zoekopdrachten * PER_ZOEKOPDRACHT
    : null;
  return n;
}

export function bedrag(k: Kosten): string {
  if (k.uitCache) return 'uit de cache, gratis';
  if (k.dollar === null) return `${Math.round((k.invoer + k.cacheLezen + k.cacheSchrijven) / 1000)}k tokens in, ${Math.round(k.uitvoer / 1000)}k uit`;
  return `ongeveer $${k.dollar.toFixed(2)}`;
}
