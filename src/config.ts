import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DEFAULT_MODEL = 'claude-opus-5-5';

export interface Config {
  port: number;
  spotifyClientId: string;
  musixmatchApiKey: string;
  anthropicApiKey: string;
  anthropicModel: string;
  dataDir: string;
  lessonsDir: string;
  redirectUri: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 8787);
  return {
    port,
    spotifyClientId: env.SPOTIFY_CLIENT_ID ?? '',
    musixmatchApiKey: env.MUSIXMATCH_API_KEY ?? '',
    anthropicApiKey: env.ANTHROPIC_API_KEY ?? '',
    anthropicModel: env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    dataDir: path.join(ROOT, 'data'),
    lessonsDir: path.join(ROOT, 'lessons'),
    // Spotify accepteert geen "localhost" meer als redirect; 127.0.0.1 wel.
    redirectUri: `http://127.0.0.1:${port}/callback`,
  };
}
