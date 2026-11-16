export type FetchFn = typeof fetch;

/** Wat Taalstof van een nummer weet, los van de bron. */
export interface TrackRef {
  title: string;
  artist: string;
  isrc?: string;
  spotifyId?: string;
  spotifyUrl?: string;
  album?: string;
  /** Datum van het album volgens Spotify. Kan een heruitgave zijn. */
  releaseDate?: string;
  imageUrl?: string;
}
