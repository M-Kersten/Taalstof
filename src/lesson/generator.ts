import Anthropic from '@anthropic-ai/sdk';
import { LES_SCHEMA, schemaFouten, validateLes, type Les } from './schema.js';
import { PROMPT_VERSIE, SYSTEEMPROMPT, gebruikersprompt } from './prompt.js';
import type { Lyrics } from '../lyrics/provider.js';
import type { TrackRef } from '../types.js';
import { sleutel } from '../hash.js';
import { DEFAULT_EFFORT, type Effort } from './instellingen.js';
import { leegKosten, telOp, type Kosten } from './kosten.js';

/**
 * Hoe ver het model is. `zoekopdrachten` telt het onderzoek, `tekens` wat er al
 * geschreven is. Beide blijven 0 zolang het model nadenkt.
 */
export interface Voortgang {
  tekens: number;
  zoekopdrachten: number;
}

export interface GenerateOpts {
  onProgress?: (v: Voortgang) => void;
  /** Wat de les tot nu toe kost. Komt na elke aanroep, ook als de les daarna mislukt. */
  onKosten?: (k: Kosten) => void;
}

export interface LessonGenerator {
  generate(track: TrackRef, lyrics: Lyrics, opts?: GenerateOpts): Promise<Les>;
}

type Antwoord = Pick<Anthropic.Beta.BetaMessage, 'content' | 'stop_reason' | 'stop_details'> & { usage?: Anthropic.Beta.BetaUsage | null };
type StreamParams = Parameters<Anthropic['beta']['messages']['stream']>[0];
type Gebeurtenis = { type: string; content_block?: { type: string } };

/** Minimale vorm van de SDK die we gebruiken, zodat tests een nep-client kunnen geven. */
export interface MessagesLike {
  beta: {
    messages: {
      stream(params: StreamParams): {
        on(event: 'text', listener: (delta: string) => void): unknown;
        on(event: 'streamEvent', listener: (event: Gebeurtenis) => void): unknown;
        finalMessage(): Promise<Antwoord>;
      };
    };
  };
}

/** Eerder gemaakte lessen, op sleutel. In de app is dat Supabase, in de tests een Map. */
export interface LesCache {
  get(key: string): Promise<Les | undefined>;
  set(key: string, les: Les): Promise<void>;
}

export interface GeneratorOpties {
  apiKey: string;
  model: string;
  effort?: Effort;
  /** Mag het model het web doorzoeken? Standaard ja. */
  onderzoek?: boolean;
  cache?: LesCache;
  client?: MessagesLike;
}

/**
 * Ruimte voor het denkwerk en de les samen: denken telt mee voor max_tokens,
 * ook al komt die tekst niet terug. Een les van een lang lied is ruwweg dertigduizend
 * tokens. Het plafond ligt daar ver boven, want een afgebroken les is weggegooid geld.
 */
const MAX_TOKENS = 100_000;

/**
 * Zoeken gebeurt bij Anthropic; de app krijgt alleen de resultaten terug. Alleen zoeken, en
 * hooguit vier keer: hele pagina's openen maakte een les vele malen duurder.
 */
export const ONDERZOEK_TOOLS = [{ type: 'web_search_20260209', name: 'web_search', max_uses: 4 }] as const;

/** Een lange onderzoeksbeurt pauzeert de API soms. Zo vaak laten we hem doorgaan. */
const MAX_VERVOLG = 5;

export class ClaudeLessonGenerator implements LessonGenerator {
  private readonly client: MessagesLike;
  private readonly model: string;
  private readonly effort: Effort;
  private readonly onderzoek: boolean;
  private readonly cache?: LesCache;

  constructor(o: GeneratorOpties) {
    this.model = o.model;
    this.effort = o.effort ?? DEFAULT_EFFORT;
    this.onderzoek = o.onderzoek ?? true;
    this.cache = o.cache;
    // De app draait in de browser en Merijn vult zijn eigen sleutel in; die blijft in zijn browser.
    this.client = o.client ?? (o.apiKey ? new Anthropic({ apiKey: o.apiKey, dangerouslyAllowBrowser: true }) : zonderSleutel);
  }

  /** Dezelfde tekst met dezelfde instellingen geeft dezelfde sleutel, en dus geen tweede rekening. */
  sleutel(track: TrackRef, lyrics: Lyrics): Promise<string> {
    return sleutel(this.model, this.effort, this.onderzoek, PROMPT_VERSIE, track.title, track.artist, lyrics.text);
  }

  async generate(track: TrackRef, lyrics: Lyrics, opts: GenerateOpts = {}): Promise<Les> {
    const key = await this.sleutel(track, lyrics);
    const eerder = await this.cache?.get(key);
    if (eerder) {
      opts.onKosten?.(leegKosten(true));
      return eerder;
    }
    const les = await this.call(track, lyrics, opts);
    await this.cache?.set(key, les);
    return les;
  }

  private async call(track: TrackRef, lyrics: Lyrics, opts: GenerateOpts): Promise<Les> {
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      { role: 'user', content: gebruikersprompt(track, lyrics, this.onderzoek) },
    ];
    const stand: Voortgang = { tekens: 0, zoekopdrachten: 0 };
    const gezien = new Set<string>();
    const meld = () => opts.onProgress?.({ ...stand });
    let kosten = leegKosten();
    const reken = (u: Antwoord['usage']) => {
      kosten = telOp(kosten, u, this.model);
      opts.onKosten?.(kosten);
    };

    let tekst = await this.beurt(messages, stand, gezien, meld, reken, true);
    let uitkomst = leesLes(tekst);
    if (!uitkomst.les) {
      // Eén herkansing: het model ziet zijn eigen antwoord terug met wat eraan mankeert.
      messages.push({
        role: 'user',
        content: `Dit antwoord klopt niet met het JSON-schema:\n${uitkomst.fouten.slice(0, 30).join('\n')}\nGeef het hele JSON-object opnieuw, verbeterd, zonder tekst ervoor of erna. Zoek niet opnieuw.`,
      });
      stand.tekens = 0;
      tekst = await this.beurt(messages, stand, gezien, meld, reken, false);
      uitkomst = leesLes(tekst);
    }
    if (!uitkomst.les) throw new Error(`Het model gaf geen bruikbare les terug: ${uitkomst.fouten.slice(0, 3).join('; ')}`);
    const les = uitkomst.les;
    // Alleen bronnen die het model echt gezien heeft. Een adres uit het geheugen is niet na te gaan.
    les.bronnen = les.bronnen.filter((b) => gezien.has(normUrl(b.url)));
    return les;
  }

  /**
   * Eén beurt van het model, inclusief vervolgen na een pauze. Voegt het antwoord toe aan
   * `messages` en geeft de tekst terug die na het laatste zoekwerk geschreven is.
   */
  private async beurt(
    messages: Anthropic.Beta.BetaMessageParam[],
    stand: Voortgang,
    gezien: Set<string>,
    meld: () => void,
    reken: (u: Antwoord['usage']) => void,
    zoeken: boolean,
  ): Promise<string> {
    const blokken: Anthropic.Beta.BetaContentBlock[] = [];
    for (let vervolg = 0; ; vervolg++) {
      const stream = this.client.beta.messages.stream({
        model: this.model,
        max_tokens: MAX_TOKENS,
        thinking: { type: 'adaptive' },
        system: SYSTEEMPROMPT,
        messages: [...messages],
        // De lange systeemprompt en het gesprek tot nu toe komen uit de cache bij een vervolg of herkansing.
        cache_control: { type: 'ephemeral' },
        // Het lesschema is te groot voor de strikte JSON-modus van de API. Het schema staat in de
        // prompt en leesLes controleert het antwoord.
        output_config: { effort: this.effort },
        ...(this.onderzoek ? { tools: [...ONDERZOEK_TOOLS], tool_choice: { type: zoeken ? 'auto' : 'none' } } : {}),
        // Weigert een veiligheidsfilter de tekst, dan probeert de API het zelf op het aanbevolen vervangende model.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      } as StreamParams);
      stream.on('text', (delta) => {
        stand.tekens += delta.length;
        meld();
      });
      stream.on('streamEvent', (e) => {
        if (e.type === 'content_block_start' && e.content_block?.type === 'server_tool_use') {
          stand.zoekopdrachten++;
          meld();
        }
      });
      const msg = await stream.finalMessage();
      reken(msg.usage);

      if (msg.stop_reason === 'refusal') {
        const cat = msg.stop_details?.category;
        throw new Error(`Het model weigerde van deze tekst een les te maken${cat ? ` (categorie ${cat})` : ''}.`);
      }
      if (msg.stop_reason === 'max_tokens') throw new Error('De les werd te lang en is afgebroken (max_tokens).');
      for (const url of geziene(msg.content)) gezien.add(url);
      blokken.push(...msg.content);
      // Het antwoord gaat ongewijzigd terug in het gesprek, denkblokken en zoekresultaten incluis.
      messages.push({ role: 'assistant', content: msg.content as Anthropic.Beta.BetaContentBlockParam[] });
      if (msg.stop_reason !== 'pause_turn') break;
      if (vervolg >= MAX_VERVOLG) throw new Error('Het onderzoek bleef maar doorgaan. Probeer het nog eens.');
    }
    return tekstNaOnderzoek(blokken);
  }
}

/** De tekst na het laatste zoekresultaat. Wat het model tussendoor zegt ("ik zoek even…") telt niet mee. */
export function tekstNaOnderzoek(blokken: { type: string; text?: string }[]): string {
  let start = 0;
  blokken.forEach((b, i) => {
    if (b.type.endsWith('_tool_result') || b.type === 'server_tool_use') start = i + 1;
  });
  return blokken
    .slice(start)
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('');
}

/** Adressen van pagina's die in zoekresultaten stonden of die het model geopend heeft. */
export function geziene(blokken: unknown[]): string[] {
  const uit: string[] = [];
  for (const b of blokken as { type: string; content?: unknown }[]) {
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
      for (const r of b.content as { url?: string }[]) if (r.url) uit.push(normUrl(r.url));
    }
    if (b.type === 'web_fetch_tool_result') {
      const url = (b.content as { url?: string } | undefined)?.url;
      if (url) uit.push(normUrl(url));
    }
  }
  return uit;
}

export function normUrl(u: string): string {
  return u.trim().replace(/#.*$/, '').replace(/\/+$/, '').replace(/^http:/, 'https:');
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
        throw new Error('Vul eerst je Claude-sleutel in bij Instellingen.');
      },
    },
  },
};
