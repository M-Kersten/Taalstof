/** Datamodel van een les. Het JSON-schema hieronder moet hiermee overeenkomen. */

export type ChipSoort = 'k' | 'g' | 'l'; // klankregel, grammatica, leenwoord
export type Zekerheid = 'zeker' | 'onzeker';

export interface Woord {
  sleutel: string;
  woord: string; // woordenboekvorm, met lidwoord bij zelfstandige naamwoorden
  betekenis: string;
  nlVerwant: string; // leeg als er geen is
  enVerwant: string;
  klankverschuiving: string; // bijvoorbeeld "t → ss", leeg als geen
  uitleg: string;
  etymologie: string;
  zekerheid: Zekerheid;
  labels: { soort: ChipSoort; tekst: string }[];
}

export interface Regel {
  de: string;
  nl: string;
  /** Woorden in volgorde van voorkomen; tekst is exact zoals in `de`. */
  woorden: { tekst: string; sleutel: string }[];
}

export interface Les {
  titel: string;
  lead: string;
  lied: { titel: string; artiest: string };
  leerdoelen: string[];
  strofen: { regels: Regel[] }[];
  woordenlijst: Woord[];
  klankverschuivingen: { regel: string; uitleg: string; voorbeelden: string[] }[];
  decoder: {
    groep: string;
    woorden: { nl: string; en: string; de: string; stappen: { regel: string; vorm: string }[]; noot: string }[];
  }[];
  verhalen: { woord: string; titel: string; tekst: string; zekerheid: Zekerheid }[];
  grammatica: { titel: string; uitleg: string; voorbeelden: { de: string; nl: string }[] }[];
  valseVrienden: { duits: string; lijktOp: string; betekent: string; toelichting: string }[];
  kaarten: { voor: string; betekenis: string; familie: string; regel: string; tekst: string }[];
  toets: { vraag: string; opties: string[]; goed: number; toelichting: string }[];
}

const str = { type: 'string' } as const;
const zekerheid = { type: 'string', enum: ['zeker', 'onzeker'] } as const;
function obj(properties: Record<string, unknown>) {
  return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties };
}
function arr(items: unknown) {
  return { type: 'array', items };
}

export const LES_SCHEMA = obj({
  titel: str,
  lead: str,
  lied: obj({ titel: str, artiest: str }),
  leerdoelen: arr(str),
  strofen: arr(obj({ regels: arr(obj({ de: str, nl: str, woorden: arr(obj({ tekst: str, sleutel: str })) })) })),
  woordenlijst: arr(
    obj({
      sleutel: str,
      woord: str,
      betekenis: str,
      nlVerwant: str,
      enVerwant: str,
      klankverschuiving: str,
      uitleg: str,
      etymologie: str,
      zekerheid,
      labels: arr(obj({ soort: { type: 'string', enum: ['k', 'g', 'l'] }, tekst: str })),
    }),
  ),
  klankverschuivingen: arr(obj({ regel: str, uitleg: str, voorbeelden: arr(str) })),
  decoder: arr(
    obj({
      groep: str,
      woorden: arr(obj({ nl: str, en: str, de: str, stappen: arr(obj({ regel: str, vorm: str })), noot: str })),
    }),
  ),
  verhalen: arr(obj({ woord: str, titel: str, tekst: str, zekerheid })),
  grammatica: arr(obj({ titel: str, uitleg: str, voorbeelden: arr(obj({ de: str, nl: str })) })),
  valseVrienden: arr(obj({ duits: str, lijktOp: str, betekent: str, toelichting: str })),
  kaarten: arr(obj({ voor: str, betekenis: str, familie: str, regel: str, tekst: str })),
  toets: arr(obj({ vraag: str, opties: arr(str), goed: { type: 'integer' }, toelichting: str })),
});

/** Lichte controle op wat het model teruggeeft; gooit bij een kapotte les. */
export function validateLes(x: unknown): Les {
  const l = x as Les;
  const fout = (m: string) => {
    throw new Error(`Ongeldige les: ${m}`);
  };
  if (!l || typeof l !== 'object') fout('geen object');
  for (const k of ['strofen', 'woordenlijst', 'decoder', 'kaarten', 'toets'] as const) {
    if (!Array.isArray(l[k])) fout(`${k} ontbreekt`);
  }
  const sleutels = new Set(l.woordenlijst.map((w) => w.sleutel));
  for (const s of l.strofen)
    for (const r of s.regels) for (const w of r.woorden) if (!sleutels.has(w.sleutel)) fout(`onbekende sleutel ${w.sleutel}`);
  for (const t of l.toets) if (!(t.goed >= 0 && t.goed < t.opties.length)) fout(`toetsvraag zonder geldig antwoord: ${t.vraag}`);
  return l;
}
