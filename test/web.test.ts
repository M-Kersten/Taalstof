import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sleutel, slug } from '../src/hash.js';
import { appUrl, bewaar, lees, standaard, type Bewaarplek } from '../src/web/instellingen.js';
import { Lessenbank, maakBank, type LesRij } from '../src/web/opslag.js';
import type { Les } from '../src/lesson/schema.js';

function geheugen(): Bewaarplek & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

describe('sleutel en slug', () => {
  it('geeft dezelfde sleutel voor dezelfde invoer en een andere bij een verschil', async () => {
    const a = await sleutel('m', 'medium', true, 7, 'Titel', 'Artiest', 'tekst');
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(await sleutel('m', 'medium', true, 7, 'Titel', 'Artiest', 'tekst')).toBe(a);
    expect(await sleutel('m', 'low', true, 7, 'Titel', 'Artiest', 'tekst')).not.toBe(a);
  });

  it('maakt een leesbaar stuk adres van Duitse titels', () => {
    expect(slug('Rammstein-Du hast')).toBe('rammstein-du-hast');
    expect(slug('Straße der Ölgemälde!')).toBe('strasse-der-olgemalde');
    expect(slug('x'.repeat(80))).toHaveLength(60);
  });
});

describe('instellingen', () => {
  const env = { VITE_SPOTIFY_CLIENT_ID: 'cid', VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon' };

  it('neemt de openbare gegevens uit de build en laat de Claude-sleutel leeg', () => {
    expect(standaard(env)).toMatchObject({ anthropicKey: '', effort: 'medium', onderzoek: true, spotifyClientId: 'cid', supabaseUrl: 'https://x.supabase.co', supabaseKey: 'anon' });
  });

  it('bewaart in de browser en valt bij lege velden terug op de build', () => {
    const o = geheugen();
    bewaar({ ...standaard(env), anthropicKey: ' sk-ant-1 ', spotifyClientId: '', effort: 'low', onderzoek: false }, o);
    expect(lees(o, standaard(env))).toMatchObject({ anthropicKey: 'sk-ant-1', spotifyClientId: 'cid', effort: 'low', onderzoek: false });
  });

  it('negeert een onbekend niveau en kapotte opslag', () => {
    const o = geheugen();
    o.setItem('taalstof-instellingen', JSON.stringify({ effort: 'turbo', model: 42 }));
    expect(lees(o, standaard(env))).toMatchObject({ effort: 'medium', model: standaard(env).model });
    o.setItem('taalstof-instellingen', '{kapot');
    expect(lees(o, standaard(env))).toEqual(standaard(env));
  });

  it('kent zijn eigen adres, ook onder een projectpagina van GitHub', () => {
    expect(appUrl({ origin: 'https://m-kersten.github.io' }, '/Taalstof/')).toBe('https://m-kersten.github.io/Taalstof/');
    expect(appUrl({ origin: 'http://127.0.0.1:5173' }, '/')).toBe('http://127.0.0.1:5173/');
  });
});

type Uitkomst = { data?: unknown; error?: { message: string } | null };

/** Nep-Supabase: onthoudt elke aanroep in de keten en geeft aan het eind `uitkomst` terug. */
function nepSupabase(uitkomst: Uitkomst = {}, sessie: unknown = null) {
  const calls: [string, unknown[]][] = [];
  const res = { data: uitkomst.data ?? null, error: uitkomst.error ?? null };
  const keten: unknown = new Proxy(
    {},
    {
      get: (_t, naam) =>
        naam === 'then'
          ? (ok: (v: unknown) => unknown, nee: (e: unknown) => unknown) => Promise.resolve(res).then(ok, nee)
          : (...args: unknown[]) => {
              calls.push([String(naam), args]);
              return keten;
            },
    },
  );
  const sb = {
    from: (t: string) => {
      calls.push(['from', [t]]);
      return keten;
    },
    auth: {
      getSession: async () => ({ data: { session: sessie } }),
      signInWithOtp: async (a: unknown) => {
        calls.push(['signInWithOtp', [a]]);
        return { error: uitkomst.error ?? null };
      },
      signOut: async () => calls.push(['signOut', []]),
    },
  };
  return { bank: new Lessenbank(sb as unknown as SupabaseClient), calls };
}

const rij: LesRij = {
  id: 'rammstein-du-hast-abc123',
  sleutel: 'abc123',
  titel: 'Du hast',
  track: { title: 'Du hast', artist: 'Rammstein' },
  les: { titel: 'Du hast' } as Les,
  meta: { model: 'claude-opus-5-5', generatedAt: '2026-11-27T12:00:00Z', bedrag: 'ongeveer $0.80', lyricsSource: 'handmatig', partial: false },
  gemaakt: '2026-11-27T12:00:00Z',
};

describe('Lessenbank', () => {
  it('bestaat niet zonder Supabase-gegevens', () => {
    expect(maakBank({ supabaseUrl: '', supabaseKey: 'x' })).toBeNull();
    expect(maakBank({ supabaseUrl: 'https://x.supabase.co', supabaseKey: '' })).toBeNull();
  });

  it('bewaart een les zonder het tijdstip van de database, en overschrijft dezelfde les', async () => {
    const { bank, calls } = nepSupabase();
    await bank.bewaar(rij);
    expect(calls[0]).toEqual(['from', ['lessen']]);
    const [naam, [waarde, opties]] = calls[1] as [string, [Record<string, unknown>, unknown]];
    expect(naam).toBe('upsert');
    expect(waarde).not.toHaveProperty('gemaakt');
    expect(waarde).toMatchObject({ id: rij.id, sleutel: 'abc123' });
    expect(opties).toEqual({ onConflict: 'user_id,id' });
  });

  it('zoekt een eerdere les op sleutel en geeft niets als hij er niet is', async () => {
    const leeg = nepSupabase({ data: null });
    expect(await leeg.bank.metSleutel('abc123')).toBeUndefined();
    expect(leeg.calls).toContainEqual(['eq', ['sleutel', 'abc123']]);
    const vol = nepSupabase({ data: rij });
    expect((await vol.bank.haal(rij.id))?.titel).toBe('Du hast');
  });

  it('meldt fouten van de database in het Nederlands', async () => {
    const { bank } = nepSupabase({ error: { message: 'JWT expired' } });
    await expect(bank.lijst()).rejects.toThrow('Lessen ophalen lukte niet: JWT expired');
    await expect(bank.bewaar(rij)).rejects.toThrow('Les bewaren lukte niet');
  });

  it('stuurt een inloglink die terugkomt bij de app', async () => {
    const { bank, calls } = nepSupabase();
    await bank.stuurLink('jij@voorbeeld.nl', 'https://m-kersten.github.io/Taalstof/');
    expect(calls).toContainEqual(['signInWithOtp', [{ email: 'jij@voorbeeld.nl', options: { emailRedirectTo: 'https://m-kersten.github.io/Taalstof/' } }]]);
  });

  it('kent het adres van wie ingelogd is', async () => {
    expect(await nepSupabase().bank.email()).toBeNull();
    expect(await nepSupabase({}, { user: { email: 'jij@voorbeeld.nl' } }).bank.email()).toBe('jij@voorbeeld.nl');
  });
});

describe('supabase/schema.sql', () => {
  const sql = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');

  it('heeft een kolom voor elk veld van een lesrij', () => {
    const tabel = sql.slice(sql.indexOf('create table'), sql.indexOf(');'));
    const kolommen = [...tabel.matchAll(/^\s+([a-z_]+) [a-z]/gm)].map((m) => m[1]).filter((k) => k !== 'primary');
    expect(kolommen.sort()).toEqual([...Object.keys(rij), 'user_id'].sort());
  });

  it('laat iedereen alleen bij zijn eigen lessen', () => {
    expect(sql).toContain('enable row level security');
    for (const soort of ['select', 'insert', 'update', 'delete']) expect(sql).toMatch(new RegExp(`for ${soort} to authenticated`));
    expect(sql.match(/\(select auth\.uid\(\)\) = user_id/g)!.length).toBeGreaterThanOrEqual(5);
  });
});
