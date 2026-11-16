import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../config.js';
import type { Les, Regel, Woord } from '../lesson/schema.js';
import type { TrackRef } from '../types.js';

const TEMPLATES = path.join(ROOT, 'templates');
const FONTS =
  'https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Source+Sans+3:ital,wght@0,400;0,600;1,400&display=swap';

export interface RenderMeta {
  id: string;
  track: TrackRef;
  lyricsSource: string;
  partial: boolean;
  copyright?: string;
  model: string;
  generatedAt: string;
  /** De meegeleverde voorbeeldles: tekst vrij van rechten, niet door de app gegenereerd. */
  voorbeeld?: boolean;
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

function liedHtml(les: Les): string {
  const strofen = vulHerhalingen(les.strofen);
  const eerste = strofen[0]?.regels.find((r) => r.woorden.length)?.woorden[0]?.sleutel;
  const uit = [
    '<div class="lied" id="lied-app">',
    `  <div class="lied-balk"><p>${esc(les.lied.artiest)} &middot; ${esc(les.lied.titel)}</p>` +
      '<button class="btn klein" type="button" id="vert-alle" aria-pressed="false">Alle vertalingen</button></div>',
  ];
  strofen.forEach((s, n) => {
    const start = n === 0 && eerste ? ` data-start="${esc(eerste)}"` : '';
    uit.push(`  <div class="strofe"${start}>`);
    uit.push(
      `    <div class="strofe-kop"><span>${esc(s.naam || `Strofe ${n + 1}`)}</span><button class="btn klein vert" type="button" aria-pressed="false">Vertaling</button></div>`,
    );
    for (const r of s.regels) {
      const noot = r.noot
        ? ` <button class="rn" type="button" lang="nl" aria-pressed="false" data-noot="${esc(r.noot)}">waarom?</button>`
        : '';
      uit.push(
        `    <p class="regel"><span class="de" lang="de">${regelHtml(r)}${noot}</span><span class="nl" hidden>${esc(r.nl)}</span></p>`,
      );
    }
    uit.push('    <div class="uitleg" aria-live="polite"><p class="leeg">Tik op een woord voor uitleg.</p></div>');
    uit.push('  </div>');
  });
  uit.push('</div>');
  return uit.join('\n');
}

/** De officiële Spotify-speler, zodat het lied naast de tekst klinkt. */
function spelerHtml(t: TrackRef): string {
  if (!t.spotifyId || !/^[A-Za-z0-9]+$/.test(t.spotifyId)) return '';
  return `  <iframe class="speler" title="Speel ${esc(t.title)} af in Spotify" src="https://open.spotify.com/embed/track/${t.spotifyId}" height="80" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>\n`;
}

const ONZEKER = '<p class="zeker">Niet alles hiervan staat vast</p>';

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

function sectie(id: string, num: string, titel: string, inhoud: string): string {
  return `<section id="${id}">\n  <h2><span class="num">${esc(num)}</span>${esc(titel)}</h2>\n${inhoud}\n</section>\n`;
}

export function renderLesson(les: Les, meta: RenderMeta): string {
  const css = readFileSync(path.join(TEMPLATES, 'lesson.css'), 'utf8');
  const js = readFileSync(path.join(TEMPLATES, 'lesson.js'), 'utf8');
  const lex = Object.fromEntries(les.woordenlijst.map((w) => [w.sleutel, lexEntry(w)]));
  const data = {
    id: meta.id,
    lex,
    decoder: les.decoder.map((g) => ({
      groep: g.groep,
      woorden: g.woorden.map((w) => ({ ...w, stappen: w.stappen.map((s) => [s.regel, s.vorm]) })),
    })),
    kaarten: les.kaarten.map((k) => ({ v: k.voor, b: k.betekenis, fam: k.familie, regel: k.regel, txt: k.tekst })),
  };
  const blob = JSON.stringify(data).replace(/</g, '\\u003c');
  const aantalDec = les.decoder.reduce((n, g) => n + g.woorden.length, 0);
  const eersteDec = les.decoder[0]?.woorden[0];

  const alineas = les.achtergrond.alineas.filter((a) => a.trim());
  const nav = (
    [
      ['doelen', 'Leerdoelen'],
      alineas.length && ['achtergrond', 'Achtergrond'],
      ['tekst', 'De tekst'],
      les.cultuur.length && ['cultuur', 'Cultuur'],
      ['klank', 'Decodeerapparaat'],
      ['verhalen', 'Woordverhalen'],
      ['grammatica', 'Grammatica'],
      les.valseVrienden.length && ['vrienden', 'Valse vrienden'],
      ['kaarten', 'Flashcards'],
      ['toets', 'Zelftoets'],
      ['bron', 'Bron'],
    ] as (false | 0 | [string, string])[]
  ).filter((n): n is [string, string] => !!n);

  const secties: string[] = [];
  secties.push(
    sectie('doelen', 'Deze les', 'Wat je aan het eind kunt', `  <ul>\n${les.leerdoelen.map((d) => `    <li>${esc(d)}</li>`).join('\n')}\n  </ul>`),
  );
  if (alineas.length) {
    secties.push(
      sectie(
        'achtergrond',
        'Achtergrond',
        'Waar dit lied vandaan komt',
        `${les.achtergrond.zekerheid === 'onzeker' ? `  ${ONZEKER}\n` : ''}${alineas.map((a) => `  <p>${esc(a)}</p>`).join('\n')}`,
      ),
    );
  }
  const partialNoot = meta.partial
    ? '  <div class="box let"><h4>Onvolledige tekst</h4><p>De bron gaf maar een deel van de songtekst. Plak de hele tekst handmatig voor een volledige les.</p></div>\n'
    : '';
  const heeftNoten = les.strofen.some((s) => s.regels.some((r) => r.noot));
  secties.push(
    sectie(
      'tekst',
      'De tekst',
      'Regel voor regel',
      `${partialNoot}  <p>Tik op een onderstreept woord. Naast de betekenis zie je waarom het hier zo staat en waar het vandaan komt.${heeftNoten ? ' Achter sommige regels staat <i>waarom?</i> voor wat aan de hele regel hangt.' : ''}</p>\n${spelerHtml(meta.track)}${liedHtml(les)}`,
    ),
  );
  if (les.cultuur.length) {
    secties.push(
      sectie(
        'cultuur',
        'Cultuur',
        'Wat een Duitser erbij hoort',
        les.cultuur
          .map(
            (c) =>
              `  <div class="box beeld cult"><h4>${esc(c.titel)}</h4>${c.aanleiding ? `<p class="aanl">Bij <i lang="de">${esc(c.aanleiding)}</i></p>` : ''}${c.zekerheid === 'onzeker' ? ONZEKER : ''}<p>${esc(c.tekst)}</p>${c.kapstok ? `<p class="kapstok"><b>Kapstok</b>${esc(c.kapstok)}</p>` : ''}</div>`,
          )
          .join('\n'),
      ),
    );
  }
  const klankRijen = les.klankverschuivingen
    .map((k) => `    <tr><td class="l">${esc(k.regel)}</td><td>${esc(k.uitleg)}</td><td>${k.voorbeelden.map((v) => `<i lang="de">${esc(v)}</i>`).join(', ')}</td></tr>`)
    .join('\n');
  secties.push(
    sectie(
      'klank',
      'Het decodeerapparaat',
      'De schuiven in dit lied',
      `  <div class="tw"><table class="breed">\n    <tr><th>Schuif</th><th>Wat er gebeurt</th><th>In het lied</th></tr>\n${klankRijen}\n  </table></div>
  <h3>Decodeer zelf</h3>
  <p>Kies een Nederlands woord en typ wat je denkt dat het Duits ervan maakt. Het Engelse woord staat erbij als scheidsrechter.</p>
  <div class="app" id="decoder-app">
    <div class="dec">
      <div id="dec-kies"></div>
      <div>
        <div class="dec-vraag">
          <div><span class="lab">Nederlands</span><span class="dec-nl" id="dec-nl">${esc(eersteDec?.nl)}</span></div>
          <div><span class="lab">Engels</span><span class="dec-en" id="dec-en" lang="en">${esc(eersteDec?.en)}</span></div>
        </div>
        <form class="dec-form" id="dec-form" autocomplete="off">
          <label for="dec-in"><span class="lab">Jouw Duitse woord</span>
            <input id="dec-in" name="gok" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" lang="de">
          </label>
          <button class="btn pri" type="submit" id="dec-check">Controleer</button>
        </form>
        <div class="dec-acties">
          <button class="btn" type="button" id="dec-hint">Hint</button>
          <button class="btn" type="button" id="dec-toon">Toon afleiding</button>
          <button class="btn" type="button" id="dec-volgende">Volgend woord</button>
        </div>
        <div class="dec-uit" id="dec-uit" aria-live="polite"><p class="oordeel">Typ je gok en druk op Controleer.</p></div>
        <p class="dec-score" id="dec-score">0 van ${aantalDec} gedecodeerd</p>
      </div>
    </div>
  </div>`,
    ),
  );
  secties.push(
    sectie(
      'verhalen',
      'Etymologie',
      'Woorden met een verhaal',
      les.verhalen
        .map(
          (v) =>
            `  <div class="box verhaal"><h4 lang="de">${esc(v.woord)}</h4>${v.zekerheid === 'onzeker' ? '<p class="zeker">Herkomst onzeker</p>' : ''}<p><strong>${esc(v.titel)}</strong></p><p>${esc(v.tekst)}</p></div>`,
        )
        .join('\n'),
    ),
  );
  secties.push(
    sectie(
      'grammatica',
      'Grammatica',
      'Wat het lied van je vraagt',
      les.grammatica
        .map(
          (g) =>
            `  <h3>${esc(g.titel)}</h3>\n  <p>${esc(g.uitleg)}</p>\n  <ul class="vb">${g.voorbeelden.map((v) => `<li><span class="de" lang="de">${esc(v.de)}</span> <span class="nl">${esc(v.nl)}</span></li>`).join('')}</ul>${g.herkomst ? `\n  <div class="box dig"><h4>Hoe het zo kwam</h4><p>${esc(g.herkomst)}</p></div>` : ''}`,
        )
        .join('\n'),
    ),
  );
  if (les.valseVrienden.length) {
    const rijen = les.valseVrienden
      .map((v) => `    <tr><td class="b" lang="de">${esc(v.duits)}</td><td>${esc(v.lijktOp)}</td><td>${esc(v.betekent)}</td><td>${esc(v.toelichting)}</td></tr>`)
      .join('\n');
    secties.push(
      sectie('vrienden', 'Let op', 'Valse vrienden', `  <div class="tw"><table class="breed">\n    <tr><th>Duits</th><th>Lijkt op</th><th>Betekent</th><th>Toelichting</th></tr>\n${rijen}\n  </table></div>`),
    );
  }
  const k0 = les.kaarten[0];
  secties.push(
    sectie(
      'kaarten',
      'Oefenen',
      'Flashcards met de herkomst op de achterkant',
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
    ),
  );
  secties.push(
    sectie(
      'toets',
      'Zelftoets',
      `${les.toets.length} vragen`,
      `  <p>Kies per vraag één antwoord. Je ziet meteen of het klopt en waarom.</p>\n${toetsHtml(les)}\n  <div class="score">\n    <p id="toets-score">0 van ${les.toets.length} beantwoord</p>\n    <button class="btn klein" type="button" id="toets-reset">Wis antwoorden</button>\n  </div>`,
    ),
  );
  const spotify = meta.track.spotifyUrl ? `<a href="${esc(meta.track.spotifyUrl)}">Open in Spotify</a>. ` : '';
  const bron = meta.voorbeeld
    ? `  <p>Dit is de voorbeeldles die bij Taalstof hoort. De tekst van het lied is vrij van rechten. Claude schreef de les bij het bouwen van de app, in dezelfde vorm als de lessen die je zelf maakt.</p>`
    : `  <p>${spotify}Songtekst via ${esc(meta.lyricsSource)}${meta.copyright ? `, ${esc(meta.copyright)}` : ''}. De tekst is auteursrechtelijk beschermd; deze les is alleen voor eigen gebruik.</p>\n  <p>Gemaakt met ${esc(meta.model)} op ${esc(meta.generatedAt.slice(0, 10))}.</p>`;
  secties.push(
    sectie(
      'bron',
      'Bron',
      'Over deze les',
      `${bron}\n  <p>Herkomst en achtergrond komen uit het geheugen van een taalmodel. Wat het label onzeker draagt, staat niet vast.</p>`,
    ),
  );

  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(les.titel)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>
${css}</style>
</head>
<body>
<div class="wrap">
<header class="mast">
  <p class="eyebrow">Taalstof &middot; Duits via muziek</p>
  <h1>${esc(les.titel)}</h1>
  <p class="lead">${esc(les.lead)}</p>
  <div class="meta">
    <span><b>Lied</b> ${esc(les.lied.titel)}</span>
    <span>${esc(les.lied.artiest)}</span>
    <span>${les.woordenlijst.length} woorden</span>
  </div>
</header>
<div class="grid">
<nav class="rail" aria-label="Inhoud">
  <p>Inhoud</p>
  <ol>
${nav.map(([id, t]) => `    <li><a href="#${id}">${esc(t)}</a></li>`).join('\n')}
  </ol>
</nav>
<main>
${secties.join('\n')}
<footer>
  Taalstof &middot; alleen voor eigen gebruik
</footer>
</main>
</div>
</div>
<script type="application/json" id="lesdata">${blob}</script>
<script>
${js}</script>
</body>
</html>
`;
}
