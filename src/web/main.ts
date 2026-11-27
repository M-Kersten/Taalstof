import './style.css';
import Anthropic from '@anthropic-ai/sdk';
import { ClaudeLessonGenerator, type Voortgang } from '../lesson/generator.js';
import { bedrag } from '../lesson/kosten.js';
import { isEffort } from '../lesson/instellingen.js';
import { normalizeLyrics } from '../lyrics/manual.js';
import type { Lyrics } from '../lyrics/provider.js';
import { NotLoggedInError, SpotifyClient } from '../spotify/client.js';
import { slug } from '../hash.js';
import type { TrackRef } from '../types.js';
import { appUrl, bewaar, lees, type Instellingen } from './instellingen.js';
import { maakBank, type LesRij, type Lessenbank } from './opslag.js';

// Komt Supabase terug met een fout in het adres, dan lezen we die voor de client hem weghaalt.
const terugHash = new URLSearchParams(location.hash.slice(1));

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, tekst?: string, klasse?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (tekst != null) e.textContent = tekst;
  if (klasse) e.className = klasse;
  return e;
}

function knop(tekst: string, doe: () => unknown, klasse = 'linkknop'): HTMLButtonElement {
  const b = el('button', tekst, klasse);
  b.type = 'button';
  b.addEventListener('click', () => void doe());
  return b;
}

function link(tekst: string, href: string): HTMLAnchorElement {
  const a = el('a', tekst, 'btn klein');
  a.href = href;
  return a;
}

function zeg(plek: string, tekst: string, extra?: Node): void {
  const p = $(plek);
  p.textContent = tekst;
  if (extra) p.append(' ', extra);
}
const melding = (t: string, extra?: Node) => zeg('#melding', t, extra);
const zoekMelding = (t: string, extra?: Node) => zeg('#zoek-melding', t, extra);

function fouttekst(e: unknown): string {
  if (e instanceof Anthropic.APIError && e.status === 401) return 'Claude kent deze sleutel niet. Kijk bij Instellingen.';
  return e instanceof Error ? e.message : String(e);
}

const lesUrl = (id: string) => new URL(`les.html?id=${encodeURIComponent(id)}`, appUrl()).href;

const MODELNAAM: Record<string, string> = { 'claude-opus-5-5': 'Opus 5.5', 'claude-sonnet-5-5': 'Sonnet 5.5' };
const DENKEN: Record<string, string> = {
  low: 'weinig nadenken',
  medium: 'gemiddeld nadenken',
  high: 'grondig nadenken',
  xhigh: 'heel grondig nadenken',
  max: 'zo grondig als kan',
};

let inst: Instellingen = lees();
let bank: Lessenbank | null = maakBank(inst);
let spotify = maakSpotify();
let spotifyIn = false;
let email: string | null = null;
let gekozen: TrackRef | null = null;
let bezig = false;

function maakSpotify(): SpotifyClient {
  return new SpotifyClient(inst.spotifyClientId, appUrl(), localStorage);
}

/* ---------- Status bovenaan ---------- */

function stip(m: HTMLElement, label: string, ok: boolean, extra?: Node): void {
  const s = el('span', `${ok ? '✓' : '✗'} ${label}`, ok ? 'ok' : 'fout');
  if (extra) s.append(' ', extra);
  m.append(s);
}

function toonStatus(): void {
  const m = $('#status');
  m.textContent = '';
  stip(m, 'Claude-sleutel', !!inst.anthropicKey);
  if (!bank) stip(m, 'geen Supabase', false);
  else if (email) stip(m, email, true, knop('uitloggen', () => bank?.uitloggen()));
  else stip(m, 'niet ingelogd voor je lessen', false);
  if (spotifyIn)
    stip(m, 'Spotify', true, knop('uitloggen', () => {
      spotify.uitloggen();
      spotifyIn = false;
      toonStatus();
    }));
  else m.append(knop('Inloggen bij Spotify', spotifyLogin));
  m.append(el('span', [MODELNAAM[inst.model] ?? inst.model, DENKEN[inst.effort], inst.onderzoek ? 'zoekt op het web' : ''].filter(Boolean).join(', ')));
  $('#inloggen').hidden = !bank || !!email;
}

/* ---------- Instellingen ---------- */

const form = $<HTMLFormElement>('#inst-form');
const veld = <T extends HTMLInputElement | HTMLSelectElement>(naam: string) => form.elements.namedItem(naam) as T;

/** Een waarde die niet in de lijst staat (een ander model bijvoorbeeld) blijft kiesbaar. */
function kies(select: HTMLSelectElement, waarde: string): void {
  if (![...select.options].some((o) => o.value === waarde)) select.add(new Option(waarde, waarde));
  select.value = waarde;
}

function vulFormulier(): void {
  for (const k of ['anthropicKey', 'spotifyClientId', 'supabaseUrl', 'supabaseKey'] as const) veld<HTMLInputElement>(k).value = inst[k];
  kies(veld<HTMLSelectElement>('model'), inst.model);
  kies(veld<HTMLSelectElement>('effort'), inst.effort);
  veld<HTMLInputElement>('onderzoek').checked = inst.onderzoek;
}

function openInstellingen(): void {
  const d = $<HTMLDetailsElement>('#instellingen');
  d.open = true;
  d.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

form.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const oud = inst;
  const effort = veld<HTMLSelectElement>('effort').value;
  bewaar({
    anthropicKey: veld<HTMLInputElement>('anthropicKey').value.trim(),
    model: veld<HTMLSelectElement>('model').value,
    effort: isEffort(effort) ? effort : oud.effort,
    onderzoek: veld<HTMLInputElement>('onderzoek').checked,
    spotifyClientId: veld<HTMLInputElement>('spotifyClientId').value.trim(),
    supabaseUrl: veld<HTMLInputElement>('supabaseUrl').value.trim(),
    supabaseKey: veld<HTMLInputElement>('supabaseKey').value.trim(),
  });
  // Opnieuw lezen: een leeg veld valt terug op wat in de build staat.
  inst = lees();
  vulFormulier();
  if (inst.spotifyClientId !== oud.spotifyClientId) spotify = maakSpotify();
  if (inst.supabaseUrl !== oud.supabaseUrl || inst.supabaseKey !== oud.supabaseKey) {
    bank = maakBank(inst);
    volgBank();
  }
  zeg('#inst-melding', 'Bewaard.');
  toonStatus();
});

/* ---------- Inloggen bij Supabase ---------- */

$<HTMLFormElement>('#inlog-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (!bank) return;
  const adres = $<HTMLInputElement>('#inlog-email').value.trim();
  zeg('#inlog-melding', 'Link sturen…');
  try {
    await bank.stuurLink(adres, appUrl());
    zeg('#inlog-melding', 'Kijk in je mail en open de link op dit apparaat.');
  } catch (e) {
    zeg('#inlog-melding', fouttekst(e));
  }
});

/** Volgt het inloggen bij Supabase, ook als dat in een ander tabblad gebeurt. */
function volgBank(): void {
  email = null;
  if (!bank) {
    toonStatus();
    void toonLessen();
    return;
  }
  let bekend = false;
  const deze = bank;
  deze.sb.auth.onAuthStateChange((_soort, sessie) => {
    if (deze !== bank) return;
    const nieuw = sessie?.user.email ?? null;
    if (bekend && nieuw === email) return;
    bekend = true;
    email = nieuw;
    // Supabase wil geen eigen aanroepen binnen deze callback; daarom even later.
    setTimeout(() => {
      toonStatus();
      void toonLessen();
      void bewaarAchterstallig();
    }, 0);
  });
}

/* ---------- Spotify ---------- */

async function spotifyLogin(): Promise<void> {
  try {
    location.assign(await spotify.authorizeUrl());
  } catch (e) {
    zoekMelding(fouttekst(e));
    openInstellingen();
  }
}

/** Spotify stuurt na het inloggen terug naar de app met ?code en ?state in het adres. */
async function spotifyTerug(): Promise<void> {
  const q = new URLSearchParams(location.search);
  if (!q.has('code') && !q.has('error')) return;
  const state = q.get('state') ?? '';
  history.replaceState(null, '', appUrl());
  if (!spotify.wachtOp(state)) return zoekMelding('Inloggen bij Spotify is verlopen. Probeer het opnieuw.');
  if (q.has('error')) return zoekMelding(`Spotify gaf geen toegang (${q.get('error')}).`);
  try {
    await spotify.handleCallback(q.get('code')!, state);
  } catch (e) {
    zoekMelding(fouttekst(e));
  }
}

async function spotifyLijst(haal: () => Promise<void>): Promise<void> {
  zoekMelding('');
  try {
    await haal();
  } catch (e) {
    if (e instanceof NotLoggedInError) {
      spotifyIn = false;
      toonStatus();
      return zoekMelding('Log eerst in bij Spotify.', knop('Inloggen bij Spotify', spotifyLogin, 'btn klein'));
    }
    zoekMelding(fouttekst(e));
  }
}

function lijstKnop(titel: string, onder: string | undefined, beeld: string | undefined, doe: () => unknown): HTMLLIElement {
  const li = el('li');
  const b = knop('', doe, '');
  if (beeld) {
    const img = el('img');
    img.src = beeld;
    img.alt = '';
    b.append(img);
  }
  const s = el('span', titel);
  if (onder) s.append(el('small', onder));
  b.append(s);
  li.append(b);
  return li;
}

function toonTracks(tracks: TrackRef[]): void {
  const ul = $('#lijst');
  ul.textContent = '';
  if (!tracks.length) return void ul.append(el('li', 'Niets gevonden.'));
  for (const t of tracks) ul.append(lijstKnop(t.title, t.artist, t.imageUrl, () => kiesLied(t)));
}

async function toonPlaylists(): Promise<void> {
  const ul = $('#lijst');
  ul.textContent = '';
  for (const p of await spotify.playlists())
    ul.append(
      lijstKnop(p.name, p.total != null ? `${p.total} nummers` : undefined, p.imageUrl, () =>
        spotifyLijst(async () => toonTracks(await spotify.playlistTracks(p.id))),
      ),
    );
}

$<HTMLFormElement>('#zoek-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const q = $<HTMLInputElement>('#zoek-q').value.trim();
  if (q) void spotifyLijst(async () => toonTracks(await spotify.search(q)));
});

document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((t) =>
  t.addEventListener('click', () => {
    document.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-pressed', String(x === t)));
    $('#zoek-form').hidden = t.dataset.tab !== 'zoek';
    $('#lijst').textContent = '';
    if (t.dataset.tab === 'recent') void spotifyLijst(async () => toonTracks(await spotify.recent()));
    if (t.dataset.tab === 'playlists') void spotifyLijst(toonPlaylists);
  }),
);

function kiesLied(t: TrackRef): void {
  gekozen = t;
  $('#gekozen').hidden = false;
  $('#g-titel').textContent = t.title;
  $('#g-artiest').textContent = t.artist;
  const sp = $<HTMLAnchorElement>('#g-spotify');
  sp.hidden = !t.spotifyUrl;
  if (t.spotifyUrl) sp.href = t.spotifyUrl;
  $<HTMLTextAreaElement>('#plak').value = '';
  if (!bezig) melding('');
  $('#gekozen').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  $<HTMLTextAreaElement>('#plak').focus({ preventScroll: true });
}

/* ---------- Een les maken ---------- */

function duur(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function voortgang(titel: string, v: Voortgang, ms: number, kosten?: string): string {
  const t = duur(ms);
  const zoek = v.zoekopdrachten ? ` Al ${v.zoekopdrachten} keer gezocht.` : '';
  const prijs = kosten ? ` Tot nu toe ${kosten}.` : '';
  if (v.tekens > 400) return `${titel}: Claude schrijft de les.${zoek} ${v.tekens.toLocaleString('nl-NL')} tekens, ${t} bezig.${prijs}`;
  if (v.zoekopdrachten) return `${titel}: Claude zoekt uit wat er achter het lied zit.${zoek} ${t} bezig.${prijs}`;
  return `${titel}: Claude denkt na over het lied. ${t} bezig. Een nieuwe les duurt een paar minuten; laat deze pagina zo lang open.${prijs}`;
}

/** Een telefoon die op slot gaat, breekt de verbinding met Claude af. */
async function houWakker(): Promise<WakeLockSentinel | undefined> {
  try {
    return await navigator.wakeLock?.request('screen');
  } catch {
    return undefined;
  }
}

const ONBEWAARD = 'taalstof-onbewaard';

function leesOnbewaard(): Record<string, LesRij> {
  try {
    return JSON.parse(localStorage.getItem(ONBEWAARD) ?? '{}') as Record<string, LesRij>;
  } catch {
    return {};
  }
}

function schrijfOnbewaard(rijen: Record<string, LesRij>): void {
  try {
    if (Object.keys(rijen).length) localStorage.setItem(ONBEWAARD, JSON.stringify(rijen));
    else localStorage.removeItem(ONBEWAARD);
  } catch {
    /* vol of geblokkeerd */
  }
}

/** Een betaalde les mag niet verloren gaan. Lukt bewaren niet, dan blijft hij in de browser staan. */
async function bewaarRij(b: Lessenbank, rij: LesRij): Promise<void> {
  try {
    await b.bewaar(rij);
  } catch (e) {
    schrijfOnbewaard({ ...leesOnbewaard(), [rij.id]: rij });
    throw new Error(`${fouttekst(e)} De les staat nog in deze browser en gaat alsnog naar Supabase zodra dat lukt.`);
  }
}

async function bewaarAchterstallig(): Promise<void> {
  if (!bank || !email) return;
  const rijen = leesOnbewaard();
  const ids = Object.keys(rijen);
  if (!ids.length) return;
  for (const id of ids) {
    try {
      await bank.bewaar(rijen[id]);
      delete rijen[id];
    } catch {
      /* volgende keer */
    }
  }
  schrijfOnbewaard(rijen);
  void toonLessen();
}

async function maakLes(): Promise<void> {
  if (!gekozen || bezig) return;
  const track = gekozen;
  const plak = $<HTMLTextAreaElement>('#plak');
  const text = normalizeLyrics(plak.value);
  if (!text) {
    melding('Plak eerst de songtekst.');
    return plak.focus();
  }
  if (!inst.anthropicKey) {
    melding('Vul eerst je Claude-sleutel in bij Instellingen.');
    return openInstellingen();
  }
  if (!bank) {
    melding('Vul eerst de Supabase-gegevens in bij Instellingen, anders kan de les nergens heen.');
    return openInstellingen();
  }
  if (!email) {
    melding('Log eerst in, anders kan de les nergens heen.');
    return $('#inloggen').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  const b = bank;
  const lyrics: Lyrics = { text, partial: false, source: 'handmatig' };
  const generator = new ClaudeLessonGenerator({
    apiKey: inst.anthropicKey,
    model: inst.model,
    effort: inst.effort,
    onderzoek: inst.onderzoek,
  });
  const maakKnop = $<HTMLButtonElement>('#maak');
  bezig = true;
  maakKnop.disabled = true;
  let kosten: string | undefined;
  let klok: ReturnType<typeof setInterval> | undefined;
  const wakker = await houWakker();
  try {
    const sleutel = await generator.sleutel(track, lyrics);
    // Dezelfde tekst met dezelfde instellingen is dezelfde les: niet nog eens betalen.
    const eerder = await b.metSleutel(sleutel);
    if (eerder) return melding(`Deze les had je al: ${eerder.titel}.`, link('Open de les', lesUrl(eerder.id)));
    const id = `${slug(`${track.artist}-${track.title}`)}-${sleutel.slice(0, 6)}`;
    const stand: Voortgang = { tekens: 0, zoekopdrachten: 0 };
    const gestart = Date.now();
    const toon = () => melding(voortgang(track.title, stand, Date.now() - gestart, kosten));
    toon();
    klok = setInterval(toon, 1000);
    const les = await generator.generate(track, lyrics, {
      onProgress: (v) => Object.assign(stand, v),
      onKosten: (k) => (kosten = bedrag(k)),
    });
    clearInterval(klok);
    await bewaarRij(b, {
      id,
      sleutel,
      titel: les.titel,
      track,
      les,
      meta: { model: inst.model, generatedAt: new Date().toISOString(), bedrag: kosten, lyricsSource: lyrics.source, partial: lyrics.partial },
    });
    melding(`Klaar: ${les.titel}.${kosten ? ` Kosten: ${kosten}.` : ''}`, link('Open de les', lesUrl(id)));
    void toonLessen();
  } catch (e) {
    melding(`Mislukt: ${fouttekst(e)}${kosten ? ` Kosten tot nu toe: ${kosten}.` : ''}`);
  } finally {
    clearInterval(klok);
    void wakker?.release();
    bezig = false;
    maakKnop.disabled = false;
  }
}

$('#maak').addEventListener('click', () => void maakLes());

addEventListener('beforeunload', (ev) => {
  if (bezig) ev.preventDefault();
});

/* ---------- Mijn lessen ---------- */

async function toonLessen(): Promise<void> {
  const ul = $('#lessen');
  const regel = (t: string) => {
    ul.textContent = '';
    ul.append(el('li', t, 'muted'));
  };
  if (!bank) return regel('Vul bij Instellingen de Supabase-gegevens in, dan worden je lessen bewaard.');
  if (!email) return regel('Log in om je lessen te zien.');
  try {
    const rijen = await bank.lijst();
    ul.textContent = '';
    if (!rijen.length) return regel('Nog geen lessen.');
    for (const r of rijen) {
      const li = el('li', undefined, 'les');
      const tekst = el('div');
      const a = el('a', r.titel);
      a.href = lesUrl(r.id);
      tekst.append(a, el('small', `${r.track.title}, ${r.track.artist}`));
      li.append(
        tekst,
        knop('wis', async () => {
          if (!confirm(`De les "${r.titel}" wissen?`)) return;
          try {
            await bank?.wis(r.id);
          } catch (e) {
            alert(fouttekst(e));
          }
          void toonLessen();
        }),
      );
      ul.append(li);
    }
  } catch (e) {
    regel(fouttekst(e));
  }
}

/* ---------- Start ---------- */

async function start(): Promise<void> {
  vulFormulier();
  if (!inst.anthropicKey || !bank) $<HTMLDetailsElement>('#instellingen').open = true;
  const fout = terugHash.get('error_description');
  if (fout) {
    history.replaceState(null, '', appUrl());
    zeg('#inlog-melding', `Inloggen lukte niet: ${fout}. Vraag een nieuwe link aan.`);
  }
  await spotifyTerug();
  spotifyIn = await spotify.isLoggedIn();
  toonStatus();
  volgBank();
}

void start();
