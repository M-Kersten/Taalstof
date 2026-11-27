import { describe, expect, it } from 'vitest';
import { SpotifyClient, NotLoggedInError, type Opslag } from '../src/spotify/client.js';
import { challengeFor } from '../src/spotify/pkce.js';
import { jsonResponse, mockFetch } from './helpers.js';

const sp = { id: 't1', name: 'Wasser', artists: [{ name: 'A' }, { name: 'B' }], external_ids: { isrc: 'DE1' }, album: { name: 'Al', images: [{ url: 'img' }] }, external_urls: { spotify: 'https://open.spotify.com/track/t1' } };

/** Zoals localStorage, maar in het geheugen. */
function geheugen(): Opslag & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

function setup(routes: Parameters<typeof mockFetch>[0], now = () => 1_000_000, opslag = geheugen()) {
  const f = mockFetch(routes);
  const c = new SpotifyClient('cid', 'http://127.0.0.1:5173/', opslag, f as unknown as typeof fetch, now);
  return { c, f, opslag };
}

async function login(c: SpotifyClient) {
  const u = new URL(await c.authorizeUrl());
  await c.handleCallback('code123', u.searchParams.get('state')!);
  return u;
}

describe('SpotifyClient', () => {
  it('bouwt een PKCE-autorisatie-URL en wisselt de code in', async () => {
    const { c, f, opslag } = setup([['/api/token', () => jsonResponse({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 })]]);
    const u = await login(c);
    expect(u.origin).toBe('https://accounts.spotify.com');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:5173/');
    const body = new URLSearchParams(String(f.mock.calls[0][1]!.body));
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(await challengeFor(body.get('code_verifier')!)).toBe(u.searchParams.get('code_challenge'));
    expect(JSON.parse(opslag.getItem('taalstof-spotify-token')!).access_token).toBe('AT');
    // De verifier is na gebruik weg; dezelfde state werkt geen tweede keer.
    expect(c.wachtOp(u.searchParams.get('state')!)).toBe(false);
  });

  it('herkent alleen een terugkeer van een login die hier begon', async () => {
    const { c } = setup([]);
    const u = new URL(await c.authorizeUrl());
    expect(c.wachtOp(u.searchParams.get('state')!)).toBe(true);
    expect(c.wachtOp('iets-anders')).toBe(false);
    expect(c.wachtOp('')).toBe(false);
  });

  it('blijft ingelogd na herladen en kan uitloggen', async () => {
    const opslag = geheugen();
    const routes: Parameters<typeof mockFetch>[0] = [['/api/token', () => jsonResponse({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 })]];
    await login(setup(routes, undefined, opslag).c);
    const later = setup(routes, undefined, opslag).c;
    expect(await later.isLoggedIn()).toBe(true);
    later.uitloggen();
    expect(await setup(routes, undefined, opslag).c.isLoggedIn()).toBe(false);
  });

  it('vraagt om een Client ID voor hij Spotify opent', async () => {
    const c = new SpotifyClient('', 'http://127.0.0.1:5173/', geheugen());
    await expect(c.authorizeUrl()).rejects.toThrow(/Client ID/);
  });

  it('weigert een onbekende state', async () => {
    const { c } = setup([]);
    await expect(c.handleCallback('x', 'onbekend')).rejects.toThrow(/state/);
  });

  it('zoekt nummers en zet ze om naar TrackRef', async () => {
    const { c, f } = setup([
      ['/api/token', () => jsonResponse({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 })],
      ['/v1/search', () => jsonResponse({ tracks: { items: [sp] } })],
    ]);
    await login(c);
    const r = await c.search('wasser');
    expect(r).toEqual([{ title: 'Wasser', artist: 'A, B', isrc: 'DE1', spotifyId: 't1', spotifyUrl: 'https://open.spotify.com/track/t1', album: 'Al', imageUrl: 'img' }]);
    const call = f.mock.calls[1];
    expect((call[1]!.headers as Record<string, string>).Authorization).toBe('Bearer AT');
  });

  it('ververst een verlopen token', async () => {
    let t = 1_000_000;
    let n = 0;
    const { c, f } = setup(
      [
        ['/api/token', () => jsonResponse({ access_token: `AT${++n}`, refresh_token: 'RT', expires_in: 3600 })],
        ['recently-played', () => jsonResponse({ items: [{ track: sp }, { track: sp }] })],
      ],
      () => t,
    );
    await login(c);
    t += 4_000_000;
    const r = await c.recent();
    expect(r).toHaveLength(1);
    const refresh = new URLSearchParams(String(f.mock.calls[1][1]!.body));
    expect(refresh.get('grant_type')).toBe('refresh_token');
  });

  it('valt terug op /tracks als /items niet bestaat en slaat afleveringen over', async () => {
    const { c } = setup([
      ['/api/token', () => jsonResponse({ access_token: 'AT', expires_in: 3600 })],
      ['/items', () => new Response('', { status: 404 })],
      ['/tracks', () => jsonResponse({ items: [{ track: sp }, { track: { ...sp, id: 'e1', type: 'episode' } }, { track: null }] })],
    ]);
    await login(c);
    expect((await c.playlistTracks('p1')).map((t) => t.spotifyId)).toEqual(['t1']);
  });

  it('meldt niet ingelogd zonder token', async () => {
    const { c } = setup([]);
    await expect(c.playlists()).rejects.toBeInstanceOf(NotLoggedInError);
  });
});
