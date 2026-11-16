import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ClaudeLessonGenerator, type MessagesLike } from '../src/lesson/generator.js';
import { JsonCache } from '../src/cache.js';
import { loadConfig } from '../src/config.js';
import { LES_SCHEMA, validateLes } from '../src/lesson/schema.js';
import { SYSTEEMPROMPT, gebruikersprompt } from '../src/lesson/prompt.js';
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
}

function fakeClient({ text = fixture, stop_reason = 'end_turn', stop_details = null, stukken = [text] }: Nep = {}) {
  const stream = vi.fn(() => {
    const luisteraars: ((delta: string) => void)[] = [];
    return {
      on: (_event: 'text', l: (delta: string) => void) => luisteraars.push(l),
      finalMessage: async () => {
        for (const s of stukken) luisteraars.forEach((l) => l(s));
        // Het model denkt altijd eerst na; dat blok hoort niet bij de les.
        return { content: [{ type: 'thinking', thinking: '' }, { type: 'text', text }], stop_reason, stop_details } as never;
      },
    };
  });
  return { client: { beta: { messages: { stream } } } as unknown as MessagesLike, stream };
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
    expect(p.output_config).toEqual({ effort: 'high', format: { type: 'json_schema', schema: LES_SCHEMA } });
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
    const cache = new JsonCache(mkdtempSync(path.join(tmpdir(), 'taalstof-')));
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

  it('zegt het gewoon als het antwoord geen JSON is', async () => {
    const { client } = fakeClient({ text: 'Hier is je les:' });
    await expect(maak(client).generate(track, lyrics)).rejects.toThrow('Het model gaf geen geldige JSON terug.');
  });

  it('meldt een weigering met de categorie en leest de inhoud dan niet', async () => {
    const { client } = fakeClient({ text: '', stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'bio' } });
    await expect(maak(client).generate(track, lyrics)).rejects.toThrow(/weigerde.*bio/);
    const zonder = fakeClient({ text: '', stop_reason: 'refusal' });
    await expect(maak(zonder.client).generate(track, lyrics)).rejects.toThrow(/weigerde/);
  });

  it('bewaart een mislukte les niet in de cache', async () => {
    const cache = new JsonCache(mkdtempSync(path.join(tmpdir(), 'taalstof-')));
    const mis = fakeClient({ text: '', stop_reason: 'refusal' });
    await expect(maak(mis.client, { cache }).generate(track, lyrics)).rejects.toThrow();
    const goed = fakeClient();
    await maak(goed.client, { cache }).generate(track, lyrics);
    expect(goed.stream).toHaveBeenCalledTimes(1);
  });

  it('meldt een ontbrekende API-sleutel', async () => {
    await expect(new ClaudeLessonGenerator({ apiKey: '', model: 'm' }).generate(track, lyrics)).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });
});

describe('prompt en schema', () => {
  it('bevat de stijlregels', () => {
    for (const s of ['misschien', 'wellicht', 'gedachtestreepjes', 'niet X maar Y', 'onzeker', 'Tweede Klankverschuiving']) {
      expect(SYSTEEMPROMPT).toContain(s);
    }
  });

  it('vraagt om gebruik, herkomst en achtergrond, met de veldnamen uit het schema', () => {
    const velden = ['gebruik', 'noot', 'etymologie', 'herkomst', 'achtergrond', 'cultuur', 'aanleiding', 'kapstok'];
    const inSchema = JSON.stringify(LES_SCHEMA);
    for (const v of velden) {
      expect(SYSTEEMPROMPT).toContain(`"${v}"`);
      expect(inSchema).toContain(`"${v}"`);
    }
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

describe('config', () => {
  it('denkt standaard grondig na en keurt een onbekend niveau af', () => {
    expect(loadConfig({}).anthropicEffort).toBe('high');
    expect(loadConfig({ ANTHROPIC_EFFORT: 'low' }).anthropicEffort).toBe('low');
    expect(() => loadConfig({ ANTHROPIC_EFFORT: 'turbo' })).toThrow(/ANTHROPIC_EFFORT/);
  });
});
