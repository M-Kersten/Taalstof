import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { LES_SCHEMA, validateLes, type Les } from '../src/lesson/schema.js';
import { renderLesson, vindRegel, vindWoord } from '../src/render/renderer.js';
import { schemaFouten } from './helpers.js';

/**
 * De voorbeeldles is met de hand geschreven en dient als maatstaf voor wat een les
 * moet zijn. Deze tests bewaken dat hij op het schema past en intern klopt.
 */
const rauw = JSON.parse(readFileSync(new URL('../voorbeeld/die-gedanken-sind-frei.json', import.meta.url), 'utf8'));
const les: Les = validateLes(structuredClone(rauw));
const regels = les.strofen.flatMap((s) => s.regels);
const songtekst = regels.map((r) => r.de).join('\n');

function teksten(x: unknown): string[] {
  if (typeof x === 'string') return [x];
  if (Array.isArray(x)) return x.flatMap(teksten);
  if (x && typeof x === 'object') return Object.values(x).flatMap(teksten);
  return [];
}

describe('voorbeeldles', () => {
  it('past precies op het schema dat het model moet volgen', () => {
    expect(schemaFouten(LES_SCHEMA, rauw)).toEqual([]);
  });

  it('verliest niets bij de controle', () => {
    expect(les).toEqual(rauw);
  });

  it('wijst elk woord in de tekst aan, als los woord en in volgorde', () => {
    for (const r of regels) {
      let pos = 0;
      for (const w of r.woorden) {
        const i = vindWoord(r.de, w.tekst, pos);
        expect(i, `"${w.tekst}" in "${r.de}"`).toBeGreaterThanOrEqual(0);
        pos = i + w.tekst.length;
      }
    }
  });

  it('gebruikt elke ingang van de woordenlijst en heeft geen dubbele sleutels', () => {
    const sleutels = les.woordenlijst.map((w) => w.sleutel);
    expect(new Set(sleutels).size).toBe(sleutels.length);
    const gebruikt = new Set(regels.flatMap((r) => r.woorden.map((w) => w.sleutel)));
    expect(sleutels.filter((s) => !gebruikt.has(s))).toEqual([]);
  });

  it('hangt wat een Duitser erbij hoort aan de tekst en aan de woorden', () => {
    const sleutels = new Set(les.woordenlijst.map((w) => w.sleutel));
    expect(les.cultuur.length).toBeGreaterThanOrEqual(4);
    for (const c of les.cultuur) {
      expect(songtekst, c.titel).toContain(c.aanleiding);
      expect(vindRegel(les.strofen, c.aanleiding), c.titel).not.toBe('');
      expect(c.woorden.length, c.titel).toBeGreaterThanOrEqual(1);
      for (const k of c.woorden) expect(sleutels, `${c.titel}: ${k}`).toContain(k);
      if (c.vraag.vraag) expect(c.vraag.opties).toHaveLength(4);
    }
    expect(les.cultuur.filter((c) => c.vraag.vraag).length).toBeGreaterThanOrEqual(2);
    for (const s of les.strofen) expect(s.duiding, s.naam).not.toBe('');
    for (const g of les.grammatica) expect(g.herkomst, g.titel).not.toBe('');
    for (const b of les.bronnen) expect(b.url).toMatch(/^https:\/\//);
  });

  it('heeft een toets met vier opties en een antwoord dat van plek wisselt', () => {
    expect(les.toets).toHaveLength(10);
    for (const t of les.toets) expect(t.opties).toHaveLength(4);
    expect(new Set(les.toets.map((t) => t.goed)).size).toBe(4);
  });

  it('houdt zich aan de stijlregels', () => {
    for (const t of teksten(les)) {
      expect(t).not.toMatch(/misschien|wellicht/i);
      expect(t).not.toMatch(/[—–]/);
    }
  });

  it('zegt het erbij als een herkomst niet vaststaat', () => {
    const onzeker = les.woordenlijst.filter((w) => w.zekerheid === 'onzeker');
    expect(onzeker.length).toBeGreaterThan(0);
    for (const w of onzeker) expect(w.etymologie, w.woord).toMatch(/onzeker|nooit|niemand/);
  });

  it('wordt een complete les', () => {
    const html = renderLesson(les, { id: 'voorbeeld', track: { title: les.lied.titel, artist: les.lied.artiest }, lyricsSource: 'publiek domein', partial: false, model: '', generatedAt: '', voorbeeld: true });
    for (const id of ['tekst', 'cultuur', 'meezingen', 'verhalen', 'grammatica', 'vrienden', 'kaarten', 'toets', 'bron']) {
      expect(html).toContain(`<section id="${id}">`);
    }
    expect(html.match(/class="w"/g)!.length).toBe(regels.reduce((n, r) => n + r.woorden.length, 0));
    expect(html.match(/class="rn"/g)!.length).toBe(regels.filter((r) => r.noot).length);
  });
});
