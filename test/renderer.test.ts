import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderLesson, regelHtml } from '../src/render/renderer.js';
import { validateLes, type Les } from '../src/lesson/schema.js';

const les = validateLes(JSON.parse(readFileSync(new URL('./fixtures/les.json', import.meta.url), 'utf8'))) as Les;
const meta = {
  id: 'mueller-das-wandern-abc123',
  track: { title: 'Das Wandern', artist: 'Wilhelm Müller', spotifyUrl: 'https://open.spotify.com/track/x' },
  lyricsSource: 'handmatig',
  partial: true,
  model: 'claude-opus-5-5',
  generatedAt: '2026-11-16T12:00:00.000Z',
};
const html = renderLesson(les, meta);

function lesdata(h: string) {
  const m = /<script type="application\/json" id="lesdata">([\s\S]*?)<\/script>/.exec(h);
  return JSON.parse(m![1]);
}

describe('regelHtml', () => {
  it('maakt genoemde woorden klikbaar en houdt leestekens vast', () => {
    const r = regelHtml(les.strofen[0].regels[0]);
    expect(r).toContain('<button class="w" type="button" data-k="wandern" aria-pressed="false">Wandern</button>');
    expect(r).toContain('<span class="nb"><button class="w" type="button" data-k="lust" aria-pressed="false">Lust</button>,</span>');
    expect(r.startsWith('Das ')).toBe(true);
  });
  it('escapet tekst en slaat woorden over die niet in de regel staan', () => {
    const r = regelHtml(les.strofen[0].regels[1]);
    expect(r).toContain('&lt;b&gt;');
    expect(r).not.toContain('nergens');
    expect(r).toContain("wir&#39;s");
  });
});

describe('renderLesson', () => {
  it('is een zelfstandig HTML-document met stijl en script inline', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('--accent:#B6531B');
    expect(html).toContain("'taalstof-' + D.id + '-kaarten'");
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).toContain('<title>Wandern is wandelen met bepakking</title>');
  });

  it('bevat alle onderdelen van de les', () => {
    for (const id of ['doelen', 'tekst', 'klank', 'verhalen', 'grammatica', 'kaarten', 'toets', 'bron']) {
      expect(html).toContain(`<section id="${id}">`);
    }
    expect(html).not.toContain('<section id="vrienden">');
    expect(html).toContain('data-start="wandern"');
    expect(html).toContain('0 van 2 gedecodeerd');
    expect(html).toContain('0 van 1 gekend');
    expect(html.match(/class="opt"/g)).toHaveLength(4);
    expect(html).toContain('data-ok="1">zin</button>');
    expect(html).toContain('Onvolledige tekst');
    expect(html).toContain('Herkomst onzeker');
    expect(html).toContain('https://open.spotify.com/track/x');
  });

  it('levert lesdata in de vorm die het script verwacht', () => {
    const d = lesdata(html);
    expect(d.id).toBe(meta.id);
    expect(d.lex.wasser).toEqual({
      w: 'das Wasser', nl: 'het water', fam: 'NL water · EN water', chips: [['k', 't → ss']],
      txt: 'Na een klinker wordt de t een ss. Familie van Grieks hydor.',
    });
    expect(d.lex.lust.chips).toContainEqual(['o', 'herkomst onzeker']);
    expect(d.lex.mueller.chips).toEqual([['l', 'Latijn'], ['g', 'tweede naamval']]);
    expect(d.decoder[0].woorden[0].stappen).toEqual([['t → ss', 'wasser']]);
    expect(d.kaarten[0]).toMatchObject({ v: 'das Wasser', b: 'het water', regel: 't → ss' });
  });

  it('voorkomt dat lesdata het script-element afsluit', () => {
    const boos = structuredClone(les);
    boos.kaarten[0].tekst = '</script><script>alert(1)</script>';
    const h = renderLesson(boos, meta);
    expect(lesdata(h).kaarten[0].txt).toBe('</script><script>alert(1)</script>');
    expect(h.match(/<\/script>/g)).toHaveLength(2);
  });

  it('toont valse vrienden als die er zijn', () => {
    const met = { ...les, valseVrienden: [{ duits: 'bellen', lijktOp: 'bellen', betekent: 'blaffen', toelichting: 'De hond belt.' }] };
    expect(renderLesson(met, meta)).toContain('<section id="vrienden">');
  });
});
