# Taalstof: instructies voor Claude

Persoonlijke, lokale webapp die van songteksten Duitse lessen maakt voor Merijn (Nederlandstalig, houdt van etymologie). Alleen eigen gebruik; niets publiceren.

## Commando's
- `npm test` (vitest), `npm run build` (tsc), `npm run dev` (tsx watch). Beide eerste moeten slagen voor elke commit.
- Tests mogen nooit echte API's aanroepen. Geef `fetch` of de Anthropic-client mee als parameter en mock die (zie `test/helpers.ts`).

## Architectuur
- `src/app.ts` Express-routes; `src/server.ts` start op 127.0.0.1.
- `src/spotify/client.ts` officiële Web API met PKCE. Alleen metadata. Geen onofficiële lyrics-endpoints gebruiken.
- `src/lyrics/` `LyricsProvider`-interface. Nieuwe bron = nieuwe klasse + toevoegen in `defaultDeps`. Gratis Musixmatch geeft een deel van de tekst (`partial: true`).
- `src/lesson/schema.ts` type `Les` en `LES_SCHEMA` (structured outputs: elk object `additionalProperties: false`, alle velden required). Houd type en schema gelijk.
- `src/lesson/prompt.ts` Nederlandse systeemprompt met stijlregels. Verhoog `PROMPT_VERSIE` bij elke inhoudelijke wijziging, anders blijft de cache oude lessen geven.
- `src/render/renderer.ts` + `templates/lesson.css` en `templates/lesson.js`: stijl en interactie komen uit de handgemaakte voorbeeldles. De vorm van `#lesdata` (lex, decoder, kaarten) moet passen bij `lesson.js`.
- Cache: JSON-bestanden in `data/<namespace>/` via `JsonCache`.

## Stijl van gegenereerde en geschreven Nederlandse tekst
Geen "misschien" of "wellicht", geen gedachtestreepjes, geen driedelige opsommingen, geen "niet X maar Y". Warm en met persoonlijkheid. Etymologie alleen stellig waar zeker, anders als onzeker markeren.

## Geheimen
Sleutels alleen in `.env`. `.env`, `data/` en `lessons/` staan in `.gitignore`; nooit committen.
