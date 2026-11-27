import { describe, expect, it } from 'vitest';
import { ManualLyricsProvider, normalizeLyrics } from '../src/lyrics/index.js';

const track = { title: 'Das Wandern', artist: 'Wilhelm Müller' };

describe('ManualLyricsProvider', () => {
  it('normaliseert geplakte tekst', async () => {
    const l = await new ManualLyricsProvider().getLyrics(track, { text: '  \nEins  \r\n\n\n\nZwei\n' });
    expect(l).toEqual({ text: 'Eins\n\nZwei', partial: false, source: 'handmatig' });
  });
  it('geeft niets bij lege invoer', async () => {
    expect(await new ManualLyricsProvider().getLyrics(track, { text: '   ' })).toBeUndefined();
  });
  it('laat kopjes en lege regels tussen coupletten staan', () => {
    expect(normalizeLyrics('[Refrain]\r\nEins\r\n\r\nZwei')).toBe('[Refrain]\nEins\n\nZwei');
  });
});
