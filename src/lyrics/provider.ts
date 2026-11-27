import type { TrackRef } from '../types.js';

export interface Lyrics {
  text: string;
  /** true als de bron maar een deel van de tekst gaf. */
  partial: boolean;
  source: string;
  copyright?: string;
}

export interface LyricsProvider {
  readonly id: string;
  /** Geeft undefined als deze bron de tekst niet heeft. */
  getLyrics(track: TrackRef, input?: { text?: string }): Promise<Lyrics | undefined>;
}
