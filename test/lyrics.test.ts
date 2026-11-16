import { describe, expect, it } from 'vitest';
import { MusixmatchProvider, ManualLyricsProvider, cleanMusixmatchBody, findLyrics } from '../src/lyrics/index.js';
import { jsonResponse, mockFetch } from './helpers.js';

const track = { title: 'Das Wandern', artist: 'Wilhelm Müller', isrc: 'DEXX12345678' };
const partialBody =
  'Das Wandern ist des Müllers Lust,\nDas Wandern!\n...\n\n******* This Lyrics is NOT for Commercial use *******\n(1409623045093)';
const lyricsEnv = (body: string) => ({
  message: { header: { status_code: 200 }, body: { lyrics: { lyrics_body: body, lyrics_copyright: 'Lyrics powered by www.musixmatch.com.' } } },
});
const notFound = { message: { header: { status_code: 404 }, body: [] } };

describe('cleanMusixmatchBody', () => {
  it('haalt de disclaimer weg en markeert de tekst als onvolledig', () => {
    const r = cleanMusixmatchBody(partialBody);
    expect(r.partial).toBe(true);
    expect(r.text).toBe('Das Wandern ist des Müllers Lust,\nDas Wandern!');
  });
  it('laat een volledige tekst ongemoeid', () => {
    expect(cleanMusixmatchBody('Eins\r\nZwei\n')).toEqual({ text: 'Eins\nZwei', partial: false });
  });
});

describe('MusixmatchProvider', () => {
  it('vindt de tekst via ISRC', async () => {
    const f = mockFetch([['matcher.lyrics.get', () => jsonResponse(lyricsEnv(partialBody))]]);
    const p = new MusixmatchProvider('sleutel', f as unknown as typeof fetch);
    const l = await p.getLyrics(track);
    expect(l).toMatchObject({ partial: true, source: 'musixmatch', copyright: 'Lyrics powered by www.musixmatch.com.' });
    const url = new URL(String(f.mock.calls[0][0]));
    expect(url.searchParams.get('track_isrc')).toBe('DEXX12345678');
    expect(url.searchParams.get('apikey')).toBe('sleutel');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('valt terug op zoeken op artiest en titel', async () => {
    const f = mockFetch([
      ['matcher.lyrics.get', () => jsonResponse(notFound)],
      ['track.search', () => jsonResponse({ message: { header: { status_code: 200 }, body: { track_list: [{ track: { track_id: 1, commontrack_id: 77, has_lyrics: 1 } }] } } })],
      ['track.lyrics.get', (u) => (u.searchParams.get('commontrack_id') === '77' ? jsonResponse(lyricsEnv('Eins\nZwei')) : jsonResponse(notFound))],
    ]);
    const l = await new MusixmatchProvider('k', f as unknown as typeof fetch).getLyrics(track);
    expect(l?.text).toBe('Eins\nZwei');
    expect(l?.partial).toBe(false);
    const search = new URL(String(f.mock.calls[1][0]));
    expect(search.searchParams.get('q_artist')).toBe('Wilhelm Müller');
    expect(search.searchParams.get('q_track')).toBe('Das Wandern');
  });

  it('geeft undefined als niets gevonden wordt', async () => {
    const f = mockFetch([
      ['track.search', () => jsonResponse({ message: { header: { status_code: 200 }, body: { track_list: [] } } })],
    ]);
    const l = await new MusixmatchProvider('k', f as unknown as typeof fetch).getLyrics({ title: 'x', artist: 'y' });
    expect(l).toBeUndefined();
  });

  it('meldt een ontbrekende sleutel duidelijk', async () => {
    await expect(new MusixmatchProvider('').getLyrics(track)).rejects.toThrow(/MUSIXMATCH_API_KEY/);
  });

  it('gooit bij een HTTP-fout', async () => {
    const f = mockFetch([['musixmatch', () => new Response('', { status: 503 })]]);
    await expect(new MusixmatchProvider('k', f as unknown as typeof fetch).getLyrics(track)).rejects.toThrow(/503/);
  });
});

describe('ManualLyricsProvider en findLyrics', () => {
  it('normaliseert geplakte tekst', async () => {
    const l = await new ManualLyricsProvider().getLyrics(track, { text: '  \nEins  \r\n\n\n\nZwei\n' });
    expect(l).toEqual({ text: 'Eins\n\nZwei', partial: false, source: 'handmatig' });
  });
  it('geeft niets bij lege invoer', async () => {
    expect(await new ManualLyricsProvider().getLyrics(track, { text: '   ' })).toBeUndefined();
  });
  it('probeert providers op volgorde', async () => {
    const leeg = { id: 'leeg', getLyrics: async () => undefined };
    const l = await findLyrics([leeg, new ManualLyricsProvider()], track, { text: 'Hallo' });
    expect(l?.source).toBe('handmatig');
  });
});
