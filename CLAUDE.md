# Taalstof: instructies voor Claude

Persoonlijke, lokale webapp die van songteksten Duitse lessen maakt voor Merijn (Nederlandstalig, houdt van etymologie). Alleen eigen gebruik; niets publiceren.

## Commando's
- `npm test` (vitest), `npm run build` (tsc), `npm run dev` (tsx watch). Beide eerste moeten slagen voor elke commit.
- Tests mogen nooit echte API's aanroepen. Geef `fetch` of de Anthropic-client mee als parameter en mock die (zie `test/helpers.ts`). `test/app.test.ts` start de app wel op een vrije lokale poort, met nep-afhankelijkheden.

## Wat een les moet doen
Het doel is Duits leren. Merijn wil geen inleiding, geen algemene achtergrond en geen decodeerapparaat; die zijn eruit. Het hart is `cultuur`, "wat een Duitser erbij hoort": elk stuk hangt aan een zinsnede uit het lied, met `woorden` en soms een `vraag`. Een les legt daarbovenop uit wat een woordenlijst niet geeft:

| Vraag van Merijn | Veld in `Les` |
| --- | --- |
| Waarom staat het er zo? | `gebruik` en het registerlabel `r` per woord, `noot` per regel |
| Hoe is dat zo gekomen? | `etymologie` en `verhalen` per woord, `herkomst` bij grammatica |
| Waar hang ik het aan op? | `cultuur` met `aanleiding`, `woorden`, `vraag` en `kapstok`; `duiding` per strofe |

`voorbeeld/die-gedanken-sind-frei.json` is de met de hand geschreven maatstaf, over een rechtenvrij volkslied. De app toont hem op `/voorbeeld`. `test/voorbeeld.test.ts` bewaakt dat hij op het schema past en intern klopt. Verandert het schema, pas hem dan mee aan.

## Architectuur
- `src/app.ts` Express-routes; `src/server.ts` start op 127.0.0.1. Een les maken is een achtergrondtaak: `POST /api/lesson` geeft meteen een `Job` terug en de pagina vraagt `GET /api/jobs/:id` tot hij klaar is. Twee keer dezelfde les vragen start geen tweede aanroep.
- `src/spotify/client.ts` officiële Web API met PKCE. Alleen metadata. Geen onofficiële lyrics-endpoints gebruiken. De les bedt de officiële speler in.
- `src/lyrics/` `LyricsProvider`-interface. Nieuwe bron = nieuwe klasse + toevoegen in `defaultDeps`. Merijn plakt de tekst zelf; dat is de hoofdroute. Musixmatch doet alleen mee met een sleutel en geeft gratis een deel van de tekst (`partial: true`).
- `src/lesson/schema.ts` type `Les` en `LES_SCHEMA` (elk object `additionalProperties: false`, alle velden required). Houd type en schema gelijk. Het schema is te groot voor de strikte JSON-modus van de API (fout "compiled grammar is too large"); het staat daarom in de systeemprompt en `schemaFouten` controleert het antwoord. `validateLes` gooit alleen als een onderdeel ontbreekt; een woord met een onbekende sleutel of een kapotte toetsvraag ruimt het op.
- `src/lesson/prompt.ts` Nederlandse systeemprompt met stijlregels. Verhoog `PROMPT_VERSIE` bij elke inhoudelijke wijziging, anders blijft de cache oude lessen geven.
- `src/lesson/generator.ts` roept `client.beta.messages.stream` aan met `effort` in `output_config`, zonder `format`, en met `fallbacks: 'default'` voor een geweigerde tekst. Met `onderzoek` gaat alleen `web_search_20260209` mee (hooguit 4 keer; `web_fetch` maakte een les vele malen duurder); bij `pause_turn` gaat de beurt verder, en `bronnen` houdt alleen adressen die in zoekresultaten of geopende pagina's stonden. Kijk eerst naar `stop_reason`, dan pas naar de inhoud. Klopt het antwoord niet met het schema, dan krijgt het model één herkansing met de fouten erbij (`leesLes`). Voortgang gaat via `onProgress`, kosten via `onKosten` (`src/lesson/kosten.ts`, prijzen per model). `cache_control` staat aan op elke aanroep. Merijn let op de prijs: een les kostte eerst $8. Voeg niets toe dat de uitvoer of het zoekwerk flink groter maakt zonder dat te melden.
- `src/render/renderer.ts` + `templates/lesson.css` en `templates/lesson.js`. Stijl: Jugendstil, gekozen door Merijn. Cormorant Garamond cursief voor het Duits en de koppen, Nunito voor knoppen en labels, papier, groenblauw en goud, afgeronde kaarten en knoppen met een schaduwrand zoals Duolingo. Houd het schoon: geen versiering of extra's zonder dat hij erom vraagt. `public/style.css` volgt dezelfde stijl. De vorm van `#lesdata` moet passen bij `lesson.js`: `lex` met `w, nl, fam, chips, geb, ety`, daarnaast `decoder` en `kaarten`. Een regelnoot staat als `data-noot` op de knop. Een herhaalde regel krijgt de woorden van de eerste keer (`vulHerhalingen`). Regels hebben een id `r-<strofe>-<regel>`; de aanleiding van een cultuurstuk linkt ernaartoe (`vindRegel`). Meezingen maakt gaten van woorden uit de les (`meezingHtml`).
- Cache: JSON-bestanden in `data/<namespace>/` via `JsonCache`.

## Stijl van gegenereerde en geschreven Nederlandse tekst
Geen "misschien" of "wellicht", geen gedachtestreepjes, geen driedelige opsommingen, geen "niet X maar Y". Warm en met persoonlijkheid. Etymologie en cultuur alleen stellig waar zeker, anders als onzeker markeren. Dat geldt ook voor de voorbeeldles en de prompt zelf.

## Geheimen
Sleutels alleen in `.env`. `.env`, `data/` en `lessons/` staan in `.gitignore`; nooit committen.
