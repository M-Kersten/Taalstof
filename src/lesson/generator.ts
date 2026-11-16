import Anthropic from '@anthropic-ai/sdk';
import { LES_SCHEMA, validateLes, type Les } from './schema.js';
import { PROMPT_VERSIE, SYSTEEMPROMPT, gebruikersprompt } from './prompt.js';
import type { Lyrics } from '../lyrics/provider.js';
import type { TrackRef } from '../types.js';
import { JsonCache } from '../cache.js';
import { DEFAULT_EFFORT, type Effort } from '../config.js';

/** Hoeveel tekens van de les het model al geschreven heeft. Blijft 0 zolang het nadenkt. */
export interface Voortgang {
  tekens: number;
}

export interface GenerateOpts {
  onProgress?: (v: Voortgang) => void;
}

export interface LessonGenerator {
  generate(track: TrackRef, lyrics: Lyrics, opts?: GenerateOpts): Promise<Les>;
}

type Antwoord = Pick<Anthropic.Beta.BetaMessage, 'content' | 'stop_reason' | 'stop_details'>;
type StreamParams = Parameters<Anthropic['beta']['messages']['stream']>[0];

/** Minimale vorm van de SDK die we gebruiken, zodat tests een nep-client kunnen geven. */
export interface MessagesLike {
  beta: {
    messages: {
      stream(params: StreamParams): {
        on(event: 'text', listener: (delta: string) => void): unknown;
        finalMessage(): Promise<Antwoord>;
      };
    };
  };
}

export interface GeneratorOpties {
  apiKey: string;
  model: string;
  effort?: Effort;
  cache?: JsonCache;
  client?: MessagesLike;
}

/**
 * Ruimte voor het denkwerk en de les samen: denken telt mee voor max_tokens,
 * ook al komt die tekst niet terug. Een les van een lang lied is ruwweg dertigduizend
 * tokens. Het plafond ligt daar ver boven, want een afgebroken les is weggegooid geld.
 */
const MAX_TOKENS = 100_000;

export class ClaudeLessonGenerator implements LessonGenerator {
  private readonly client: MessagesLike;
  private readonly model: string;
  private readonly effort: Effort;
  private readonly cache?: JsonCache;

  constructor(o: GeneratorOpties) {
    this.model = o.model;
    this.effort = o.effort ?? DEFAULT_EFFORT;
    this.cache = o.cache;
    this.client = o.client ?? (o.apiKey ? new Anthropic({ apiKey: o.apiKey }) : zonderSleutel);
  }

  async generate(track: TrackRef, lyrics: Lyrics, opts: GenerateOpts = {}): Promise<Les> {
    const key = JsonCache.key(this.model, this.effort, PROMPT_VERSIE, track.title, track.artist, lyrics.text);
    const run = () => this.call(track, lyrics, opts);
    return this.cache ? this.cache.wrap('lessen', key, run) : run();
  }

  private async call(track: TrackRef, lyrics: Lyrics, opts: GenerateOpts): Promise<Les> {
    const stream = this.client.beta.messages.stream({
      model: this.model,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      system: SYSTEEMPROMPT,
      messages: [{ role: 'user', content: gebruikersprompt(track, lyrics) }],
      output_config: { effort: this.effort, format: { type: 'json_schema', schema: LES_SCHEMA } },
      // Weigert een veiligheidsfilter de tekst, dan probeert de API het zelf op het aanbevolen vervangende model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    let tekens = 0;
    stream.on('text', (delta) => {
      tekens += delta.length;
      opts.onProgress?.({ tekens });
    });
    const msg = await stream.finalMessage();

    if (msg.stop_reason === 'refusal') {
      const cat = msg.stop_details?.category;
      throw new Error(`Het model weigerde van deze tekst een les te maken${cat ? ` (categorie ${cat})` : ''}.`);
    }
    if (msg.stop_reason === 'max_tokens') throw new Error('De les werd te lang en is afgebroken (max_tokens).');
    const text = msg.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    if (!text) throw new Error('Het model gaf geen JSON terug.');
    let les: unknown;
    try {
      les = JSON.parse(text);
    } catch {
      throw new Error('Het model gaf geen geldige JSON terug.');
    }
    return validateLes(les);
  }
}

/** De echte client gooit pas bij een aanroep; geef dan een duidelijke melding. */
const zonderSleutel: MessagesLike = {
  beta: {
    messages: {
      stream: () => {
        throw new Error('ANTHROPIC_API_KEY ontbreekt in .env');
      },
    },
  },
};
