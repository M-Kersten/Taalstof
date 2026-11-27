/** Datamodel van een les. Het JSON-schema hieronder moet hiermee overeenkomen. */

export type ChipSoort = 'k' | 'g' | 'l' | 'r'; // klankregel, grammatica, leenwoord, register
export type Zekerheid = 'zeker' | 'onzeker';

export interface Woord {
  sleutel: string;
  woord: string; // woordenboekvorm, met lidwoord bij zelfstandige naamwoorden
  betekenis: string;
  nlVerwant: string; // leeg als er geen is
  enVerwant: string;
  klankverschuiving: string; // bijvoorbeeld "t → ss", leeg als geen
  /** Waarom dit woord hier staat, in deze vorm: register, gevoelswaarde, vaste verbinding, naamval. */
  gebruik: string;
  /** Hoe het woord zo gekomen is. */
  etymologie: string;
  zekerheid: Zekerheid;
  labels: { soort: ChipSoort; tekst: string }[];
}

export interface Regel {
  de: string;
  nl: string;
  /** Woorden in volgorde van voorkomen; tekst is exact zoals in `de`. */
  woorden: { tekst: string; sleutel: string }[];
  /** Waarom de regel zo gebouwd is: woordvolgorde, uitdrukking, woordspeling. Leeg als er niets te melden valt. */
  noot: string;
}

/** Een vraag om eerst te raden. Een lege `vraag` betekent: geen vraag. */
export interface Denkvraag {
  vraag: string;
  opties: string[];
  goed: number;
  uitleg: string;
}

/**
 * Wat een Duitser bij de tekst weet of voelt. `aanleiding` is de zinsnede uit het lied waar het
 * aan hangt, `kapstok` knoopt het vast aan iets uit de les, `woorden` zijn sleutels uit de woordenlijst.
 */
export interface Cultuur {
  titel: string;
  aanleiding: string;
  tekst: string;
  kapstok: string;
  woorden: string[];
  vraag: Denkvraag;
  zekerheid: Zekerheid;
}

export interface Strofe {
  naam: string;
  /** Eén gewone zin waarmee dit couplet begint in de les, als opstapje. */
  inleiding: string;
  /** Wat er in deze strofe gebeurt en waarom de maker het zo schreef. Opent het deel "erachter". */
  duiding: string;
  regels: Regel[];
}

export interface Les {
  titel: string;
  lied: { titel: string; artiest: string };
  /** Pagina's die het model tijdens het onderzoek echt gezien heeft. */
  bronnen: { titel: string; url: string }[];
  leerdoelen: string[];
  strofen: Strofe[];
  woordenlijst: Woord[];
  /** Wat een Duitser bij de tekst weet of voelt. `kapstok` knoopt het vast aan iets uit de les. */
  cultuur: Cultuur[];
  verhalen: { woord: string; titel: string; tekst: string; zekerheid: Zekerheid }[];
  /** `uitleg` zegt wat de vorm doet en waarom het lied hem nodig heeft, `herkomst` hoe het zo gekomen is. */
  grammatica: { titel: string; uitleg: string; herkomst: string; voorbeelden: { de: string; nl: string }[] }[];
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

const denkvraag = obj({ vraag: str, opties: arr(str), goed: { type: 'integer' }, uitleg: str });

export const LES_SCHEMA = obj({
  titel: str,
  lied: obj({ titel: str, artiest: str }),
  bronnen: arr(obj({ titel: str, url: str })),
  leerdoelen: arr(str),
  strofen: arr(
    obj({
      naam: str,
      inleiding: str,
      duiding: str,
      regels: arr(obj({ de: str, nl: str, woorden: arr(obj({ tekst: str, sleutel: str })), noot: str })),
    }),
  ),
  woordenlijst: arr(
    obj({
      sleutel: str,
      woord: str,
      betekenis: str,
      nlVerwant: str,
      enVerwant: str,
      klankverschuiving: str,
      gebruik: str,
      etymologie: str,
      zekerheid,
      labels: arr(obj({ soort: { type: 'string', enum: ['k', 'g', 'l', 'r'] }, tekst: str })),
    }),
  ),
  cultuur: arr(obj({ titel: str, aanleiding: str, tekst: str, kapstok: str, woorden: arr(str), vraag: denkvraag, zekerheid })),
  verhalen: arr(obj({ woord: str, titel: str, tekst: str, zekerheid })),
  grammatica: arr(obj({ titel: str, uitleg: str, herkomst: str, voorbeelden: arr(obj({ de: str, nl: str })) })),
  valseVrienden: arr(obj({ duits: str, lijktOp: str, betekent: str, toelichting: str })),
  kaarten: arr(obj({ voor: str, betekenis: str, familie: str, regel: str, tekst: str })),
  toets: arr(obj({ vraag: str, opties: arr(str), goed: { type: 'integer' }, toelichting: str })),
});

/**
 * Controleert een waarde tegen het deel van JSON Schema dat LES_SCHEMA gebruikt.
 * Geeft een lijst met afwijkingen, leeg als alles klopt.
 */
export function schemaFouten(schema: any, waarde: unknown, pad = '$'): string[] {
  if (schema.enum) return schema.enum.includes(waarde) ? [] : [`${pad}: niet een van ${schema.enum.join(', ')}`];
  if (schema.type === 'string') return typeof waarde === 'string' ? [] : [`${pad}: geen tekst`];
  if (schema.type === 'integer') return Number.isInteger(waarde) ? [] : [`${pad}: geen geheel getal`];
  if (schema.type === 'array') {
    if (!Array.isArray(waarde)) return [`${pad}: geen lijst`];
    return waarde.flatMap((v, i) => schemaFouten(schema.items, v, `${pad}[${i}]`));
  }
  if (schema.type === 'object') {
    if (!waarde || typeof waarde !== 'object' || Array.isArray(waarde)) return [`${pad}: geen object`];
    const obj = waarde as Record<string, unknown>;
    const keys = Object.keys(obj);
    return [
      ...schema.required.filter((k: string) => !keys.includes(k)).map((k: string) => `${pad}.${k}: ontbreekt`),
      ...keys.filter((k) => !(k in schema.properties)).map((k) => `${pad}.${k}: onbekend veld`),
      ...keys.filter((k) => k in schema.properties).flatMap((k) => schemaFouten(schema.properties[k], obj[k], `${pad}.${k}`)),
    ];
  }
  return [`${pad}: onbekend schema`];
}

const LIJSTEN = [
  'bronnen',
  'leerdoelen',
  'strofen',
  'woordenlijst',
  'cultuur',
  'verhalen',
  'grammatica',
  'valseVrienden',
  'kaarten',
  'toets',
] as const;

/**
 * Lichte controle op wat het model teruggeeft. Gooit als een onderdeel ontbreekt.
 * Losse eindjes gooien een betaalde les niet weg: een woord dat naar een onbekende
 * sleutel wijst wordt gewone tekst, een toetsvraag zonder geldig antwoord vervalt.
 */
export function validateLes(x: unknown): Les {
  const l = x as Les;
  const fout = (m: string): never => {
    throw new Error(`Ongeldige les: ${m}`);
  };
  if (!l || typeof l !== 'object') fout('geen object');
  for (const k of LIJSTEN) if (!Array.isArray(l[k])) fout(`${k} ontbreekt`);
  for (const s of l.strofen) if (!Array.isArray(s?.regels)) fout('strofe zonder regels');
  if (!l.strofen.some((s) => s.regels.length)) fout('geen regels in de tekst');

  const sleutels = new Set(l.woordenlijst.map((w) => w.sleutel));
  for (const s of l.strofen) {
    for (const r of s.regels) r.woorden = (r.woorden ?? []).filter((w) => sleutels.has(w.sleutel));
  }
  const geldig = (v: { goed: number; opties: string[] }) => Number.isInteger(v.goed) && v.goed >= 0 && v.goed < v.opties.length;
  l.toets = l.toets.filter(geldig);
  for (const c of l.cultuur) {
    c.woorden = (c.woorden ?? []).filter((k) => sleutels.has(k));
    if (!c.vraag || (c.vraag.vraag && !geldig(c.vraag))) c.vraag = { vraag: '', opties: [], goed: 0, uitleg: '' };
  }
  l.bronnen = l.bronnen.filter((b) => /^https?:\/\//.test(b.url));
  return l;
}
