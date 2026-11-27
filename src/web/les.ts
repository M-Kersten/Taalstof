import { renderLesson } from '../render/renderer.js';
import { validateLes, type Les } from '../lesson/schema.js';
import voorbeeld from '../../voorbeeld/die-gedanken-sind-frei.json';
import { appUrl, lees } from './instellingen.js';
import { maakBank } from './opslag.js';

/** Een les is één los HTML-document; dat komt in de plaats van deze laadpagina. */
function toon(html: string): void {
  document.open();
  document.write(html);
  document.close();
}

function meld(tekst: string): void {
  const p = document.getElementById('les-status')!;
  p.textContent = `${tekst} `;
  const a = document.createElement('a');
  a.href = appUrl();
  a.textContent = 'Naar Taalstof';
  p.appendChild(a);
}

async function start(): Promise<void> {
  const q = new URLSearchParams(location.search);
  const terug = appUrl();
  if (q.has('voorbeeld')) {
    const les = validateLes(structuredClone(voorbeeld) as unknown as Les);
    toon(
      renderLesson(les, {
        id: 'voorbeeld',
        track: { title: les.lied.titel, artist: les.lied.artiest },
        lyricsSource: 'publiek domein',
        partial: false,
        model: '',
        generatedAt: '',
        voorbeeld: true,
        terug,
      }),
    );
    return;
  }
  const id = q.get('id');
  if (!id) return meld('Welke les? Er staat geen les in het adres.');
  const bank = maakBank(lees());
  if (!bank) return meld('Supabase is nog niet ingesteld.');
  if (!(await bank.email())) return meld('Log eerst in om je lessen te zien.');
  const rij = await bank.haal(id);
  if (!rij) return meld('Deze les bestaat niet, of hij is gewist.');
  toon(
    renderLesson(validateLes(rij.les), {
      id: rij.id,
      track: rij.track,
      lyricsSource: rij.meta.lyricsSource,
      partial: rij.meta.partial,
      model: rij.meta.model,
      generatedAt: rij.meta.generatedAt,
      bedrag: rij.meta.bedrag,
      terug,
    }),
  );
}

start().catch((e: unknown) => meld(`Laden mislukte: ${e instanceof Error ? e.message : String(e)}.`));
