import type { Lyrics, LyricsProvider } from './provider.js';
import { normalizeLyrics } from './manual.js';
import type { FetchFn, TrackRef } from '../types.js';

const BASE = 'https://api.musixmatch.com/ws/1.1/';

interface MxmEnvelope<B> {
  message: { header: { status_code: number }; body: B | '' | [] };
}
interface MxmLyricsBody {
  lyrics?: { lyrics_body: string; lyrics_copyright?: string; restricted?: number };
}
interface MxmSearchBody {
  track_list?: { track: { track_id: number; commontrack_id?: number; has_lyrics: number } }[];
}

/** De gratis sleutel geeft ongeveer 30% van de tekst plus een disclaimer-regel. */
const DISCLAIMER = /\n*\.{3}\s*\n*\*{3,}[^\n]*\*{3,}\s*(\(\d+\))?\s*$/s;
const DISCLAIMER_LOOSE = /\*{3,}\s*This Lyrics is NOT for Commercial use\s*\*{3,}.*$/is;

export function cleanMusixmatchBody(body: string): { text: string; partial: boolean } {
  let text = body;
  let partial = false;
  if (DISCLAIMER.test(text) || DISCLAIMER_LOOSE.test(text)) {
    partial = true;
    text = text.replace(DISCLAIMER, '').replace(DISCLAIMER_LOOSE, '');
  }
  return { text: normalizeLyrics(text), partial };
}

/** Officiele Musixmatch API: eerst op ISRC, dan zoeken op artiest en titel. */
export class MusixmatchProvider implements LyricsProvider {
  readonly id = 'musixmatch';

  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  private async call<B>(method: string, params: Record<string, string | number>): Promise<MxmEnvelope<B>> {
    if (!this.apiKey) throw new Error('MUSIXMATCH_API_KEY ontbreekt in .env');
    const url = new URL(method, BASE);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    url.searchParams.set('apikey', this.apiKey);
    const res = await this.fetchFn(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Musixmatch ${method}: HTTP ${res.status}`);
    return (await res.json()) as MxmEnvelope<B>;
  }

  private toLyrics(env: MxmEnvelope<MxmLyricsBody>): Lyrics | undefined {
    if (env.message.header.status_code !== 200) return undefined;
    const body = env.message.body;
    if (!body || Array.isArray(body) || !body.lyrics?.lyrics_body) return undefined;
    const { text, partial } = cleanMusixmatchBody(body.lyrics.lyrics_body);
    if (!text) return undefined;
    return { text, partial, source: this.id, copyright: body.lyrics.lyrics_copyright?.trim() || undefined };
  }

  async getLyrics(track: TrackRef): Promise<Lyrics | undefined> {
    if (track.isrc) {
      const hit = this.toLyrics(await this.call<MxmLyricsBody>('matcher.lyrics.get', { track_isrc: track.isrc }));
      if (hit) return hit;
    }
    const search = await this.call<MxmSearchBody>('track.search', {
      q_track: track.title,
      q_artist: track.artist,
      f_has_lyrics: 1,
      s_track_rating: 'desc',
      page_size: 5,
    });
    const body = search.message.body;
    const first = body && !Array.isArray(body) ? body.track_list?.[0]?.track : undefined;
    if (search.message.header.status_code !== 200 || !first) return undefined;
    const params: Record<string, number> = first.commontrack_id
      ? { commontrack_id: first.commontrack_id }
      : { track_id: first.track_id };
    return this.toLyrics(await this.call<MxmLyricsBody>('track.lyrics.get', params));
  }
}
