import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { regelHtml, reisplan, renderLesson, spelVoor, stukkenVan, vindPlek, vindWoord, vulHerhalingen } from '../src/render/renderer.js';
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
/** De HTML van één stap. */
function stap(id: string, h = html): string {
  const m = new RegExp(`<section class="stap" id="stap-${id}"[\\s\\S]*?</section>`).exec(h);
  if (!m) throw new Error(`geen stap ${id}`);
  return m[0];
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
    const s = vulHerhalingen([les.strofen[0], { naam: '', inleiding: '', duiding: '', regels: [{ ...les.strofen[0].regels[0], woorden: eigen, noot: '' }] }]);
    expect(s[1].regels[0].woorden).toBe(eigen);
  });
});

describe('vindPlek', () => {
  it('vindt een hele regel en een stuk van een regel, op woordgrens', () => {
    expect(vindPlek(les.strofen, 'Das Wandern ist des Müllers Lust')).toEqual({ n: 0, i: 0 });
    expect(vindPlek(les.strofen, 'Vom Wasser')).toEqual({ n: 0, i: 1 });
    expect(vindPlek(les.strofen, 'andern')).toBeNull();
    expect(vindPlek(les.strofen, '')).toBeNull();
  });
});

describe('de reis door het lied', () => {
  const haltes = reisplan(les, meta);

  it('loopt het lied couplet voor couplet door en eindigt met meezingen en de toets', () => {
    expect(haltes.map((h) => [h.id, h.soort, h.naam])).toEqual([
      ['h0', 'couplet', 'Couplet 1'],
      ['h1', 'couplet', 'Couplet 2'],
      ['h-mz', 'meezingen', 'Meezingen'],
      ['h-toets', 'toets', 'Toets'],
    ]);
    // Couplet 1 heeft alles; het herhaalde refrein heeft niets nieuws om erachter te zoeken of te oefenen.
    expect(haltes[0].stappen.map((s) => s.naam)).toEqual(['Lezen', 'Erachter', 'Zelf doen']);
    expect(haltes[1].stappen.map((s) => s.naam)).toEqual(['Lezen']);
    expect(haltes[0].label).toBe('Das Wandern ist des Müllers Lust');
  });

  it('opent elk couplet met de inleiding, en anders met een gewone zin', () => {
    expect(haltes[0].stappen[0].verteller).toBe('De molenaar wil op pad.');
    expect(haltes[1].stappen[0].verteller).toBe('Lees het couplet en tik aan wat je niet kent.');
    expect(haltes[0].stappen[1].verteller).toBe('De molenaar zingt over zijn lust tot trekken.');
  });

  it('zegt bij elke stap wat er hierna komt', () => {
    const hierna = haltes.flatMap((h) => h.stappen.map((s) => s.hierna));
    expect(hierna).toEqual([
      '<i>Op de Walz</i>',
      'zelf met dit couplet aan de slag',
      'Couplet 2, <i lang="de">Das Wandern ist des Müllers Lust</i>',
      'het hele lied meezingen',
      'een paar vragen over het hele lied',
      '',
    ]);
  });

  it('hangt elk cultuurstuk aan het couplet waar zijn regel staat, met die regel erboven', () => {
    const erachter = stap('s0-erachter');
    expect(erachter.match(/<article class="box cult">/g)).toHaveLength(2);
    expect(erachter).toContain('<blockquote class="citaat"><p class="de" lang="de">Das Wandern ist des Müllers Lust,</p><p class="nl">Het trekken is de lust van de molenaar,</p></blockquote>');
    expect(erachter).toContain('<h3>Op de Walz</h3>');
    expect(erachter).toContain('<h3>Water als leraar</h3>');
    expect(erachter.match(/Niet alles hiervan staat vast/g)).toHaveLength(1);
    expect(erachter).toContain('<p class="verteller">De molenaar zingt over zijn lust tot trekken.</p>');
  });

  it('laat je raden voor je leest, alleen waar een vraag is', () => {
    const erachter = stap('s0-erachter');
    expect(erachter.match(/class="raad"/g)).toHaveLength(1);
    expect(erachter).toContain('<p class="q">Wat betekent wandern hier?</p>');
    expect(erachter).toContain('data-ok="1">trekken</button>');
  });

  it('hangt woorden uit de woordenlijst aan een cultuurstuk', () => {
    const erachter = stap('s0-erachter');
    expect(erachter).toContain('<button class="hwk" type="button" lang="de" data-k="wandern" aria-pressed="false">wandern</button>');
    expect(erachter).not.toContain('bestaatniet');
    expect(erachter).toContain('<b>Kapstok</b>Wandern is trekken, spazieren is wandelen.');
  });

  it('oefent per couplet met de eigen woorden en regels, en weet welke regel bij een verhaal hoorde', () => {
    const spel = spelVoor(les, 0, new Map([['0-1', 'Water als leraar']]));
    expect(spel.paren).toEqual([
      { de: 'wandern', nl: 'trekken, wandelen' },
      { de: 'der Müller', nl: 'de molenaar' },
      { de: 'die Lust', nl: 'zin, plezier' },
      { de: 'das Wasser', nl: 'het water' },
    ]);
    expect(spel.zinnen).toEqual([
      { nl: 'Het trekken is de lust van de molenaar,', stukken: ['Das', 'Wandern', 'ist', 'des', 'Müllers', 'Lust'], bij: '' },
      { nl: 'Van het water hebben we het geleerd,', stukken: ['Vom', 'Wasser', 'haben', "wir's", 'gelernt', 'b'], bij: 'Water als leraar' },
    ]);
    // Het refrein komt terug: geen regels of woorden die al geoefend zijn.
    expect(spelVoor(les, 1)).toEqual({ paren: [], zinnen: [] });
    expect(stukkenVan('Die Gedanken sind frei!')).toEqual(['Die', 'Gedanken', 'sind', 'frei']);
  });

  it('zet de spellen in de stap Zelf doen en geeft hun gegevens mee', () => {
    const zelf = stap('s0-zelf');
    expect(zelf).toContain('class="app spel-koppel" data-spel="s0-zelf"');
    expect(zelf).toContain('class="app spel-bouw" data-spel="s0-zelf"');
    expect(zelf).toContain('<p class="verteller">Nu zelf. Eerst de woorden van dit couplet, en dan een regel in elkaar zetten.</p>');
    const d = lesdata(html);
    expect(Object.keys(d.spellen)).toEqual(['s0-zelf']);
    expect(d.spellen['s0-zelf'].zinnen[1].bij).toBe('Water als leraar');
  });

  it('wijst bij het couplet op de grammatica die erin zit', () => {
    expect(stap('s0-lezen')).toContain('<button class="btn klein naslag-link" type="button" data-naslag="g-0">Tweede naamval</button>');
    expect(stap('s1-lezen')).not.toContain('naslag-link');
  });

  it('zegt bij een onvolledige tekst iets in het eerste couplet', () => {
    expect(stap('s0-lezen')).toContain('Onvolledige tekst');
    expect(renderLesson(les, { ...meta, partial: false })).not.toContain('Onvolledige tekst');
  });

  it('geeft een regel met een noot een waarom-knop, ook bij de herhaling', () => {
    const knoppen = html.match(/<button class="rn"[^>]*>waarom\?<\/button>/g)!;
    expect(knoppen).toHaveLength(2);
    expect(knoppen[0]).toContain('data-noot="Des Müllers Lust: de bezitter staat voorop, zoals in &#39;s lands wijs."');
  });

  it('eindigt met meezingen en de toets, met de leerdoelen erbij', () => {
    expect(stap('meezingen')).toContain('class="app mz"');
    expect(stap('meezingen')).toContain('De speler staat bij het overzicht.');
    const toets = stap('toets');
    expect(toets).toContain('<h4>Kun je dit nu?</h4>');
    expect(toets).toContain('<li>Je leest de tweede naamval in des Müllers.</li>');
    expect(toets).toContain('data-naar="overzicht">Klaar</button>');
    expect(toets).toContain('Dit was de laatste stap.');
  });
});

describe('renderLesson', () => {
  it('is een zelfstandig HTML-document met stijl en script inline', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('--accent:#1F7A6E');
    expect(html).toContain('family=Cormorant+Garamond');
    expect(html).toContain("sleutel + 'kaarten'");
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).toContain('<title>Das Wandern · Taalstof</title>');
    expect(html).toContain('<h1>Das Wandern</h1>');
  });

  it('toont één stap tegelijk, in de volgorde van de reis', () => {
    const ids = [...html.matchAll(/<section class="stap" id="stap-([a-z0-9-]+)"[^>]*?( hidden)?>/g)].map((m) => [m[1], !!m[2]]);
    expect(ids).toEqual([
      ['s0-lezen', false],
      ['s0-erachter', true],
      ['s0-zelf', true],
      ['s1-lezen', true],
      ['meezingen', true],
      ['toets', true],
    ]);
    expect(stap('s0-lezen')).toContain('data-naar="s0-erachter">Verder</button>');
    expect(stap('s0-zelf')).toContain('data-naar="s1-lezen">Verder</button>');
  });

  it('zet het pad in het overzicht, met per halte zijn stappen', () => {
    const pad = /<ol class="pad">([\s\S]*?)<\/ol>\n  <button/.exec(html)![1];
    expect(pad.match(/<li class="halte"/g)).toHaveLength(4);
    expect(pad).toContain('data-halte="h0" style="--dx:0px"');
    expect(pad).toContain('data-halte="h1" style="--dx:52px"');
    expect(pad).toContain('<span class="t" lang="de">Das Wandern ist des Müllers Lust</span><small>Couplet 1</small>');
    expect(pad).toContain('<a href="#s0-erachter" data-stap="s0-erachter">Erachter</a>');
    expect(pad).toContain('<span class="t">Meezingen</span><small>Het hele lied</small>');
  });

  it('zet de Spotify-speler in het overzicht als het nummer van Spotify komt', () => {
    expect(html).toContain('src="https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC"');
    expect(renderLesson(les, { ...meta, track: { ...meta.track, spotifyId: undefined } })).not.toContain('<iframe');
    expect(renderLesson(les, { ...meta, track: { ...meta.track, spotifyId: 'x"><script>' } })).not.toContain('<iframe');
  });

  it('bergt woordverhalen, grammatica en kaarten op in de naslag', () => {
    const naslag = /<aside class="naslag"[\s\S]*?<\/aside>/.exec(html)![0];
    expect([...naslag.matchAll(/<section class="naslag-deel" id="([a-z-]+)">/g)].map((m) => m[1])).toEqual(['n-kaarten', 'n-verhalen', 'n-grammatica', 'n-bron']);
    expect(naslag).toContain('<div class="gram-item" id="g-0">');
    expect(naslag).toContain('<h4>Hoe het zo kwam</h4><p>Het Nederlands bewaart hem in &#39;s avonds.</p>');
    expect(naslag).toContain('0 van 1 gekend');
    expect(naslag).toContain('<a href="https://de.wikipedia.org/wiki/Das_Wandern" rel="noopener noreferrer" target="_blank">Das Wandern</a>');
    const met = renderLesson({ ...les, valseVrienden: [{ duits: 'bellen', lijktOp: 'bellen', betekent: 'blaffen', toelichting: 'De hond belt.' }] }, meta);
    expect(met).toContain('id="n-vrienden"');
    expect(met).toContain('<b lang="de">bellen</b> lijkt op bellen. Het betekent <b>blaffen</b>.');
  });

  it('levert lesdata in de vorm die het script verwacht', () => {
    const d = lesdata(html);
    expect(d.id).toBe(meta.id);
    expect(d.lex.wasser).toEqual({
      w: 'das Wasser', nl: 'het water', fam: 'NL water · EN water', chips: [['k', 't → ss']],
      geb: 'Na vom staat de derde naamval.', ety: 'Familie van Grieks hydor.',
    });
    expect(d.lex.lust.chips).toEqual([['r', 'dichterlijk'], ['o', 'herkomst onzeker']]);
    expect(d.kaarten[0]).toMatchObject({ v: 'das Wasser', b: 'het water', regel: 't → ss' });
    expect(d.haltes[0]).toEqual({
      id: 'h0', soort: 'couplet', naam: 'Couplet 1', label: 'Das Wandern ist des Müllers Lust', inleiding: 'De molenaar wil op pad.',
      woorden: ['wandern', 'der Müller', 'die Lust', 'das Wasser'],
      stappen: [{ id: 's0-lezen', naam: 'Lezen' }, { id: 's0-erachter', naam: 'Erachter' }, { id: 's0-zelf', naam: 'Zelf doen' }],
    });
  });

  it('gebruikt in het script de velden en namen die de pagina levert', () => {
    const js = readFileSync(new URL('../templates/lesson.js', import.meta.url), 'utf8');
    for (const veld of ['e.w', 'e.nl', 'e.fam', 'e.chips', 'e.geb', 'e.ety', 'D.haltes', 'D.spellen', 'dataset.noot', "'stap-' + x.id"]) expect(js).toContain(veld);
    for (const klasse of ["'.raad'", "'.hw'", "'.mz'", "'.spel-koppel'", "'.spel-bouw'", "'#sheet'", "'#naslag'", "'#pillen'", "'#balk'"]) expect(js).toContain(klasse);
  });

  it('houdt de vertaling dicht tot je erom vraagt', () => {
    expect(html).toContain('[hidden]{display:none!important}');
    expect(html.match(/<span class="nl" hidden>/g)).toHaveLength(3);
  });

  it('voorkomt dat lesdata het script-element afsluit', () => {
    const boos = structuredClone(les);
    boos.kaarten[0].tekst = '</script><script>alert(1)</script>';
    const h = renderLesson(boos, meta);
    expect(lesdata(h).kaarten[0].txt).toBe('</script><script>alert(1)</script>');
    expect(h.match(/<\/script>/g)).toHaveLength(2);
  });

  it('laat Erachter weg bij een couplet zonder duiding of cultuur', () => {
    const kaal = renderLesson({ ...les, cultuur: [], strofen: les.strofen.map((s) => ({ ...s, duiding: '' })) }, meta);
    expect(kaal).not.toContain('id="stap-s0-erachter"');
    expect(kaal).toContain('id="stap-s0-zelf"');
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
