import Anthropic from '@anthropic-ai/sdk';
import { LES_SCHEMA, validateLes, type Les } from './schema.js';
import { PROMPT_VERSIE, SYSTEEMPROMPT, gebruikersprompt } from './prompt.js';
import type { Lyrics } from '../lyrics/provider.js';
import type { TrackRef } from '../types.js';
import { JsonCache } from '../cache.js';

export interface LessonGenerator {
  generate(track: TrackRef, lyrics: Lyrics): Promise<Les>;
}

/** Minimale vorm van de SDK die we gebruiken, zodat tests een nep-client kunnen geven. */
export interface MessagesLike {
  messages: {
    stream(params: Anthropic.MessageStreamParams): { finalMessage(): Promise<Anthropic.Message> };
  };
}

export class ClaudeLessonGenerator implements LessonGenerator {
  private readonly client: MessagesLike;

  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly cache?: JsonCache,
    client?: MessagesLike,
  ) {
    this.client = client ?? (new Anthropic({ apiKey }) as unknown as MessagesLike);
    if (!client && !apiKey) {
      // De client gooit pas bij een aanroep; geef dan een duidelijke melding.
      this.client = {
        messages: {
          stream: () => {
            throw new Error('ANTHROPIC_API_KEY ontbreekt in .env');
          },
        },
      };
    }
  }

  async generate(track: TrackRef, lyrics: Lyrics): Promise<Les> {
    const key = JsonCache.key(this.model, PROMPT_VERSIE, track.title, track.artist, lyrics.text);
    const run = () => this.call(track, lyrics);
    return this.cache ? this.cache.wrap('lessen', key, run) : run();
  }

  private async call(track: TrackRef, lyrics: Lyrics): Promise<Les> {
    const msg = await this.client.messages
      .stream({
        model: this.model,
        max_tokens: 32000,
        system: SYSTEEMPROMPT,
        messages: [{ role: 'user', content: gebruikersprompt(track, lyrics) }],
        output_config: { format: { type: 'json_schema', schema: LES_SCHEMA } },
      })
      .finalMessage();
    if (msg.stop_reason === 'max_tokens') throw new Error('De les werd te lang en is afgebroken (max_tokens).');
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    if (!text) throw new Error('Het model gaf geen JSON terug.');
    return validateLes(JSON.parse(text));
  }
}
