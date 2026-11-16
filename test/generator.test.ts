import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ClaudeLessonGenerator, type MessagesLike } from '../src/lesson/generator.js';
import { JsonCache } from '../src/cache.js';
import { LES_SCHEMA, validateLes } from '../src/lesson/schema.js';
import { SYSTEEMPROMPT } from '../src/lesson/prompt.js';

const fixture = readFileSync(new URL('./fixtures/les.json', import.meta.url), 'utf8');
const track = { title: 'Das Wandern', artist: 'Wilhelm Müller' };
const lyrics = { text: 'Das Wandern ist des Müllers Lust', partial: true, source: 'musixmatch' };

function fakeClient(text = fixture, stop_reason = 'end_turn') {
  const stream = vi.fn(() => ({
    finalMessage: async () => ({ content: [{ type: 'text', text }], stop_reason }) as never,
  }));
  return { client: { messages: { stream } } as unknown as MessagesLike, stream };
}

describe('ClaudeLessonGenerator', () => {
  it('vraagt gestructureerde JSON met het lesschema en het ingestelde model', async () => {
    const { client, stream } = fakeClient();
    const les = await new ClaudeLessonGenerator('', 'claude-test', undefined, client).generate(track, lyrics);
    expect(les.titel).toBe('Wandern is wandelen met bepakking');
    const params = (stream.mock.calls[0] as unknown[])[0] as Record<string, any>;
    expect(params.model).toBe('claude-test');
    expect(params.output_config.format).toEqual({ type: 'json_schema', schema: LES_SCHEMA });
    expect(params.system).toBe(SYSTEEMPROMPT);
    expect(params.messages[0].content).toContain('maar een deel van de tekst');
  });

  it('gebruikt de cache voor dezelfde tekst', async () => {
    const cache = new JsonCache(mkdtempSync(path.join(tmpdir(), 'taalstof-')));
    const { client, stream } = fakeClient();
    const g = new ClaudeLessonGenerator('', 'm', cache, client);
    await g.generate(track, lyrics);
    await g.generate(track, lyrics);
    expect(stream).toHaveBeenCalledTimes(1);
    await g.generate(track, { ...lyrics, text: 'andere tekst' });
    expect(stream).toHaveBeenCalledTimes(2);
  });

  it('gooit bij een afgebroken antwoord', async () => {
    const { client } = fakeClient('{', 'max_tokens');
    await expect(new ClaudeLessonGenerator('', 'm', undefined, client).generate(track, lyrics)).rejects.toThrow(/max_tokens/);
  });

  it('meldt een ontbrekende API-sleutel', async () => {
    await expect(new ClaudeLessonGenerator('', 'm').generate(track, lyrics)).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });
});

describe('prompt en schema', () => {
  it('bevat de stijlregels', () => {
    for (const s of ['misschien', 'wellicht', 'gedachtestreepjes', 'niet X maar Y', 'onzeker', 'Tweede Klankverschuiving']) {
      expect(SYSTEEMPROMPT).toContain(s);
    }
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
  it('validateLes vangt een onbekende sleutel', () => {
    const l = JSON.parse(fixture);
    l.strofen[0].regels[0].woorden[0].sleutel = 'bestaatniet';
    expect(() => validateLes(l)).toThrow(/bestaatniet/);
  });
});
