import Anthropic from '@anthropic-ai/sdk';
import { LES_SCHEMA, schemaFouten, validateLes, type Les } from './schema.js';
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
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: gebruikersprompt(track, lyrics) }];
    let tekens = 0;
    const voortgang = (delta: string) => {
      tekens += delta.length;
      opts.onProgress?.({ tekens });
    };

    let poging = await this.vraag(messages, voortgang);
    let uitkomst = leesLes(poging.tekst);
    if (!uitkomst.les) {
      // Eén herkansing: het model krijgt zijn eigen antwoord terug met wat eraan mankeert.
      messages.push(
        { role: 'assistant', content: poging.content as Anthropic.Beta.BetaContentBlockParam[] },
        {
          role: 'user',
          content: `Dit antwoord klopt niet met het JSON-schema:\n${uitkomst.fouten.slice(0, 30).join('\n')}\nGeef het hele JSON-object opnieuw, verbeterd, zonder tekst ervoor of erna.`,
        },
      );
      tekens = 0;
      poging = await this.vraag(messages, voortgang);
      uitkomst = leesLes(poging.tekst);
    }
    if (!uitkomst.les) throw new Error(`Het model gaf geen bruikbare les terug: ${uitkomst.fouten.slice(0, 3).join('; ')}`);
    return uitkomst.les;
  }

  /** Eén aanroep. Gooit bij een weigering of een afgebroken antwoord. */
  private async vraag(messages: Anthropic.Beta.BetaMessageParam[], onText: (delta: string) => void) {
    const stream = this.client.beta.messages.stream({
      model: this.model,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      system: SYSTEEMPROMPT,
      messages,
      // Het lesschema is te groot voor de strikte JSON-modus van de API. Het schema staat in de prompt
      // en leesLes controleert het antwoord.
      output_config: { effort: this.effort },
      // Weigert een veiligheidsfilter de tekst, dan probeert de API het zelf op het aanbevolen vervangende model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    stream.on('text', onText);
    const msg = await stream.finalMessage();

    if (msg.stop_reason === 'refusal') {
      const cat = msg.stop_details?.category;
      throw new Error(`Het model weigerde van deze tekst een les te maken${cat ? ` (categorie ${cat})` : ''}.`);
    }
    if (msg.stop_reason === 'max_tokens') throw new Error('De les werd te lang en is afgebroken (max_tokens).');
    const tekst = msg.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return { tekst, content: msg.content };
  }
}

/**
 * Haalt de les uit de tekst van het model. Een codeblok of een zin eromheen mag.
 * Velden die het schema niet kent, zijn geen bezwaar; ontbrekende of verkeerde wel.
 */
export function leesLes(tekst: string): { les?: Les; fouten: string[] } {
  const begin = tekst.indexOf('{');
  const eind = tekst.lastIndexOf('}');
  if (begin === -1 || eind < begin) return { fouten: ['Het model gaf geen JSON terug.'] };
  let ruw: unknown;
  try {
    ruw = JSON.parse(tekst.slice(begin, eind + 1));
  } catch (e) {
    return { fouten: [`Het model gaf geen geldige JSON terug (${e instanceof Error ? e.message : e}).`] };
  }
  const fouten = schemaFouten(LES_SCHEMA, ruw).filter((f) => !f.endsWith('onbekend veld'));
  if (fouten.length) return { fouten };
  try {
    return { les: validateLes(ruw), fouten: [] };
  } catch (e) {
    return { fouten: [e instanceof Error ? e.message : String(e)] };
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
