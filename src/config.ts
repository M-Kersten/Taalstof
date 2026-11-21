import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DEFAULT_MODEL = 'claude-opus-5-5';

/** Hoe diep het model nadenkt voor het de les schrijft. Hoger is nauwkeuriger en kost meer tijd en geld. */
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type Effort = (typeof EFFORTS)[number];
export const DEFAULT_EFFORT: Effort = 'medium';

export interface Config {
  port: number;
  spotifyClientId: string;
  musixmatchApiKey: string;
  anthropicApiKey: string;
  anthropicModel: string;
  anthropicEffort: Effort;
  /** Mag het model het web doorzoeken naar de artiest en het lied? */
  onderzoek: boolean;
  dataDir: string;
  lessonsDir: string;
  redirectUri: string;
}

function effort(raw: string | undefined): Effort {
  if (!raw) return DEFAULT_EFFORT;
  if ((EFFORTS as readonly string[]).includes(raw)) return raw as Effort;
  throw new Error(`ANTHROPIC_EFFORT moet een van ${EFFORTS.join(', ')} zijn, niet "${raw}"`);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 8787);
  return {
    port,
    spotifyClientId: env.SPOTIFY_CLIENT_ID ?? '',
    musixmatchApiKey: env.MUSIXMATCH_API_KEY ?? '',
    anthropicApiKey: env.ANTHROPIC_API_KEY ?? '',
    anthropicModel: env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    anthropicEffort: effort(env.ANTHROPIC_EFFORT),
    onderzoek: env.ONDERZOEK !== 'uit',
    dataDir: path.join(ROOT, 'data'),
    lessonsDir: path.join(ROOT, 'lessons'),
    // Spotify accepteert geen "localhost" meer als redirect; 127.0.0.1 wel.
    redirectUri: `http://127.0.0.1:${port}/callback`,
  };
}
