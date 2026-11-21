import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderLesson, regelHtml, vindWoord, vulHerhalingen } from '../src/render/renderer.js';
import { validateLes, type Les } from '../src/lesson/schema.js';

const les = validateLes(JSON.parse(readFileSync(new URL('./fixtures/les.json', import.meta.url), 'utf8'))) as Les;
const meta = {
  id: 'mueller-das-wandern-abc123',
  track: { title: 'Das Wandern', artist: 'Wilhelm Müller', spotifyUrl: 'https://open.spotify.com/track/x', spotifyId: '4uLU6hMCjMI75M1A2tKUQC' },
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
const regel = (de: string, ...woorden: string[]) => ({ de, nl: '', noot: '', woorden: woorden.map((tekst) => ({ tekst, sleutel: tekst.toLowerCase() })) });

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
  it('pakt een kort woord niet midden in een ander woord', () => {
    const r = regelHtml(regel('Wir sind in einem Haus', 'in'));
    expect(r).toBe('Wir sind <button class="w" type="button" data-k="in" aria-pressed="false">in</button> einem Haus');
    expect(regelHtml(regel('Wir sind hier', 'in'))).toBe('Wir sind hier');
  });
  it('vindt een vaste verbinding en een woord met een ingeslikte klank', () => {
    expect(regelHtml(regel("in der Still', und wie es sich schicket.", 'Still', 'sich schicket'))).toContain('>sich schicket</button>.');
    expect(vindWoord("Ich hab' so'ne Angst", "'ne", 0)).toBe(11);
    expect(vindWoord('Übermut tut selten gut', 'tut', 0)).toBe(8);
  });
});

describe('vulHerhalingen', () => {
  it('geeft een herhaalde regel de woorden en de noot van de eerste keer', () => {
    const s = vulHerhalingen(les.strofen);
    expect(s[1].regels[0].woorden).toEqual(les.strofen[0].regels[0].woorden);
    expect(s[1].regels[0].noot).toBe(les.strofen[0].regels[0].noot);
    expect(les.strofen[1].regels[0].woorden).toEqual([]);
  });
  it('laat een herhaling met eigen woorden met rust', () => {
    const eigen = [{ tekst: 'Lust', sleutel: 'lust' }];
    const s = vulHerhalingen([les.strofen[0], { naam: '', regels: [{ ...les.strofen[0].regels[0], woorden: eigen, noot: '' }] }]);
    expect(s[1].regels[0].woorden).toBe(eigen);
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

  it('bevat alle onderdelen van de les, in de volgorde van het menu', () => {
    const ids = ['tekst', 'cultuur', 'meezingen', 'verhalen', 'grammatica', 'kaarten', 'toets', 'bron'];
    expect([...html.matchAll(/<section id="([a-z]+)">/g)].map((m) => m[1])).toEqual(ids);
    expect([...html.matchAll(/<li><a href="#([a-z]+)">/g)].map((m) => m[1])).toEqual(ids);
    expect(html).toContain('data-start="wandern"');
    expect(html).not.toContain('decoder');
    expect(html).not.toContain('class="lead"');
    expect(html).toContain('0 van 1 gekend');
    // Vier in de toets en vier bij de vraag in de cultuur.
    expect(html.match(/class="opt"/g)).toHaveLength(8);
    expect(html).toContain('data-ok="1">zin</button>');
    expect(html).toContain('Onvolledige tekst');
    expect(html).toContain('Herkomst onzeker');
    expect(html).toContain('https://open.spotify.com/track/x');
  });

  const cultuur = /<section id="cultuur">([\s\S]*?)<\/section>/.exec(html)![1];

  it('zet wat een Duitser erbij hoort direct na de tekst, en zegt wat niet vaststaat', () => {
    expect(cultuur).toContain('Wat een Duitser erbij hoort');
    expect(cultuur.match(/<article class="box beeld cult">/g)).toHaveLength(2);
    expect(cultuur.match(/Niet alles hiervan staat vast/g)).toHaveLength(1);
  });

  it('laat je raden voor je leest, alleen waar een vraag is', () => {
    expect(cultuur.match(/class="raad"/g)).toHaveLength(1);
    expect(cultuur).toContain('<p class="q">Wat betekent wandern hier?</p>');
    expect(cultuur).toContain('data-ok="1">trekken</button>');
    expect(cultuur).toContain('data-t="Een gezel trok van werkplaats naar werkplaats."');
  });

  it('linkt de zinsnede naar de regel in het lied', () => {
    expect(cultuur).toContain('Bij <i lang="de">Das Wandern</i> <a class="naar" href="#r-0-0" data-r="r-0-0">naar de regel</a>');
    expect(cultuur).toContain('href="#r-0-1"');
    expect(html).toContain('<p class="regel" id="r-0-0">');
  });

  it('hangt woorden uit de woordenlijst aan een stuk', () => {
    expect(cultuur).toContain('<button class="hwk" type="button" lang="de" data-k="wandern" aria-pressed="false">wandern</button>');
    expect(cultuur).toContain('data-k="mueller"');
    expect(cultuur).not.toContain('bestaatniet');
    expect(cultuur.match(/class="hw"/g)).toHaveLength(1);
  });

  it('legt per strofe uit waarom hij zo is, achter een knop', () => {
    expect(html).toContain('<button class="btn klein duid" type="button" aria-pressed="false">Waarom deze strofe</button>');
    expect(html).toContain('<p class="duiding" hidden>De molenaar zingt over zijn lust tot trekken.</p>');
    expect(html.match(/class="duiding"/g)).toHaveLength(1);
  });

  it('maakt van de tekst een invuloefening, zonder dubbele regels', () => {
    const mz = /<section id="meezingen">([\s\S]*?)<\/section>/.exec(html)![1];
    const gaten = [...mz.matchAll(/data-a="([^"]+)"/g)].map((m) => m[1]);
    expect(gaten).toEqual(['Wandern', 'Müllers', 'Wasser']);
    expect(mz).toContain('Das <input class="gat"');
    expect(mz).toContain('&lt;b&gt;');
    expect(mz.match(/class="mz-regel"/g)).toHaveLength(2);
    expect(mz).not.toContain('nergens');
  });

  it('noemt de bronnen en wat het leren oplevert bij de toets', () => {
    const bron = /<section id="bron">([\s\S]*?)<\/section>/.exec(html)![1];
    expect(bron).toContain('<a href="https://de.wikipedia.org/wiki/Das_Wandern" rel="noopener noreferrer" target="_blank">Das Wandern</a>');
    const zonder = renderLesson({ ...les, bronnen: [] }, meta);
    expect(zonder).toContain('uit het geheugen');
    const toets = /<section id="toets">([\s\S]*?)<\/section>/.exec(html)![1];
    expect(toets).toContain('<h4>Kun je dit nu?</h4>');
    expect(toets).toContain('<li>Je leest de tweede naamval in des Müllers.</li>');
  });

  it('hangt cultuur aan een plek in de tekst en aan een kapstok', () => {
    const sectie = /<section id="cultuur">([\s\S]*?)<\/section>/.exec(html)![1];
    expect(sectie).toContain('<h4>Op de Walz</h4>');
    expect(sectie).toContain('Bij <i lang="de">Das Wandern</i>');
    expect(sectie).toContain('<h4>Water als leraar</h4>');
    expect(sectie).toContain('<b>Kapstok</b>Wandern is trekken, spazieren is wandelen.');
  });

  it('zet bij grammatica hoe het zo gekomen is', () => {
    expect(html).toContain('<h4>Hoe het zo kwam</h4><p>Het Nederlands bewaart hem in &#39;s avonds.</p>');
  });

  it('geeft een regel met een noot een waarom-knop, ook bij de herhaling', () => {
    const knoppen = html.match(/<button class="rn"[^>]*>waarom\?<\/button>/g)!;
    expect(knoppen).toHaveLength(2);
    expect(knoppen[0]).toContain('data-noot="Des Müllers Lust: de bezitter staat voorop, zoals in &#39;s lands wijs."');
    expect(html.match(/class="w" type="button" data-k="wandern"/g)).toHaveLength(2);
    expect(html).toContain('<i>waarom?</i>');
  });

  it('noemt een strofe bij haar naam', () => {
    expect(html).toContain('<span>Couplet 1</span>');
    expect(html).toContain('<span>Strofe 2</span>');
  });

  it('zet de Spotify-speler boven de tekst als het nummer van Spotify komt', () => {
    expect(html).toContain('src="https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC"');
    const zonder = renderLesson(les, { ...meta, track: { ...meta.track, spotifyId: undefined } });
    expect(zonder).not.toContain('<iframe');
    const raar = renderLesson(les, { ...meta, track: { ...meta.track, spotifyId: 'x"><script>' } });
    expect(raar).not.toContain('<iframe');
  });

  it('levert lesdata in de vorm die het script verwacht', () => {
    const d = lesdata(html);
    expect(d.id).toBe(meta.id);
    expect(d.lex.wasser).toEqual({
      w: 'das Wasser', nl: 'het water', fam: 'NL water · EN water', chips: [['k', 't → ss']],
      geb: 'Na vom staat de derde naamval.', ety: 'Familie van Grieks hydor.',
    });
    expect(d.lex.lust.chips).toEqual([['r', 'dichterlijk'], ['o', 'herkomst onzeker']]);
    expect(d.lex.mueller.chips).toEqual([['l', 'Latijn'], ['g', 'tweede naamval']]);
    expect(d.decoder).toBeUndefined();
    expect(d.kaarten[0]).toMatchObject({ v: 'das Wasser', b: 'het water', regel: 't → ss' });
  });

  it('houdt de vertaling dicht tot je erom vraagt', () => {
    // .regel .nl heeft display:block. Zonder deze regel wint dat van het hidden-attribuut.
    expect(html).toContain('[hidden]{display:none!important}');
    expect(html.match(/<span class="nl" hidden>/g)).toHaveLength(3);
  });

  it('gebruikt in het script de velden die de lesdata levert', () => {
    const js = readFileSync(new URL('../templates/lesson.js', import.meta.url), 'utf8');
    for (const veld of ['e.w', 'e.nl', 'e.fam', 'e.chips', 'e.geb', 'e.ety']) expect(js).toContain(veld);
    expect(js).toContain('dataset.noot');
    for (const klasse of ["'.raad'", "'a.naar'", "'.hw'", "'.mz'", "'.strofe .duid'"]) expect(js).toContain(klasse);
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

  it('laat cultuur weg als het model er niets over wist', () => {
    const kaal = renderLesson({ ...les, cultuur: [] }, meta);
    expect(kaal).not.toContain('<section id="cultuur">');
    expect(kaal).not.toContain('href="#cultuur"');
  });

  it('zegt bij de voorbeeldles eerlijk waar die vandaan komt', () => {
    const v = renderLesson(les, { ...meta, voorbeeld: true });
    expect(v).toContain('voorbeeldles');
    expect(v).not.toContain('auteursrechtelijk beschermd');
    expect(html).toContain('auteursrechtelijk beschermd');
    expect(html).toContain('Gemaakt met claude-opus-5-5 op 2026-11-16.');
    expect(renderLesson(les, { ...meta, bedrag: 'ongeveer $0.89' })).toContain('op 2026-11-16, kosten ongeveer $0.89.');
  });
});
