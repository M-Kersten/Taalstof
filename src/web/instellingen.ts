import { DEFAULT_EFFORT, DEFAULT_MODEL, isEffort, type Effort } from '../lesson/instellingen.js';

/**
 * Instellingen van de app. De Claude-sleutel staat alleen in de opslag van deze browser.
 * Spotify Client ID en de Supabase-gegevens mogen openbaar zijn; ze komen standaard uit de
 * build (variabelen in GitHub) en zijn hier te overschrijven.
 */
export interface Instellingen {
  anthropicKey: string;
  model: string;
  effort: Effort;
  onderzoek: boolean;
  spotifyClientId: string;
  supabaseUrl: string;
  supabaseKey: string;
}

const PLEK = 'taalstof-instellingen';

export function standaard(env: Partial<ImportMetaEnv> = import.meta.env): Instellingen {
  return {
    anthropicKey: '',
    model: DEFAULT_MODEL,
    effort: DEFAULT_EFFORT,
    onderzoek: true,
    spotifyClientId: env.VITE_SPOTIFY_CLIENT_ID ?? '',
    supabaseUrl: env.VITE_SUPABASE_URL ?? '',
    supabaseKey: env.VITE_SUPABASE_ANON_KEY ?? '',
  };
}

export interface Bewaarplek {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

/** Wat in de opslag staat gaat voor de build; lege velden vallen terug op de build. */
export function lees(opslag: Bewaarplek = localStorage, basis = standaard()): Instellingen {
  let eigen: Partial<Instellingen> = {};
  try {
    eigen = JSON.parse(opslag.getItem(PLEK) ?? '{}');
  } catch {
    /* kapotte opslag: begin opnieuw */
  }
  const uit = { ...basis };
  for (const k of Object.keys(basis) as (keyof Instellingen)[]) {
    const v = eigen[k];
    if (v === undefined || v === '') continue;
    if (k === 'effort' && !isEffort(v)) continue;
    if (typeof v === typeof basis[k]) (uit as Record<string, unknown>)[k] = typeof v === 'string' ? v.trim() : v;
  }
  return uit;
}

export function bewaar(i: Instellingen, opslag: Bewaarplek = localStorage): void {
  opslag.setItem(PLEK, JSON.stringify(i));
}

/** Het adres van de app zelf, ook het adres waar Spotify en Supabase naar terugsturen. */
export function appUrl(loc: Pick<Location, 'origin'> = location, base: string = import.meta.env.BASE_URL): string {
  return new URL(base, loc.origin).href;
}
