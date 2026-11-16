import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { challengeFor, createVerifier } from './pkce.js';
import type { FetchFn, TrackRef } from '../types.js';

const ACCOUNTS = 'https://accounts.spotify.com';
const API = 'https://api.spotify.com/v1';
export const SCOPES = ['playlist-read-private', 'playlist-read-collaborative', 'user-read-recently-played'];

interface TokenSet {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
}

interface SpTrack {
  id: string;
  name: string;
  type?: string;
  artists: { name: string }[];
  album?: { name: string; images?: { url: string }[] };
  external_ids?: { isrc?: string };
  external_urls?: { spotify?: string };
}

export function toTrackRef(t: SpTrack): TrackRef {
  return {
    title: t.name,
    artist: t.artists.map((a) => a.name).join(', '),
    isrc: t.external_ids?.isrc,
    spotifyId: t.id,
    spotifyUrl: t.external_urls?.spotify ?? `https://open.spotify.com/track/${t.id}`,
    album: t.album?.name,
    imageUrl: t.album?.images?.[0]?.url,
  };
}

/** Officiele Spotify Web API met Authorization Code + PKCE. Alleen metadata, geen songteksten. */
export class SpotifyClient {
  private pending = new Map<string, string>(); // state -> verifier
  private tokens?: TokenSet;

  constructor(
    private readonly clientId: string,
    private readonly redirectUri: string,
    private readonly tokenFile: string,
    private readonly fetchFn: FetchFn = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  authorizeUrl(): string {
    if (!this.clientId) throw new Error('SPOTIFY_CLIENT_ID ontbreekt in .env');
    const verifier = createVerifier();
    const state = createVerifier().slice(0, 16);
    this.pending.set(state, verifier);
    const u = new URL(`${ACCOUNTS}/authorize`);
    u.search = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      code_challenge_method: 'S256',
      code_challenge: challengeFor(verifier),
      scope: SCOPES.join(' '),
      state,
    }).toString();
    return u.toString();
  }

  async handleCallback(code: string, state: string): Promise<void> {
    const verifier = this.pending.get(state);
    if (!verifier) throw new Error('Onbekende of verlopen state; begin opnieuw met inloggen.');
    this.pending.delete(state);
    await this.tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
      client_id: this.clientId,
      code_verifier: verifier,
    });
  }

  private async tokenRequest(form: Record<string, string>): Promise<void> {
    const res = await this.fetchFn(`${ACCOUNTS}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
    });
    if (!res.ok) throw new Error(`Spotify token: HTTP ${res.status} ${await res.text()}`);
    const j = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
    this.tokens = {
      access_token: j.access_token,
      refresh_token: j.refresh_token ?? this.tokens?.refresh_token,
      expires_at: this.now() + (j.expires_in - 60) * 1000,
    };
    await mkdir(path.dirname(this.tokenFile), { recursive: true });
    await writeFile(this.tokenFile, JSON.stringify(this.tokens), { encoding: 'utf8', mode: 0o600 });
  }

  private async loadTokens(): Promise<TokenSet | undefined> {
    if (this.tokens) return this.tokens;
    try {
      this.tokens = JSON.parse(await readFile(this.tokenFile, 'utf8')) as TokenSet;
    } catch {
      /* nog niet ingelogd */
    }
    return this.tokens;
  }

  async isLoggedIn(): Promise<boolean> {
    return !!(await this.loadTokens());
  }

  private async accessToken(): Promise<string> {
    const t = await this.loadTokens();
    if (!t) throw new NotLoggedInError();
    if (t.expires_at <= this.now()) {
      if (!t.refresh_token) throw new NotLoggedInError();
      await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: this.clientId });
    }
    return this.tokens!.access_token;
  }

  async get<T>(pathAndQuery: string): Promise<T> {
    const res = await this.fetchFn(`${API}${pathAndQuery}`, {
      headers: { Authorization: `Bearer ${await this.accessToken()}` },
    });
    if (res.status === 401) throw new NotLoggedInError();
    if (!res.ok) throw new SpotifyHttpError(res.status, pathAndQuery);
    return (await res.json()) as T;
  }

  async playlists(): Promise<{ id: string; name: string; imageUrl?: string; total?: number }[]> {
    const j = await this.get<{ items: { id: string; name: string; images?: { url: string }[] | null; tracks?: { total: number }; items?: { total: number } }[] }>(
      '/me/playlists?limit=50',
    );
    return j.items.filter(Boolean).map((p) => ({
      id: p.id,
      name: p.name,
      imageUrl: p.images?.[0]?.url,
      total: p.items?.total ?? p.tracks?.total,
    }));
  }

  async playlistTracks(id: string): Promise<TrackRef[]> {
    type Row = { track?: SpTrack | null; item?: SpTrack | null };
    let j: { items: Row[] };
    try {
      j = await this.get<{ items: Row[] }>(`/playlists/${encodeURIComponent(id)}/items?limit=100`);
    } catch (e) {
      // Oudere variant van het endpoint
      if (!(e instanceof SpotifyHttpError) || e.status !== 404) throw e;
      j = await this.get<{ items: Row[] }>(`/playlists/${encodeURIComponent(id)}/tracks?limit=100`);
    }
    return j.items
      .map((r) => r.item ?? r.track)
      .filter((t): t is SpTrack => !!t && (t.type ?? 'track') === 'track' && !!t.id)
      .map(toTrackRef);
  }

  async recent(): Promise<TrackRef[]> {
    const j = await this.get<{ items: { track: SpTrack }[] }>('/me/player/recently-played?limit=50');
    const seen = new Set<string>();
    return j.items.map((i) => toTrackRef(i.track)).filter((t) => !seen.has(t.spotifyId!) && !!seen.add(t.spotifyId!));
  }

  async search(q: string): Promise<TrackRef[]> {
    const j = await this.get<{ tracks: { items: SpTrack[] } }>(`/search?type=track&limit=10&q=${encodeURIComponent(q)}`);
    return j.tracks.items.map(toTrackRef);
  }

  async track(id: string): Promise<TrackRef> {
    return toTrackRef(await this.get<SpTrack>(`/tracks/${encodeURIComponent(id)}`));
  }
}

export class NotLoggedInError extends Error {
  constructor() {
    super('Niet ingelogd bij Spotify');
  }
}
export class SpotifyHttpError extends Error {
  constructor(
    readonly status: number,
    p: string,
  ) {
    super(`Spotify ${p}: HTTP ${status}`);
  }
}
