import type { Lyrics, LyricsProvider } from './provider.js';
import type { TrackRef } from '../types.js';

export * from './provider.js';
export { MusixmatchProvider, cleanMusixmatchBody } from './musixmatch.js';
export { ManualLyricsProvider, normalizeLyrics } from './manual.js';

/** Probeert providers op volgorde; de eerste met tekst wint. */
export async function findLyrics(
  providers: LyricsProvider[],
  track: TrackRef,
  input?: { text?: string },
): Promise<Lyrics | undefined> {
  for (const p of providers) {
    const hit = await p.getLyrics(track, input);
    if (hit) return hit;
  }
  return undefined;
}
