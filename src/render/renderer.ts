// Stijl en interactie van de les gaan als tekst mee, zodat een les één los HTML-document is.
import css from '../../templates/lesson.css?raw';
import js from '../../templates/lesson.js?raw';
import type { Les, Regel, Woord } from '../lesson/schema.js';
import type { TrackRef } from '../types.js';

const FONTS =
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600;1,700&family=Nunito:wght@700;800&display=swap';

export interface RenderMeta {
  id: string;
  track: TrackRef;
  lyricsSource: string;
  partial: boolean;
  copyright?: string;
  model: string;
  generatedAt: string;
  /** Wat het maken kostte, als tekst. */
  bedrag?: string;
  /** De meegeleverde voorbeeldles: tekst vrij van rechten, niet door de app gegenereerd. */
  voorbeeld?: boolean;
  /** Adres van de app, voor de weg terug vanuit de les. */
  terug?: string;
}

export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const LETTER = /[\p{L}\p{N}]/u;

/**
 * Eerste plek vanaf `van` waar `tekst` als los woord staat. Zo wordt "in" niet
 * gevonden midden in "sind".
 */
export function vindWoord(de: string, tekst: string, van: number): number {
  const kopLetter = LETTER.test(tekst.charAt(0));
  const staartLetter = LETTER.test(tekst.charAt(tekst.length - 1));
  for (let i = de.indexOf(tekst, van); i !== -1; i = de.indexOf(tekst, i + 1)) {
    const voor = kopLetter && LETTER.test(de.charAt(i - 1));
    const na = staartLetter && LETTER.test(de.charAt(i + tekst.length));
    if (!voor && !na) return i;
  }
  return -1;
}

/** Maak een regel klikbaar: elk genoemd woord wordt een knop, de rest blijft tekst. */
export function regelHtml(r: Regel): string {
  let uit = '';
  let pos = 0;
  for (const w of r.woorden) {
    if (!w.tekst) continue;
    const i = vindWoord(r.de, w.tekst, pos);
    if (i === -1) continue;
    uit += esc(r.de.slice(pos, i));
    let eind = i + w.tekst.length;
    const knop = `<button class="w" type="button" data-k="${esc(w.sleutel)}" aria-pressed="false">${esc(w.tekst)}</button>`;
    const leest = /^[,.!?;:]+/.exec(r.de.slice(eind));
    if (leest) {
      uit += `<span class="nb">${knop}${esc(leest[0])}</span>`;
      eind += leest[0].length;
    } else {
      uit += knop;
    }
    pos = eind;
  }
  return uit + esc(r.de.slice(pos));
}

/** Een herhaalde regel, zoals in een refrein, krijgt de woorden en de noot van de eerste keer. */
export function vulHerhalingen(strofen: Les['strofen']): Les['strofen'] {
  const eerste = new Map<string, Regel>();
  return strofen.map((s) => ({
    ...s,
    regels: s.regels.map((r) => {
      const k = r.de.trim().replace(/\s+/g, ' ');
      const e = eerste.get(k);
      if (!e) {
        if (r.woorden.length || r.noot) eerste.set(k, r);
        return r;
      }
      return { ...r, woorden: r.woorden.length ? r.woorden : e.woorden, noot: r.noot || e.noot };
    }),
  }));
}

export function familie(w: { nlVerwant: string; enVerwant: string }): string {
  return [w.nlVerwant && `NL ${w.nlVerwant}`, w.enVerwant && `EN ${w.enVerwant}`].filter(Boolean).join(' · ');
}

function lexEntry(w: Woord) {
  const chips: [string, string][] = [];
  if (w.klankverschuiving) chips.push(['k', w.klankverschuiving]);
  for (const l of w.labels) if (!(l.soort === 'k' && l.tekst === w.klankverschuiving)) chips.push([l.soort, l.tekst]);
  if (w.zekerheid === 'onzeker') chips.push(['o', 'herkomst onzeker']);
  return { w: w.woord, nl: w.betekenis, fam: familie(w), chips, geb: w.gebruik, ety: w.etymologie };
}

/** Vergelijkt regels zonder te letten op hoofdletters, leestekens en spaties. */
export function normRegel(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/**
 * Waar een zinsnede in het lied staat: strofe en regel, of null. Eerst een hele regel,
 * dan een stuk van een regel op woordgrens, zodat "rein" niet in "reinigen" valt.
 */
export function vindPlek(strofen: Les['strofen'], citaat: string): { n: number; i: number } | null {
  const c = normRegel(citaat);
  if (!c) return null;
  for (const heel of [true, false]) {
    for (const [n, st] of strofen.entries()) {
      for (const [i, r] of st.regels.entries()) {
        const d = normRegel(r.de);
        if (heel ? d === c : ` ${d} `.includes(` ${c} `) || (c.length > 12 && ` ${c} `.includes(` ${d} `) && d.length > 6)) return { n, i };
      }
    }
  }
  return null;
}

/** Het id van de regel die een zinsnede aanhaalt, of leeg. */
export function vindRegel(strofen: Les['strofen'], citaat: string): string {
  const p = vindPlek(strofen, citaat);
  return p ? `r-${p.n}-${p.i}` : '';
}

const ONZEKER = '<p class="zeker">Niet alles hiervan staat vast</p>';

/** Eén couplet: de regels met klikbare woorden, een knop voor de vertaling en ruimte voor uitleg. */
function strofeHtml(s: Les['strofen'][number], n: number): string {
  const eerste = s.regels.find((r) => r.woorden.length)?.woorden[0]?.sleutel;
  const uit = [
    `  <div class="strofe"${eerste ? ` data-start="${esc(eerste)}"` : ''}>`,
    `    <div class="strofe-kop"><span>${esc(s.naam || `Couplet ${n + 1}`)}</span><button class="btn klein vert" type="button" aria-pressed="false">Vertaling</button></div>`,
  ];
  for (const [i, r] of s.regels.entries()) {
    const noot = r.noot
      ? ` <button class="rn" type="button" lang="nl" aria-pressed="false" data-noot="${esc(r.noot)}">waarom?</button>`
      : '';
    uit.push(
      `    <p class="regel" id="r-${n}-${i}"><span class="de" lang="de">${regelHtml(r)}${noot}</span><span class="nl" hidden>${esc(r.nl)}</span></p>`,
    );
  }
  uit.push('    <div class="uitleg" aria-live="polite"><p class="leeg">Tik op een woord voor uitleg.</p></div>', '  </div>');
  return uit.join('\n');
}

/** Een vraag om eerst te raden, met het antwoord achter de knoppen. */
function raadHtml(v: Les['cultuur'][number]['vraag']): string {
  if (!v.vraag) return '';
  return (
    `    <div class="raad"><p class="lab">Raad eerst</p><p class="q">${esc(v.vraag)}</p><div class="opts">` +
    v.opties.map((o, i) => `<button class="opt" type="button" data-ok="${i === v.goed ? 1 : 0}">${esc(o)}</button>`).join('') +
    `</div><p class="toel" hidden aria-live="polite" data-t="${esc(v.uitleg)}"></p></div>`
  );
}

type Cultuur = Les['cultuur'][number];

/** Wat een Duitser erbij hoort: de regel uit het lied, dan het stuk zelf. */
function cultuurHtml(c: Cultuur, regel: Regel | undefined, lex: Map<string, Woord>): string {
  const uit: string[] = [];
  if (regel) {
    uit.push(`  <blockquote class="citaat"><p class="de" lang="de">${esc(regel.de)}</p><p class="nl">${esc(regel.nl)}</p></blockquote>`);
  } else if (c.aanleiding) {
    uit.push(`  <blockquote class="citaat"><p class="de" lang="de">${esc(c.aanleiding)}</p></blockquote>`);
  }
  uit.push(`  <article class="box cult">`, `    <h3>${esc(c.titel)}</h3>`);
  if (c.zekerheid === 'onzeker') uit.push(`    ${ONZEKER}`);
  const raad = raadHtml(c.vraag);
  if (raad) uit.push(raad);
  uit.push(`    <p>${esc(c.tekst)}</p>`);
  const woorden = c.woorden.map((k) => lex.get(k)).filter((w): w is Woord => !!w);
  if (woorden.length) {
    uit.push(
      `    <div class="hw"><p class="lab">Woorden die hierbij horen</p><div class="hw-knoppen">` +
        woorden.map((w) => `<button class="hwk" type="button" lang="de" data-k="${esc(w.sleutel)}" aria-pressed="false">${esc(w.woord)}</button>`).join('') +
        `</div><p class="hw-uit" aria-live="polite"></p></div>`,
    );
  }
  if (c.kapstok) uit.push(`    <p class="kapstok"><b>Kapstok</b>${esc(c.kapstok)}</p>`);
  uit.push('  </article>');
  return uit.join('\n');
}

/**
 * Meezingen: de tekst met gaten op de plek van woorden uit de les. Per regel hooguit twee
 * gaten, de langste woorden eerst. Een herhaalde regel komt maar één keer terug.
 */
export function meezingHtml(les: Les): string {
  const strofen = vulHerhalingen(les.strofen);
  const gehad = new Set<string>();
  const blokken: string[] = [];
  let totaal = 0;
  strofen.forEach((s, n) => {
    const regels: string[] = [];
    for (const r of s.regels) {
      const k = normRegel(r.de);
      if (gehad.has(k)) continue;
      gehad.add(k);
      const kandidaten = [...new Set(r.woorden.map((w) => w.tekst))].filter((t) => /^[\p{L}]{3,}$/u.test(t));
      const kies = new Set([...kandidaten].sort((a, b) => b.length - a.length).slice(0, 2));
      let html = '';
      let pos = 0;
      for (const t of kandidaten) {
        if (!kies.has(t)) continue;
        const i = vindWoord(r.de, t, pos);
        if (i === -1) continue;
        html += esc(r.de.slice(pos, i));
        html += `<input class="gat" type="text" data-a="${esc(t)}" size="${Math.max(4, t.length + 1)}" autocomplete="off" autocapitalize="off" spellcheck="false" lang="de" aria-label="Ontbrekend woord">`;
        totaal++;
        pos = i + t.length;
      }
      if (!pos) continue;
      html += esc(r.de.slice(pos));
      regels.push(`      <p class="mz-regel"><span class="de" lang="de">${html}</span><span class="nl">${esc(r.nl)}</span></p>`);
    }
    if (!regels.length) return;
    blokken.push(
      `  <div class="app mz" data-n="${n}">\n    <p class="lab">${esc(s.naam || `Couplet ${n + 1}`)}</p>\n${regels.join('\n')}\n` +
        '    <div class="k-balk"><button class="btn pri mz-check" type="button">Controleer</button><button class="btn mz-toon" type="button">Toon antwoorden</button><button class="btn klein mz-nl" type="button" aria-pressed="true">Vertaling</button><p class="k-voortgang mz-score" aria-live="polite"></p></div>\n  </div>',
    );
  });
  if (!totaal) return '';
  return blokken.join('\n');
}

/** De woorden van een regel zonder leestekens eraan, in de goede volgorde. */
export function stukkenVan(de: string): string[] {
  return de
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, ''))
    .filter(Boolean);
}

export interface Spel {
  /** Woordparen uit dit couplet die nog niet eerder aan bod kwamen, voor het koppelspel. */
  paren: { de: string; nl: string }[];
  /** Regels uit dit couplet die nog niet eerder in het lied stonden, voor het bouwspel. */
  zinnen: { nl: string; stukken: string[]; bij: string }[];
}

/** Wat Zelf doen bij couplet n te spelen heeft. Gebruikt alleen wat de les al heeft. */
export function spelVoor(les: Les, n: number, cultuurBij: Map<string, string> = new Map()): Spel {
  const strofen = vulHerhalingen(les.strofen);
  const lex = new Map(les.woordenlijst.map((w) => [w.sleutel, w]));
  // Woorden die in een eerder couplet al te koppelen waren, komen niet nog eens terug.
  const sleutels = new Set<string>(strofen.slice(0, n).flatMap((s) => s.regels.flatMap((r) => r.woorden.map((w) => w.sleutel))));
  const betekenissen = new Set<string>();
  const paren: Spel['paren'] = [];
  for (const r of strofen[n]?.regels ?? []) {
    for (const w of r.woorden) {
      const e = lex.get(w.sleutel);
      if (!e?.woord || !e.betekenis || sleutels.has(w.sleutel) || betekenissen.has(e.betekenis)) continue;
      sleutels.add(w.sleutel);
      betekenissen.add(e.betekenis);
      paren.push({ de: e.woord, nl: e.betekenis });
    }
  }
  const eerder = new Set(strofen.slice(0, n).flatMap((s) => s.regels.map((r) => normRegel(r.de))));
  const zinnen: Spel['zinnen'] = [];
  for (const [i, r] of (strofen[n]?.regels ?? []).entries()) {
    const k = normRegel(r.de);
    if (!k || eerder.has(k)) continue;
    eerder.add(k);
    const stukken = stukkenVan(r.de);
    if (stukken.length >= 4 && stukken.length <= 10 && r.nl) zinnen.push({ nl: r.nl, stukken, bij: cultuurBij.get(`${n}-${i}`) ?? '' });
  }
  return { paren: paren.length >= 3 ? paren : [], zinnen };
}

/** De officiële Spotify-speler, zodat het lied naast de les klinkt. */
function spelerHtml(t: TrackRef): string {
  if (!t.spotifyId || !/^[A-Za-z0-9]+$/.test(t.spotifyId)) return '';
  return `  <iframe class="speler" title="Speel ${esc(t.title)} af in Spotify" src="https://open.spotify.com/embed/track/${t.spotifyId}" height="80" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>\n`;
}

function bronnenHtml(les: Les): string {
  if (!les.bronnen.length) return '  <p>Dit steunt niet op bronnen die het model tijdens het maken van de les gelezen heeft. Lees het als iets uit het geheugen.</p>\n';
  return `  <h3>Waar het op steunt</h3>\n  <ul class="bronnen">${les.bronnen
    .map((b) => `<li><a href="${esc(b.url)}" rel="noopener noreferrer" target="_blank">${esc(b.titel || b.url)}</a></li>`)
    .join('')}</ul>\n`;
}

function toetsHtml(les: Les): string {
  const uit = ['<ol class="mc">'];
  for (const t of les.toets) {
    uit.push('  <li>', `    <p class="q">${esc(t.vraag)}</p>`, '    <div class="opts">');
    t.opties.forEach((o, i) =>
      uit.push(`      <button class="opt" type="button" data-ok="${i === t.goed ? 1 : 0}">${esc(o)}</button>`),
    );
    uit.push('    </div>', `    <p class="toel" hidden aria-live="polite" data-t="${esc(t.toelichting)}"></p>`, '  </li>');
  }
  uit.push('</ol>');
  return uit.join('\n');
}

/* ------------------------------------------------------------------ */
/* De reis: haltes (coupletten, meezingen, toets) met elk een paar stappen. */

export interface Stap {
  id: string;
  naam: string;
  verteller: string;
  inhoud: string;
  /** Wat er na deze stap komt, als korte tekst met hooguit wat cursief. Leeg bij de laatste stap. */
  hierna: string;
  /** Bij Zelf doen: de woorden en regels voor de spellen. */
  spel?: Spel;
}

export interface Halte {
  id: string;
  soort: 'couplet' | 'meezingen' | 'toets';
  /** Korte naam in de kop, zoals "Couplet 3". */
  naam: string;
  /** Het label op het pad: de eerste regel van het couplet, of de naam van de halte. */
  label: string;
  klein: string;
  inleiding: string;
  woorden: string[];
  stappen: Stap[];
}

function kort(s: string, max = 34): string {
  const t = s.replace(/[,.;:!?]+$/, '');
  return t.length <= max ? t : `${t.slice(0, max).replace(/\s+\S*$/, '')}…`;
}

/** Bouwt de hele reis door het lied. De volgorde van de stappen is de volgorde van de les. */
export function reisplan(les: Les, meta: Pick<RenderMeta, 'partial' | 'track'> = { partial: false, track: { title: '', artist: '' } }): Halte[] {
  const strofen = vulHerhalingen(les.strofen);
  const lex = new Map(les.woordenlijst.map((w) => [w.sleutel, w]));

  // Elk cultuurstuk hangt aan het couplet waar zijn zinsnede staat. Zonder plek: bij het eerste couplet.
  const cultuurPer = new Map<number, { c: Cultuur; regel?: Regel; i?: number }[]>();
  const cultuurBij = new Map<string, string>();
  for (const c of les.cultuur) {
    const p = vindPlek(strofen, c.aanleiding);
    const n = p?.n ?? 0;
    const lijst = cultuurPer.get(n) ?? [];
    lijst.push({ c, regel: p ? strofen[p.n].regels[p.i] : undefined, i: p?.i });
    cultuurPer.set(n, lijst);
    if (p && !cultuurBij.has(`${p.n}-${p.i}`)) cultuurBij.set(`${p.n}-${p.i}`, c.titel);
  }

  // Een grammaticaonderwerp verschijnt bij het eerste couplet waar een voorbeeld uit staat.
  const grammaticaPer = new Map<number, { titel: string; i: number }[]>();
  les.grammatica.forEach((g, gi) => {
    const n = g.voorbeelden.map((v) => vindPlek(strofen, v.de)?.n).find((x) => x !== undefined);
    if (n === undefined) return;
    grammaticaPer.set(n, [...(grammaticaPer.get(n) ?? []), { titel: g.titel, i: gi }]);
  });

  const haltes: Halte[] = [];
  strofen.forEach((s, n) => {
    const naam = s.naam || `Couplet ${n + 1}`;
    const eersteRegel = s.regels[0]?.de ?? '';
    const stappen: Stap[] = [];

    const gram = grammaticaPer.get(n) ?? [];
    const partieel =
      n === 0 && meta.partial
        ? '  <div class="box let"><h4>Onvolledige tekst</h4><p>De bron gaf maar een deel van de songtekst. Plak de hele tekst voor een volledige les.</p></div>\n'
        : '';
    stappen.push({
      id: `s${n}-lezen`,
      naam: 'Lezen',
      verteller: s.inleiding || 'Lees het couplet en tik aan wat je niet kent.',
      inhoud:
        partieel +
        strofeHtml(s, n) +
        (gram.length
          ? `\n  <div class="gram"><p class="lab">Grammatica hierbij</p>${gram.map((g) => `<button class="btn klein naslag-link" type="button" data-naslag="g-${g.i}">${esc(g.titel)}</button>`).join('')}</div>`
          : ''),
      hierna: '',
    });

    const cultuur = cultuurPer.get(n) ?? [];
    if (s.duiding || cultuur.length) {
      stappen.push({
        id: `s${n}-erachter`,
        naam: 'Erachter',
        verteller: s.duiding,
        inhoud: cultuur.map((x) => cultuurHtml(x.c, x.regel, lex)).join('\n'),
        hierna: '',
      });
    }

    const spel = spelVoor(les, n, cultuurBij);
    if (spel.paren.length || spel.zinnen.length) {
      const delen: string[] = [];
      if (spel.paren.length) {
        delen.push(`  <h3>Koppel de woorden</h3>
  <div class="app spel-koppel" data-spel="s${n}-zelf">
    <div class="koppel"><div class="kolom-de"></div><div class="kolom-nl"></div></div>
    <div class="k-balk"><button class="btn koppel-nieuw" type="button">Andere woorden</button><p class="k-voortgang koppel-stand" aria-live="polite"></p></div>
  </div>`);
      }
      if (spel.zinnen.length) {
        delen.push(`  <h3>Bouw een regel</h3>
  <div class="app spel-bouw" data-spel="s${n}-zelf">
    <p class="bouw-bij"></p>
    <p class="bouw-nl"></p>
    <div class="bouw-antwoord" aria-label="Jouw regel"></div>
    <div class="bouw-bank"></div>
    <p class="bouw-uit" aria-live="polite"></p>
    <div class="k-balk"><button class="btn pri bouw-check" type="button">Controleer</button>${spel.zinnen.length > 1 ? '<button class="btn bouw-volgende" type="button">Andere regel</button>' : ''}<p class="k-voortgang bouw-stand"></p></div>
  </div>`);
      }
      stappen.push({
        id: `s${n}-zelf`,
        naam: 'Zelf doen',
        verteller:
          spel.paren.length && spel.zinnen.length
            ? 'Nu zelf. Eerst de woorden van dit couplet, en dan een regel in elkaar zetten.'
            : spel.paren.length
              ? 'Nu zelf. Koppel de woorden van dit couplet aan wat ze betekenen.'
              : 'Nu zelf. Zet een regel uit dit couplet in de goede volgorde.',
        inhoud: delen.join('\n'),
        hierna: '',
        spel,
      });
    }

    const woorden = [...new Set(s.regels.flatMap((r) => r.woorden.map((w) => lex.get(w.sleutel)?.woord ?? '')).filter(Boolean))];
    haltes.push({
      id: `h${n}`,
      soort: 'couplet',
      naam,
      label: kort(eersteRegel) || naam,
      klein: naam,
      inleiding: s.inleiding,
      woorden: woorden.slice(0, 6),
      stappen,
    });
  });

  const meezingen = meezingHtml(les);
  if (meezingen) {
    haltes.push({
      id: 'h-mz',
      soort: 'meezingen',
      naam: 'Meezingen',
      label: 'Meezingen',
      klein: 'Het hele lied',
      inleiding: 'Nu het hele lied achter elkaar. Zet het op en vul in wat je hoort.',
      woorden: [],
      stappen: [
        {
          id: 'meezingen',
          naam: 'Meezingen',
          verteller: 'Nu het hele lied achter elkaar. Zet het op en vul in wat je hoort.',
          inhoud: `  <p class="hint">Hoofdletters en umlauts mogen anders, ae voor ä is ook goed.${meta.track.spotifyId ? ' De speler staat bij het overzicht.' : ''}</p>\n${meezingen}`,
          hierna: '',
        },
      ],
    });
  }

  if (les.toets.length) {
    haltes.push({
      id: 'h-toets',
      soort: 'toets',
      naam: 'Toets',
      label: 'Toets',
      klein: `${les.toets.length} vragen`,
      inleiding: 'Tot slot een paar vragen over het hele lied.',
      woorden: [],
      stappen: [
        {
          id: 'toets',
          naam: 'Toets',
          verteller: 'Tot slot een paar vragen over het hele lied.',
          inhoud: `${les.leerdoelen.length ? `  <div class="box doelen"><h4>Kun je dit nu?</h4><ul>${les.leerdoelen.map((d) => `<li>${esc(d)}</li>`).join('')}</ul></div>\n` : ''}${toetsHtml(les)}\n  <div class="score">\n    <p id="toets-score">0 van ${les.toets.length} beantwoord</p>\n    <button class="btn klein" type="button" id="toets-reset">Wis antwoorden</button>\n  </div>`,
          hierna: '',
        },
      ],
    });
  }

  // Wat er hierna komt, zodat elke stap naar de volgende verwijst.
  const alle = haltes.flatMap((h) => h.stappen.map((s) => ({ h, s })));
  alle.forEach(({ h, s }, k) => {
    const volgende = alle[k + 1];
    if (!volgende) return;
    if (volgende.h === h) {
      if (volgende.s.naam === 'Erachter') {
        const eerste = cultuurPer.get(Number(h.id.slice(1)))?.[0]?.c.titel;
        s.hierna = eerste ? `<i>${esc(eerste)}</i>` : 'waarom dit couplet zo is';
      } else s.hierna = 'zelf met dit couplet aan de slag';
      return;
    }
    const v = volgende.h;
    s.hierna =
      v.soort === 'couplet'
        ? `${esc(v.naam)}, <i lang="de">${esc(v.label)}</i>`
        : v.soort === 'meezingen'
          ? 'het hele lied meezingen'
          : 'een paar vragen over het hele lied';
  });
  return haltes;
}

/* ------------------------------------------------------------------ */

const DX = [0, 52, 78, 52, 0, -52, -78, -52];
const VINK = '<svg class="vink" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12.5l4 4L18 8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const NOOT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V6l10-2v12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="2.6" fill="currentColor"/><circle cx="16.5" cy="16" r="2.6" fill="currentColor"/></svg>';
const VLAG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4M6 4h11l-2.5 4L17 12H6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const KAART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>';
const BOEK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4zM20 5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>';

function padHtml(haltes: Halte[]): string {
  let nr = 0;
  return haltes
    .map((h, k) => {
      const ikoon = h.soort === 'couplet' ? `<span class="nr">${++nr}</span>` : h.soort === 'meezingen' ? NOOT : VLAG;
      return `    <li class="halte" data-halte="${h.id}" style="--dx:${DX[k % DX.length]}px">
      <button class="node" type="button" data-halte="${h.id}" aria-label="${esc(h.naam)}">${ikoon}${VINK}</button>
      <button class="lbl" type="button" data-halte="${h.id}"><span class="t"${h.soort === 'couplet' ? ' lang="de"' : ''}>${esc(h.label)}</span><small>${esc(h.klein)}</small></button>
      <ol class="sub">${h.stappen.map((s) => `<li><a href="#${s.id}" data-stap="${s.id}">${esc(s.naam)}</a></li>`).join('')}</ol>
    </li>`;
    })
    .join('\n');
}

function stapHtml(h: Halte, s: Stap, volgende: string | undefined, eerste: boolean): string {
  return `<section class="stap" id="stap-${s.id}" data-stap="${s.id}" data-halte="${h.id}"${eerste ? '' : ' hidden'}>
  <div class="stap-binnen">
${s.verteller ? `  <p class="verteller">${esc(s.verteller)}</p>\n` : ''}${s.inhoud}
  </div>
  <div class="voet"><div class="voet-binnen">${s.hierna ? `<p class="hierna">Hierna: ${s.hierna}</p>` : '<p class="hierna">Dit was de laatste stap.</p>'}<button class="btn pri verder" type="button" data-naar="${volgende ?? 'overzicht'}">${volgende ? 'Verder' : 'Klaar'}</button></div></div>
</section>`;
}

function naslagHtml(les: Les, meta: RenderMeta): string {
  const delen: [string, string, string][] = [];
  if (les.kaarten.length) {
    const k0 = les.kaarten[0];
    delen.push([
      'n-kaarten',
      'Kaarten',
      `  <div class="app" id="kaart-app">
    <button class="kaart" type="button" id="kaart" aria-label="Flashcard, tik om te draaien">
      <span class="zijde">Voorkant</span>
      <span class="voor" lang="de">${esc(k0?.voor)}</span>
      <span class="draai">Tik om te draaien</span>
    </button>
    <div class="k-balk">
      <button class="btn" type="button" id="k-nee">Nog niet</button>
      <button class="btn pri" type="button" id="k-ja">Ken ik</button>
      <button class="btn klein" type="button" id="k-reset">Begin opnieuw</button>
      <p class="k-voortgang" id="k-voortgang">0 van ${les.kaarten.length} gekend</p>
    </div>
  </div>`,
    ]);
  }
  if (les.verhalen.length) {
    delen.push([
      'n-verhalen',
      'Woordverhalen',
      les.verhalen
        .map(
          (v) =>
            `  <div class="box verhaal"><h4 lang="de">${esc(v.woord)}</h4>${v.zekerheid === 'onzeker' ? '<p class="zeker">Herkomst onzeker</p>' : ''}<p><strong>${esc(v.titel)}</strong></p><p>${esc(v.tekst)}</p></div>`,
        )
        .join('\n'),
    ]);
  }
  if (les.grammatica.length) {
    delen.push([
      'n-grammatica',
      'Grammatica',
      les.grammatica
        .map(
          (g, gi) =>
            `  <div class="gram-item" id="g-${gi}">\n  <h3>${esc(g.titel)}</h3>\n  <p>${esc(g.uitleg)}</p>\n  <ul class="vb">${g.voorbeelden.map((v) => `<li><span class="de" lang="de">${esc(v.de)}</span> <span class="nl">${esc(v.nl)}</span></li>`).join('')}</ul>${g.herkomst ? `\n  <div class="box dig"><h4>Hoe het zo kwam</h4><p>${esc(g.herkomst)}</p></div>` : ''}\n  </div>`,
        )
        .join('\n'),
    ]);
  }
  if (les.valseVrienden.length) {
    delen.push([
      'n-vrienden',
      'Valse vrienden',
      les.valseVrienden
        .map((v) => `  <div class="box vriend"><p><b lang="de">${esc(v.duits)}</b> lijkt op ${esc(v.lijktOp)}. Het betekent <b>${esc(v.betekent)}</b>.</p><p>${esc(v.toelichting)}</p></div>`)
        .join('\n'),
    ]);
  }
  const spotify = meta.track.spotifyUrl ? `<a href="${esc(meta.track.spotifyUrl)}">Open in Spotify</a>. ` : '';
  const bron = meta.voorbeeld
    ? `  <p>Dit is de voorbeeldles die bij Taalstof hoort. De tekst van het lied is vrij van rechten. Claude schreef de les bij het bouwen van de app, in dezelfde vorm als de lessen die je zelf maakt.</p>`
    : `  <p>${spotify}Songtekst via ${esc(meta.lyricsSource)}${meta.copyright ? `, ${esc(meta.copyright)}` : ''}. De tekst is auteursrechtelijk beschermd; deze les is alleen voor eigen gebruik.</p>\n  <p>Gemaakt met ${esc(meta.model)} op ${esc(meta.generatedAt.slice(0, 10))}${meta.bedrag ? `, kosten ${esc(meta.bedrag)}` : ''}.</p>`;
  delen.push(['n-bron', 'Bron', `${bron}\n${bronnenHtml(les)}  <p>Wat het label onzeker draagt, staat niet vast. Herkomst van woorden komt uit het geheugen van een taalmodel.</p>`]);

  return `<div class="naslag-achter" id="naslag-achter" hidden></div>
<aside class="naslag" id="naslag" aria-label="Naslag" hidden>
  <div class="naslag-kop"><h2>Naslag</h2><button class="ikoon" type="button" id="sluit-naslag" aria-label="Naslag sluiten"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg></button></div>
  <nav class="naslag-nav">${delen.map(([id, t]) => `<a class="btn klein" href="#${id}" data-naslag="${id}">${esc(t)}</a>`).join('')}</nav>
${delen.map(([id, t, inhoud]) => `  <section class="naslag-deel" id="${id}">\n  <h3 class="naslag-titel">${esc(t)}</h3>\n${inhoud}\n  </section>`).join('\n')}
</aside>`;
}

export function renderLesson(les: Les, meta: RenderMeta): string {
  const lex = Object.fromEntries(les.woordenlijst.map((w) => [w.sleutel, lexEntry(w)]));
  const haltes = reisplan(les, meta);
  const spellen: Record<string, Spel> = {};
  for (const h of haltes) for (const s of h.stappen) if (s.spel) spellen[s.id] = s.spel;
  const data = {
    id: meta.id,
    lex,
    kaarten: les.kaarten.map((k) => ({ v: k.voor, b: k.betekenis, fam: k.familie, regel: k.regel, txt: k.tekst })),
    haltes: haltes.map((h) => ({
      id: h.id,
      soort: h.soort,
      naam: h.naam,
      label: h.label,
      inleiding: h.inleiding,
      woorden: h.woorden,
      stappen: h.stappen.map((s) => ({ id: s.id, naam: s.naam })),
    })),
    spellen,
  };
  const blob = JSON.stringify(data).replace(/</g, '\\u003c');
  const alle = haltes.flatMap((h) => h.stappen.map((s) => ({ h, s })));

  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(les.lied.titel)} · Taalstof</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>
${css}</style>
</head>
<body>
<div class="les">
<aside class="overzicht" id="overzicht" aria-label="Overzicht">
  <div class="ov-kop">
    <p class="eyebrow">${meta.terug ? `<a href="${esc(meta.terug)}">Taalstof</a>` : 'Taalstof'}</p>
    <h1>${esc(les.lied.titel)}</h1>
    <p class="ov-meta">${esc(les.lied.artiest)}</p>
  </div>
${spelerHtml(meta.track)}  <ol class="pad">
${padHtml(haltes)}
  </ol>
  <button class="btn naslag-knop naslag-link" type="button" data-naslag="">${BOEK}Naslag</button>
</aside>
<main class="hoofd" id="hoofd">
  <header class="stap-kop">
    <button class="ikoon" type="button" id="naar-overzicht" aria-label="Overzicht">${KAART}</button>
    <div class="kop-midden">
      <p class="kop-titel" id="kop-titel"></p>
      <div class="balk" id="balk"></div>
    </div>
    <button class="ikoon naslag-link" type="button" data-naslag="" aria-label="Naslag">${BOEK}</button>
  </header>
  <nav class="pillen" id="pillen" aria-label="Stappen"></nav>
${alle.map(({ h, s }, k) => stapHtml(h, s, alle[k + 1]?.s.id, k === 0)).join('\n')}
</main>
</div>
${naslagHtml(les, meta)}
<div class="sheet-achter" id="sheet-achter" hidden></div>
<div class="sheet" id="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-naam" hidden></div>
<script type="application/json" id="lesdata">${blob}</script>
<script>
${js}</script>
</body>
</html>
`;
}
