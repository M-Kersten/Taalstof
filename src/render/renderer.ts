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
}

export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Maak een regel klikbaar: elk genoemd woord wordt een knop, de rest blijft tekst. */
export function regelHtml(r: Regel): string {
  let uit = '';
  let pos = 0;
  for (const w of r.woorden) {
    if (!w.tekst) continue;
    const i = r.de.indexOf(w.tekst, pos);
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

export function familie(w: { nlVerwant: string; enVerwant: string }): string {
  return [w.nlVerwant && `NL ${w.nlVerwant}`, w.enVerwant && `EN ${w.enVerwant}`].filter(Boolean).join(' · ');
}

function lexEntry(w: Woord) {
  const chips: [string, string][] = [];
  if (w.klankverschuiving) chips.push(['k', w.klankverschuiving]);
  for (const l of w.labels) if (!(l.soort === 'k' && l.tekst === w.klankverschuiving)) chips.push([l.soort, l.tekst]);
  if (w.zekerheid === 'onzeker') chips.push(['o', 'herkomst onzeker']);
  const txt = [w.uitleg, w.etymologie].filter(Boolean).join(' ');
  return { w: w.woord, nl: w.betekenis, fam: familie(w), chips, txt };
}

function liedHtml(les: Les): string {
  const eerste = les.strofen[0]?.regels.find((r) => r.woorden.length)?.woorden[0]?.sleutel;
  const uit = [
    '<div class="lied" id="lied-app">',
    `  <div class="lied-balk"><p>${esc(les.lied.artiest)} &middot; ${esc(les.lied.titel)}</p>` +
      '<button class="btn klein" type="button" id="vert-alle" aria-pressed="false">Alle vertalingen</button></div>',
  ];
  les.strofen.forEach((s, n) => {
    const start = n === 0 && eerste ? ` data-start="${esc(eerste)}"` : '';
    uit.push(`  <div class="strofe"${start}>`);
    uit.push(
      `    <div class="strofe-kop"><span>Strofe ${n + 1}</span><button class="btn klein vert" type="button" aria-pressed="false">Vertaling</button></div>`,
    );
    for (const r of s.regels) {
      uit.push(
        `    <p class="regel"><span class="de" lang="de">${regelHtml(r)}</span><span class="nl" hidden>${esc(r.nl)}</span></p>`,
      );
    }
    uit.push('    <div class="uitleg" aria-live="polite"><p class="leeg">Tik op een woord voor uitleg.</p></div>');
    uit.push('  </div>');
  });
  uit.push('</div>');
  return uit.join('\n');
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

  const nav: [string, string][] = [
    ['doelen', 'Leerdoelen'],
    ['tekst', 'De tekst'],
    ['klank', 'Decodeerapparaat'],
    ['verhalen', 'Woordverhalen'],
    ['grammatica', 'Grammatica'],
    ...(les.valseVrienden.length ? ([['vrienden', 'Valse vrienden']] as [string, string][]) : []),
    ['kaarten', 'Flashcards'],
    ['toets', 'Zelftoets'],
    ['bron', 'Bron'],
  ];

  const secties: string[] = [];
  secties.push(
    sectie('doelen', 'Deze les', 'Wat je aan het eind kunt', `  <ul>\n${les.leerdoelen.map((d) => `    <li>${esc(d)}</li>`).join('\n')}\n  </ul>`),
  );
  const partialNoot = meta.partial
    ? '  <div class="box let"><h4>Onvolledige tekst</h4><p>De bron gaf maar een deel van de songtekst. Plak de hele tekst handmatig voor een volledige les.</p></div>\n'
    : '';
  secties.push(
    sectie('tekst', 'De tekst', 'Regel voor regel', `${partialNoot}  <p>Tik op een onderstreept woord voor betekenis, familie en herkomst.</p>\n${liedHtml(les)}`),
  );
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
            `  <h3>${esc(g.titel)}</h3>\n  <p>${esc(g.uitleg)}</p>\n  <ul class="vb">${g.voorbeelden.map((v) => `<li><span class="de" lang="de">${esc(v.de)}</span> <span class="nl">${esc(v.nl)}</span></li>`).join('')}</ul>`,
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
  secties.push(
    sectie(
      'bron',
      'Bron',
      'Over deze les',
      `  <p>${spotify}Songtekst via ${esc(meta.lyricsSource)}${meta.copyright ? `, ${esc(meta.copyright)}` : ''}. De tekst is auteursrechtelijk beschermd; deze les is alleen voor eigen gebruik.</p>\n  <p>Gemaakt met ${esc(meta.model)} op ${esc(meta.generatedAt.slice(0, 10))}. Etymologie met het label onzeker is niet vastgesteld.</p>`,
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
