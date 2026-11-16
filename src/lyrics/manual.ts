import type { Lyrics, LyricsProvider } from './provider.js';
import type { TrackRef } from '../types.js';

/** De gebruiker plakt zelf de tekst. */
export class ManualLyricsProvider implements LyricsProvider {
  readonly id = 'handmatig';

  async getLyrics(_track: TrackRef, input?: { text?: string }): Promise<Lyrics | undefined> {
    const text = normalizeLyrics(input?.text ?? '');
    if (!text) return undefined;
    return { text, partial: false, source: this.id };
  }
}

export function normalizeLyrics(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
