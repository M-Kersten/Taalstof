import { loadConfig } from './config.js';
import { createApp, defaultDeps } from './app.js';
import { ClaudeLessonGenerator } from './lesson/generator.js';
import { JsonCache } from './cache.js';

const config = loadConfig();
const generator = new ClaudeLessonGenerator({
  apiKey: config.anthropicApiKey,
  model: config.anthropicModel,
  effort: config.anthropicEffort,
  cache: new JsonCache(config.dataDir),
});
const app = createApp(defaultDeps(config, generator));

app.listen(config.port, '127.0.0.1', () => {
  console.log(`Taalstof draait op http://127.0.0.1:${config.port}`);
  const mist = [
    !config.spotifyClientId && 'SPOTIFY_CLIENT_ID',
    !config.anthropicApiKey && 'ANTHROPIC_API_KEY',
  ].filter(Boolean);
  if (mist.length) console.log(`Let op, nog niet ingesteld in .env: ${mist.join(', ')}`);
});
