import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SpotifyClient, NotLoggedInError } from '../src/spotify/client.js';
import { challengeFor } from '../src/spotify/pkce.js';
import { jsonResponse, mockFetch } from './helpers.js';

const sp = { id: 't1', name: 'Wasser', artists: [{ name: 'A' }, { name: 'B' }], external_ids: { isrc: 'DE1' }, album: { name: 'Al', images: [{ url: 'img' }] }, external_urls: { spotify: 'https://open.spotify.com/track/t1' } };

function setup(routes: Parameters<typeof mockFetch>[0], now = () => 1_000_000) {
  const dir = mkdtempSync(path.join(tmpdir(), 'taalstof-'));
  const f = mockFetch(routes);
  const c = new SpotifyClient('cid', 'http://127.0.0.1:8787/callback', path.join(dir, 'tok.json'), f as unknown as typeof fetch, now);
  return { c, f, file: path.join(dir, 'tok.json') };
}

async function login(c: SpotifyClient) {
  const u = new URL(c.authorizeUrl());
  await c.handleCallback('code123', u.searchParams.get('state')!);
  return u;
}

describe('SpotifyClient', () => {
  it('bouwt een PKCE-autorisatie-URL en wisselt de code in', async () => {
    const { c, f, file } = setup([['/api/token', () => jsonResponse({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 })]]);
    const u = await login(c);
    expect(u.origin).toBe('https://accounts.spotify.com');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:8787/callback');
    const body = new URLSearchParams(String(f.mock.calls[0][1]!.body));
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(challengeFor(body.get('code_verifier')!)).toBe(u.searchParams.get('code_challenge'));
    expect(JSON.parse(readFileSync(file, 'utf8')).access_token).toBe('AT');
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
