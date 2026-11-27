import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { ClaudeLessonGenerator, type LesCache, type MessagesLike } from '../src/lesson/generator.js';
import { DEFAULT_EFFORT, isEffort } from '../src/lesson/instellingen.js';
import type { Les } from '../src/lesson/schema.js';
import { LES_SCHEMA, validateLes } from '../src/lesson/schema.js';
import { SYSTEEMPROMPT, gebruikersprompt } from '../src/lesson/prompt.js';
import { bedrag, leegKosten, telOp, type Kosten } from '../src/lesson/kosten.js';
import { schemaFouten } from './helpers.js';

const fixture = readFileSync(new URL('./fixtures/les.json', import.meta.url), 'utf8');
const track = { title: 'Das Wandern', artist: 'Wilhelm Müller' };
const lyrics = { text: 'Das Wandern ist des Müllers Lust', partial: true, source: 'musixmatch' };

interface Nep {
  text?: string;
  stop_reason?: string;
  stop_details?: unknown;
  /** De stukjes waarin de tekst binnenkomt. */
  stukken?: string[];
  /** Blokken voor de tekst, zoals zoekwerk. */
  voor?: Record<string, unknown>[];
}

function fakeClient(...antwoorden: Nep[]) {
  if (!antwoorden.length) antwoorden = [{}];
  let n = 0;
  const stream = vi.fn((_params: unknown) => {
    const { text = fixture, stop_reason = 'end_turn', stop_details = null, stukken = [text], voor = [] } = antwoorden[Math.min(n++, antwoorden.length - 1)];
    const luisteraars: ((delta: string) => void)[] = [];
    const gebeurtenissen: ((e: unknown) => void)[] = [];
    return {
      on: (event: string, l: (x: any) => void) => (event === 'text' ? luisteraars : gebeurtenissen).push(l),
      finalMessage: async () => {
        for (const b of voor) gebeurtenissen.forEach((l) => l({ type: 'content_block_start', content_block: b }));
        for (const s of stukken) luisteraars.forEach((l) => l(s));
        // Het model denkt altijd eerst na; dat blok hoort niet bij de les.
        const content = [{ type: 'thinking', thinking: '' }, ...voor, ...(text ? [{ type: 'text', text }] : [])];
        return { content, stop_reason, stop_details } as never;
      },
    };
  });
  return { client: { beta: { messages: { stream } } } as unknown as MessagesLike, stream };
}
/** Zoals Supabase in de app: eerder gemaakte lessen op sleutel. */
function geheugen(): LesCache & { m: Map<string, Les> } {
  const m = new Map<string, Les>();
  return { m, get: async (k) => m.get(k), set: async (k, les) => void m.set(k, les) };
}
const params = (stream: ReturnType<typeof fakeClient>['stream']) => (stream.mock.calls[0] as unknown[])[0] as Record<string, any>;
const maak = (client: MessagesLike, extra: object = {}) => new ClaudeLessonGenerator({ apiKey: '', model: 'claude-test', client, ...extra });

describe('ClaudeLessonGenerator', () => {
  it('vraagt gestructureerde JSON met het lesschema en het ingestelde model', async () => {
    const { client, stream } = fakeClient();
    const les = await maak(client).generate(track, lyrics);
    expect(les.titel).toBe('Wandern is wandelen met bepakking');
    const p = params(stream);
    expect(p.model).toBe('claude-test');
    // Het lesschema is te groot voor de strikte JSON-modus; het staat in de prompt.
    expect(p.output_config).toEqual({ effort: 'medium' });
    // De lange prompt gaat in de cache, zodat een vervolg of herkansing weinig kost.
    expect(p.cache_control).toEqual({ type: 'ephemeral' });
    expect(p.system).toContain(JSON.stringify(LES_SCHEMA));
    expect(p.system).toBe(SYSTEEMPROMPT);
    expect(p.messages[0].content).toContain('maar een deel van de tekst');
  });

  it('laat ruimte voor denkwerk en zet de terugval bij een weigering aan', async () => {
    const { client, stream } = fakeClient();
    await maak(client, { effort: 'xhigh' }).generate(track, lyrics);
    const p = params(stream);
    expect(p.output_config.effort).toBe('xhigh');
    expect(p.thinking).toEqual({ type: 'adaptive' });
    expect(p.max_tokens).toBeGreaterThanOrEqual(64000);
    expect(p.fallbacks).toBe('default');
    expect(p.betas).toContain('server-side-fallback-2026-07-01');
  });

  it('gebruikt de cache voor dezelfde tekst en dezelfde instellingen', async () => {
    const cache = geheugen();
    const { client, stream } = fakeClient();
    const g = maak(client, { cache });
    await g.generate(track, lyrics);
    await g.generate(track, lyrics);
    expect(stream).toHaveBeenCalledTimes(1);
    await g.generate(track, { ...lyrics, text: 'andere tekst' });
    expect(stream).toHaveBeenCalledTimes(2);
    await maak(client, { cache, effort: 'low' }).generate(track, lyrics);
    expect(stream).toHaveBeenCalledTimes(3);
  });

  it('meldt hoeveel van de les al geschreven is', async () => {
    const { client } = fakeClient({ stukken: [fixture.slice(0, 100), fixture.slice(100)] });
    const gezien: number[] = [];
    await maak(client).generate(track, lyrics, { onProgress: (v) => gezien.push(v.tekens) });
    expect(gezien).toEqual([100, fixture.length]);
  });

  it('gooit bij een afgebroken antwoord', async () => {
    const { client } = fakeClient({ text: '{', stop_reason: 'max_tokens' });
    await expect(maak(client).generate(track, lyrics)).rejects.toThrow(/max_tokens/);
  });

  it('haalt de les ook uit een codeblok met een zin ervoor', async () => {
    const { client, stream } = fakeClient({ text: 'Hier is je les:\n```json\n' + fixture + '\n```' });
    expect((await maak(client).generate(track, lyrics)).titel).toBe('Wandern is wandelen met bepakking');
    expect(stream).toHaveBeenCalledTimes(1);
  });

  it('geeft het model één herkansing met de fouten erbij', async () => {
    const kapot = JSON.parse(fixture);
    delete kapot.cultuur;
    kapot.woordenlijst[0].gebruik = 3;
    const { client, stream } = fakeClient({ text: JSON.stringify(kapot) }, {});
    const les = await maak(client).generate(track, lyrics);
    expect(les.cultuur).toHaveLength(2);
    expect(stream).toHaveBeenCalledTimes(2);
    const tweede = (stream.mock.calls[1] as unknown[])[0] as Record<string, any>;
    expect(tweede.messages).toHaveLength(3);
    expect(tweede.messages[1].role).toBe('assistant');
    // Het denkblok gaat ongewijzigd mee terug.
    expect(tweede.messages[1].content[0].type).toBe('thinking');
    expect(tweede.messages[2].content).toContain('$.cultuur: ontbreekt');
    expect(tweede.messages[2].content).toContain('$.woordenlijst[0].gebruik: geen tekst');
  });

  it('doet onderzoek op het web met de servertools van Anthropic', async () => {
    const { client, stream } = fakeClient();
    await maak(client).generate(track, lyrics);
    const p = params(stream);
    // Alleen zoeken, met een plafond: hele pagina's openen maakte een les vele malen duurder.
    expect(p.tools).toEqual([{ type: 'web_search_20260209', name: 'web_search', max_uses: 4 }]);
    expect(p.tool_choice).toEqual({ type: 'auto' });
    expect(p.messages[0].content).toContain('Je kunt het web doorzoeken');
  });

  it('zoekt niet als onderzoek uit staat, en laat de bronnen dan leeg', async () => {
    const { client, stream } = fakeClient();
    const les = await maak(client, { onderzoek: false }).generate(track, lyrics);
    expect(params(stream).tools).toBeUndefined();
    expect(params(stream).messages[0].content).toContain('niet zoeken');
    expect(les.bronnen).toEqual([]);
  });

  it('houdt alleen bronnen die het model echt gezien heeft en telt het zoekwerk', async () => {
    const zoek = { type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'Das Wandern Müller' } };
    const uitslag = {
      type: 'web_search_tool_result',
      tool_use_id: 's1',
      content: [{ type: 'web_search_result', url: 'https://de.wikipedia.org/wiki/Das_Wandern/', title: 'Das Wandern', encrypted_content: 'x', page_age: null }],
    };
    const les = JSON.parse(fixture);
    les.bronnen.push({ titel: 'Verzonnen', url: 'https://nergens.example/interview' });
    const gezien: number[] = [];
    const { client } = fakeClient({ voor: [zoek, uitslag], text: JSON.stringify(les) });
    const uit = await maak(client).generate(track, lyrics, { onProgress: (v) => gezien.push(v.zoekopdrachten) });
    expect(uit.bronnen).toEqual([{ titel: 'Das Wandern', url: 'https://de.wikipedia.org/wiki/Das_Wandern' }]);
    expect(Math.max(...gezien)).toBe(1);
  });

  it('gaat door na een pauze in het onderzoek en leest alleen de tekst erna', async () => {
    const zoek = { type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'x' } };
    const { client, stream } = fakeClient(
      { voor: [zoek], text: 'Ik zoek even {verder}.', stop_reason: 'pause_turn' },
      { voor: [{ type: 'web_search_tool_result', tool_use_id: 's1', content: [] }] },
    );
    const les = await maak(client).generate(track, lyrics);
    expect(les.titel).toBe('Wandern is wandelen met bepakking');
    expect(stream).toHaveBeenCalledTimes(2);
    const tweede = (stream.mock.calls[1] as unknown[])[0] as Record<string, any>;
    expect(tweede.messages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant']);
  });

  it('zoekt niet opnieuw bij de herkansing', async () => {
    const { client, stream } = fakeClient({ text: '{"titel": 1}' }, {});
    await maak(client).generate(track, lyrics);
    const tweede = (stream.mock.calls[1] as unknown[])[0] as Record<string, any>;
    expect(tweede.tool_choice).toEqual({ type: 'none' });
    expect(tweede.messages.at(-1).content).toContain('Zoek niet opnieuw');
  });

  it('telt de kosten op over alle aanroepen, ook de herkansing', async () => {
    const usage = { input_tokens: 1000, output_tokens: 20000, cache_read_input_tokens: 0, cache_creation_input_tokens: 4000, server_tool_use: { web_search_requests: 2 } };
    const fc = fakeClient({ text: '{"titel": 1}' }, {});
    const stream = fc.stream;
    const echte = stream.getMockImplementation()!;
    stream.mockImplementation(((p: unknown) => {
      const s = echte(p) as { on: unknown; finalMessage: () => Promise<object> };
      const eind = s.finalMessage;
      return { ...s, finalMessage: async () => ({ ...(await eind()), usage }) };
    }) as never);
    const gezien: Kosten[] = [];
    await maak(fc.client, { model: 'claude-opus-5-5' }).generate(track, lyrics, { onKosten: (k) => gezien.push(k) });
    const k = gezien.at(-1)!;
    expect(gezien).toHaveLength(2);
    expect(k).toMatchObject({ invoer: 2000, uitvoer: 40000, cacheSchrijven: 8000, zoekopdrachten: 4, uitCache: false });
    // 2000 x $4 + 40000 x $20 + 8000 x $5 per miljoen, plus vier zoekopdrachten van een cent.
    expect(k.dollar).toBeCloseTo(0.008 + 0.8 + 0.04 + 0.04, 6);
    expect(bedrag(k)).toBe('ongeveer $0.89');
  });

  it('meldt een les uit de cache als gratis', async () => {
    const cache = geheugen();
    const { client } = fakeClient();
    await maak(client, { cache }).generate(track, lyrics);
    const gezien: Kosten[] = [];
    await maak(client, { cache }).generate(track, lyrics, { onKosten: (k) => gezien.push(k) });
    expect(gezien).toEqual([{ invoer: 0, cacheLezen: 0, cacheSchrijven: 0, uitvoer: 0, zoekopdrachten: 0, dollar: 0, uitCache: true }]);
    expect(bedrag(gezien[0])).toBe('uit de cache, gratis');
  });

  it('noemt tokens in plaats van dollars bij een model zonder bekende prijs', () => {
    const k = telOp(leegKosten(), { input_tokens: 12000, output_tokens: 3000 }, 'claude-onbekend');
    expect(k.dollar).toBeNull();
    expect(bedrag(k)).toBe('12k tokens in, 3k uit');
  });

  it('geeft op na de herkansing en zegt waarom', async () => {
    const { client, stream } = fakeClient({ text: 'Hier is je les:' });
    await expect(maak(client).generate(track, lyrics)).rejects.toThrow('geen bruikbare les terug: Het model gaf geen JSON terug.');
    expect(stream).toHaveBeenCalledTimes(2);
  });

  it('stoort zich niet aan een veld dat het schema niet kent', async () => {
    const { client, stream } = fakeClient({ text: JSON.stringify({ ...JSON.parse(fixture), extra: 1 }) });
    await maak(client).generate(track, lyrics);
    expect(stream).toHaveBeenCalledTimes(1);
  });

  it('meldt een weigering met de categorie en leest de inhoud dan niet', async () => {
    const { client } = fakeClient({ text: '', stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'bio' } });
    await expect(maak(client).generate(track, lyrics)).rejects.toThrow(/weigerde.*bio/);
    const zonder = fakeClient({ text: '', stop_reason: 'refusal' });
    await expect(maak(zonder.client).generate(track, lyrics)).rejects.toThrow(/weigerde/);
  });

  it('bewaart een mislukte les niet in de cache', async () => {
    const cache = geheugen();
    const mis = fakeClient({ text: '', stop_reason: 'refusal' });
    await expect(maak(mis.client, { cache }).generate(track, lyrics)).rejects.toThrow();
    const goed = fakeClient();
    await maak(goed.client, { cache }).generate(track, lyrics);
    expect(goed.stream).toHaveBeenCalledTimes(1);
  });

  it('meldt een ontbrekende API-sleutel', async () => {
    await expect(new ClaudeLessonGenerator({ apiKey: '', model: 'm' }).generate(track, lyrics)).rejects.toThrow(/Claude-sleutel/);
  });
});

describe('prompt en schema', () => {
  it('bevat de stijlregels', () => {
    for (const s of ['misschien', 'wellicht', 'gedachtestreepjes', 'niet X maar Y', 'onzeker', 'Wat een Duitser erbij hoort']) {
      expect(SYSTEEMPROMPT).toContain(s);
    }
  });

  it('vraagt niet meer om een inleiding, een verhaal of een decodeerapparaat', () => {
    const inSchema = JSON.stringify(LES_SCHEMA);
    for (const weg of ['"lead"', '"verhaal"', '"decoder"', '"klankverschuivingen"']) expect(inSchema).not.toContain(weg);
    expect(SYSTEEMPROMPT).toContain('Een inleiding of een algemene achtergrond heeft hij niet nodig.');
  });

  it('vraagt om cultuur, gebruik en herkomst, met de veldnamen uit het schema', () => {
    const velden = ['cultuur', 'aanleiding', 'kapstok', 'woorden', 'vraag', 'duiding', 'bronnen', 'gebruik', 'noot', 'etymologie', 'herkomst'];
    const inSchema = JSON.stringify(LES_SCHEMA);
    for (const v of velden) {
      expect(SYSTEEMPROMPT).toContain(`"${v}"`);
      expect(inSchema).toContain(`"${v}"`);
    }
  });

  it('legt uit dat de les één verhaal is dat couplet voor couplet loopt', () => {
    expect(SYSTEEMPROMPT).toContain('De les is één verhaal: het lied zelf');
    expect(SYSTEEMPROMPT).toContain('"inleiding"');
    expect(JSON.stringify(LES_SCHEMA)).toContain('"inleiding"');
    expect(SYSTEEMPROMPT).toContain('verdeel de stukken over de coupletten');
  });

  it('vraagt om een gewone, menselijke toon zonder oneliners', () => {
    expect(SYSTEEMPROMPT).toContain('Geen oneliners of slogans.');
    expect(SYSTEEMPROMPT).toContain('Sluit een stuk niet af met een zin die het voorgaande samenvat');
    expect(SYSTEEMPROMPT).toContain('"kapstok" is één gewone zin, geen slogan');
  });

  it('houdt zich in de prompt zelf aan de stijlregels', () => {
    expect(SYSTEEMPROMPT).not.toMatch(/[—–]/);
    // De verboden woorden staan er precies één keer in: in de regel die ze verbiedt.
    expect(SYSTEEMPROMPT.match(/misschien|wellicht/g)).toHaveLength(2);
  });

  it('geeft album en jaar van Spotify mee als houvast', () => {
    const p = gebruikersprompt({ ...track, album: 'Die schöne Müllerin', releaseDate: '1823-01-01' }, { ...lyrics, partial: false });
    expect(p).toContain('Album: Die schöne Müllerin');
    expect(p).toContain('1823-01-01');
    expect(p).toContain('heruitgave');
    expect(p).not.toContain('maar een deel');
    expect(gebruikersprompt(track, lyrics)).not.toContain('Album');
  });

  it('schema is strikt: elk object heeft alle velden verplicht', () => {
    const check = (n: any): void => {
      if (n?.type === 'object') {
        expect(n.additionalProperties).toBe(false);
        expect([...n.required].sort()).toEqual(Object.keys(n.properties).sort());
        Object.values(n.properties).forEach(check);
      }
      if (n?.type === 'array') check(n.items);
    };
    check(LES_SCHEMA);
  });

  it('de testles past op het schema', () => {
    expect(schemaFouten(LES_SCHEMA, JSON.parse(fixture))).toEqual([]);
  });
});

describe('validateLes', () => {
  it('maakt van een woord met een onbekende sleutel weer gewone tekst', () => {
    const l = JSON.parse(fixture);
    l.strofen[0].regels[0].woorden[0].sleutel = 'bestaatniet';
    const les = validateLes(l);
    expect(les.strofen[0].regels[0].woorden.map((w) => w.sleutel)).toEqual(['mueller', 'lust']);
  });

  it('laat een toetsvraag zonder geldig antwoord vallen', () => {
    const l = JSON.parse(fixture);
    l.toets.push({ ...l.toets[0], goed: 9 });
    expect(validateLes(l).toets).toHaveLength(1);
  });

  it('gooit als een onderdeel ontbreekt', () => {
    const l = JSON.parse(fixture);
    delete l.cultuur;
    expect(() => validateLes(l)).toThrow(/cultuur/);
    const zonder = JSON.parse(fixture);
    zonder.strofen = [];
    expect(() => validateLes(zonder)).toThrow(/geen regels/);
    expect(() => validateLes(null)).toThrow(/geen object/);
  });
});

describe('instellingen', () => {
  it('denkt standaard gemiddeld na en kent alleen de bekende niveaus', () => {
    expect(DEFAULT_EFFORT).toBe('medium');
    expect(isEffort('low')).toBe(true);
    expect(isEffort('turbo')).toBe(false);
  });
});
