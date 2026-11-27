import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp, defaultDeps, slug, type Deps, type Job } from '../src/app.js';
import { JsonCache } from '../src/cache.js';
import { loadConfig } from '../src/config.js';
import { SpotifyClient } from '../src/spotify/client.js';
import type { LessonGenerator } from '../src/lesson/generator.js';
import { validateLes } from '../src/lesson/schema.js';
import { mockFetch } from './helpers.js';

const les = validateLes(JSON.parse(readFileSync(new URL('./fixtures/les.json', import.meta.url), 'utf8')));
const body = { track: { title: 'Das Wandern', artist: 'Wilhelm Müller' }, lyricsText: 'Das Wandern ist des Müllers Lust' };

let server: Server | undefined;
afterEach(() => server?.close());

/** Start de app op een vrije poort met een nep-generator. Niets hiervan raakt een echte API. */
async function start(generator: LessonGenerator) {
  const dir = mkdtempSync(path.join(tmpdir(), 'taalstof-app-'));
  const config = { ...loadConfig({}), dataDir: path.join(dir, 'data'), lessonsDir: path.join(dir, 'lessons') };
  const deps: Deps = {
    config,
    cache: new JsonCache(config.dataDir),
    spotify: new SpotifyClient('', config.redirectUri, path.join(dir, 'tok.json'), mockFetch([]) as unknown as typeof fetch),
    lyricsProviders: [],
    generator,
  };
  const srv = (server = createApp(deps).listen(0, '127.0.0.1'));
  await new Promise((r) => srv.once('listening', r));
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  const post = (p: string, b: unknown) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  const get = (p: string) => fetch(base + p);
  async function wachtOp(id: string): Promise<Job> {
    for (let i = 0; i < 200; i++) {
      const job = (await (await get(`/api/jobs/${id}`)).json()) as Job;
      if (job.status !== 'bezig') return job;
      await new Promise((r) => setTimeout(r, 5));
    }
    throw new Error('de opdracht bleef bezig');
  }
  return { config, post, get, wachtOp };
}

describe('les maken op de achtergrond', () => {
  it('antwoordt meteen, meldt de voortgang en levert daarna de les', async () => {
    let klaar!: () => void;
    const poort = new Promise<void>((r) => (klaar = r));
    const generate = vi.fn<LessonGenerator['generate']>(async (_t, _l, opts) => {
      opts?.onProgress?.({ tekens: 42 });
      await poort;
      return les;
    });
    const app = await start({ generate });

    const res = await app.post('/api/lesson', body);
    expect(res.status).toBe(202);
    const job = (await res.json()) as Job;
    expect(job).toMatchObject({ status: 'bezig', partial: false });
    expect(job.id).toMatch(/^wilhelm-muller-das-wandern-[0-9a-f]{6}$/);

    const onderweg = (await (await app.get(`/api/jobs/${job.id}`)).json()) as Job;
    expect(onderweg).toMatchObject({ status: 'bezig', tekens: 42 });

    // Nog een keer vragen terwijl de les loopt mag geen tweede, betaalde aanroep starten.
    const dubbel = (await (await app.post('/api/lesson', body)).json()) as Job;
    expect(dubbel.id).toBe(job.id);
    expect(generate).toHaveBeenCalledTimes(1);

    klaar();
    const af = await app.wachtOp(job.id);
    expect(af).toMatchObject({ status: 'klaar', titel: les.titel, url: `/lessons/${job.id}.html` });
    expect(existsSync(path.join(app.config.lessonsDir, `${job.id}.html`))).toBe(true);
    const html = await (await app.get(af.url!)).text();
    expect(html).toContain('<title>Das Wandern · Taalstof</title>');
    expect(await (await app.get('/api/lessons')).json()).toMatchObject([{ file: `${job.id}.html` }]);

    // Na afloop mag dezelfde les opnieuw: de generator haalt hem dan uit zijn cache.
    await app.post('/api/lesson', body);
    await app.wachtOp(job.id);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('geeft de geplakte tekst en het nummer door aan de generator', async () => {
    const generate = vi.fn<LessonGenerator['generate']>(async () => les);
    const app = await start({ generate });
    const job = (await (await app.post('/api/lesson', { ...body, lyricsText: 'Eins  \r\nZwei\n' })).json()) as Job;
    await app.wachtOp(job.id);
    expect(generate.mock.calls[0][0]).toEqual(body.track);
    expect(generate.mock.calls[0][1]).toEqual({ text: 'Eins\nZwei', partial: false, source: 'handmatig' });
  });

  it('meldt waarom een les mislukte', async () => {
    const app = await start({ generate: async () => Promise.reject(new Error('ANTHROPIC_API_KEY ontbreekt in .env')) });
    const job = (await (await app.post('/api/lesson', body)).json()) as Job;
    expect(await app.wachtOp(job.id)).toMatchObject({ status: 'mislukt', error: 'ANTHROPIC_API_KEY ontbreekt in .env' });
    expect(await (await app.get('/api/lessons')).json()).toEqual([]);
  });

  it('begint er niet aan zonder songtekst of zonder nummer', async () => {
    const generate = vi.fn<LessonGenerator['generate']>(async () => les);
    const app = await start({ generate });
    expect((await app.post('/api/lesson', { track: body.track })).status).toBe(404);
    expect((await app.post('/api/lesson', { lyricsText: 'x' })).status).toBe(400);
    expect(generate).not.toHaveBeenCalled();
  });

  it('kent een opdracht van voor de herstart niet meer', async () => {
    const app = await start({ generate: async () => les });
    const res = await app.get('/api/jobs/bestaat-niet');
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toContain('opnieuw gestart');
  });
});

describe('de rest van de app', () => {
  it('toont de voorbeeldles zonder een enkele sleutel', async () => {
    const generate = vi.fn<LessonGenerator['generate']>(async () => les);
    const app = await start({ generate });
    const res = await app.get('/voorbeeld');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('Die Gedanken sind frei');
    expect(html).toContain('id="overzicht"');
    expect(html).toContain('<section class="stap" id="stap-s0-erachter"');
    expect(html).toContain('voorbeeldles');
    expect(generate).not.toHaveBeenCalled();
  });

  it('laat in de status zien welk model hoe diep nadenkt', async () => {
    const app = await start({ generate: async () => les });
    expect(await (await app.get('/api/status')).json()).toMatchObject({
      spotify: false,
      keys: { spotify: false, musixmatch: false, anthropic: false },
      model: 'claude-opus-5-5',
      effort: 'medium',
    });
  });

  it('gebruikt Musixmatch alleen met een sleutel', () => {
    const zonder = defaultDeps({ ...loadConfig({}), musixmatchApiKey: '' }, { generate: async () => les });
    expect(zonder.lyricsProviders.map((p) => p.id)).toEqual(['handmatig']);
    const met = defaultDeps({ ...loadConfig({}), musixmatchApiKey: 'k' }, { generate: async () => les });
    expect(met.lyricsProviders.map((p) => p.id)).toEqual(['musixmatch', 'handmatig']);
  });

  it('maakt een bestandsnaam zonder vreemde tekens', () => {
    expect(slug('Die Ärzte-Schrei nach Liebe!')).toBe('die-arzte-schrei-nach-liebe');
    expect(slug('Straße')).toBe('strasse');
  });
});
