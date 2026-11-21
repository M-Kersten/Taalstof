import express, { type NextFunction, type Request, type Response } from 'express';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, type Config } from './config.js';
import { JsonCache } from './cache.js';
import { SpotifyClient, NotLoggedInError } from './spotify/client.js';
import { findLyrics, ManualLyricsProvider, MusixmatchProvider, type Lyrics, type LyricsProvider } from './lyrics/index.js';
import type { LessonGenerator } from './lesson/generator.js';
import { validateLes } from './lesson/schema.js';
import { renderLesson } from './render/renderer.js';
import type { TrackRef } from './types.js';

export interface Deps {
  config: Config;
  cache: JsonCache;
  spotify: SpotifyClient;
  lyricsProviders: LyricsProvider[];
  generator: LessonGenerator;
}

/**
 * Een les maken duurt minuten. De server doet dat op de achtergrond en de pagina
 * vraagt om de paar tellen hoe ver het is, zodat geen browser erop hoeft te wachten.
 */
export interface Job {
  id: string;
  status: 'bezig' | 'klaar' | 'mislukt';
  /** Tekens van de les die al geschreven zijn. Blijft 0 zolang het model nadenkt. */
  tekens: number;
  gestart: number;
  partial: boolean;
  titel?: string;
  url?: string;
  error?: string;
}

const VOORBEELD = path.join(ROOT, 'voorbeeld', 'die-gedanken-sind-frei.json');
const MAX_JOBS = 50;

export function slug(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

type Handler = (req: Request, res: Response) => Promise<unknown>;
const wrap = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

export function createApp(d: Deps) {
  const app = express();
  const jobs = new Map<string, Job>();
  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(path.join(ROOT, 'public')));
  app.use('/lessons', express.static(d.config.lessonsDir));

  app.get('/login', (_req, res) => res.redirect(d.spotify.authorizeUrl()));
  app.get(
    '/callback',
    wrap(async (req, res) => {
      if (req.query.error) return res.status(400).send(`Spotify weigerde: ${String(req.query.error)}`);
      await d.spotify.handleCallback(String(req.query.code ?? ''), String(req.query.state ?? ''));
      res.redirect('/');
    }),
  );

  app.get(
    '/api/status',
    wrap(async (_req, res) =>
      res.json({
        spotify: await d.spotify.isLoggedIn(),
        keys: {
          spotify: !!d.config.spotifyClientId,
          musixmatch: !!d.config.musixmatchApiKey,
          anthropic: !!d.config.anthropicApiKey,
        },
        model: d.config.anthropicModel,
        effort: d.config.anthropicEffort,
        redirectUri: d.config.redirectUri,
      }),
    ),
  );

  app.get('/api/playlists', wrap(async (_req, res) => res.json(await d.spotify.playlists())));
  app.get('/api/playlists/:id', wrap(async (req, res) => res.json(await d.spotify.playlistTracks(req.params.id))));
  app.get('/api/recent', wrap(async (_req, res) => res.json(await d.spotify.recent())));
  app.get(
    '/api/search',
    wrap(async (req, res) => {
      const q = String(req.query.q ?? '').trim();
      if (!q) return res.json([]);
      res.json(await d.cache.wrap('spotify', JsonCache.key('search', q), () => d.spotify.search(q)));
    }),
  );

  async function lyricsFor(track: TrackRef, pasted?: string): Promise<Lyrics | undefined> {
    if (pasted?.trim()) return new ManualLyricsProvider().getLyrics(track, { text: pasted });
    const key = JsonCache.key('lyrics', track.isrc ?? '', track.artist, track.title);
    const hit = await d.cache.get<Lyrics>('lyrics', key);
    if (hit) return hit;
    const found = await findLyrics(d.lyricsProviders.filter((p) => p.id !== 'handmatig'), track);
    if (found) await d.cache.set('lyrics', key, found);
    return found;
  }

  function trackFromBody(b: unknown): TrackRef {
    const t = (b as { track?: TrackRef })?.track;
    if (!t?.title || !t?.artist) throw Object.assign(new Error('track met title en artist is verplicht'), { status: 400 });
    return t;
  }

  app.post(
    '/api/lyrics',
    wrap(async (req, res) => {
      const lyr = await lyricsFor(trackFromBody(req.body));
      res.json(lyr ?? null);
    }),
  );

  async function maakLes(job: Job, track: TrackRef, lyrics: Lyrics): Promise<void> {
    try {
      const les = await d.generator.generate(track, lyrics, { onProgress: (v) => (job.tekens = v.tekens) });
      const html = renderLesson(les, {
        id: job.id,
        track,
        lyricsSource: lyrics.source,
        partial: lyrics.partial,
        copyright: lyrics.copyright,
        model: d.config.anthropicModel,
        generatedAt: new Date().toISOString(),
      });
      await mkdir(d.config.lessonsDir, { recursive: true });
      await writeFile(path.join(d.config.lessonsDir, `${job.id}.html`), html, 'utf8');
      Object.assign(job, { status: 'klaar', url: `/lessons/${job.id}.html`, titel: les.titel });
    } catch (e) {
      Object.assign(job, { status: 'mislukt', error: e instanceof Error ? e.message : String(e) });
    }
  }

  app.post(
    '/api/lesson',
    wrap(async (req, res) => {
      const track = trackFromBody(req.body);
      const lyrics = await lyricsFor(track, req.body?.lyricsText);
      if (!lyrics) return res.status(404).json({ error: 'Geen songtekst. Plak de tekst in het veld.' });
      const id = `${slug(`${track.artist}-${track.title}`)}-${JsonCache.key(lyrics.text).slice(0, 6)}`;
      // Dezelfde les twee keer aanvragen mag geen tweede, betaalde aanroep starten.
      const lopend = jobs.get(id);
      if (lopend?.status === 'bezig') return res.status(202).json(lopend);
      const job: Job = { id, status: 'bezig', tekens: 0, gestart: Date.now(), partial: lyrics.partial };
      jobs.delete(id);
      jobs.set(id, job);
      for (const [k, j] of jobs) {
        if (jobs.size <= MAX_JOBS) break;
        if (j.status !== 'bezig') jobs.delete(k);
      }
      void maakLes(job, track, lyrics);
      res.status(202).json(job);
    }),
  );

  app.get('/api/jobs/:id', (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Deze opdracht is niet meer bekend. De server is opnieuw gestart.' });
    res.json(job);
  });

  app.get(
    '/api/lessons',
    wrap(async (_req, res) => {
      let files: string[] = [];
      try {
        files = (await readdir(d.config.lessonsDir)).filter((f) => f.endsWith('.html'));
      } catch {
        /* nog geen lessen */
      }
      const rows = await Promise.all(
        files.map(async (f) => ({ file: f, url: `/lessons/${f}`, mtime: (await stat(path.join(d.config.lessonsDir, f))).mtimeMs })),
      );
      res.json(rows.sort((a, b) => b.mtime - a.mtime));
    }),
  );

  /** De meegeleverde voorbeeldles: werkt zonder sleutels en laat zien hoe een les eruitziet. */
  app.get(
    '/voorbeeld',
    wrap(async (_req, res) => {
      const les = validateLes(JSON.parse(await readFile(VOORBEELD, 'utf8')));
      res.type('html').send(
        renderLesson(les, {
          id: 'voorbeeld',
          track: { title: les.lied.titel, artist: les.lied.artiest },
          lyricsSource: 'publiek domein',
          partial: false,
          model: '',
          generatedAt: '',
          voorbeeld: true,
        }),
      );
    }),
  );

  app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof NotLoggedInError) return res.status(401).json({ error: err.message, login: '/login' });
    res.status(err.status ?? 500).json({ error: err.message });
  });

  return app;
}

export function defaultDeps(config: Config, generator: LessonGenerator): Deps {
  const cache = new JsonCache(config.dataDir);
  return {
    config,
    cache,
    spotify: new SpotifyClient(config.spotifyClientId, config.redirectUri, path.join(config.dataDir, 'spotify-token.json')),
    // Zonder sleutel plak je de tekst zelf; Musixmatch is een optie.
    lyricsProviders: [...(config.musixmatchApiKey ? [new MusixmatchProvider(config.musixmatchApiKey)] : []), new ManualLyricsProvider()],
    generator,
  };
}
