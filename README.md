# Taalstof

Taalstof maakt van songteksten Duitse taallessen. Je kiest een nummer uit je eigen Spotify, plakt de songtekst erbij en Claude bouwt er een les van. Het doel is Duits leren. Het middel is het verhaal van het lied: Claude zoekt uit wie het schreef en waarom de tekst is zoals hij is, en vertelt dat als een verhaal waar de Duitse woorden aan vastzitten. Een woord dat aan een verhaal hangt, onthoud je.

Het is een kleine webapp die alleen op je eigen machine draait, op `http://127.0.0.1`. Elke les is een los HTML-bestand in `lessons/`, dat je ook zonder de server kunt openen.

## Wat er in een les zit

| Onderdeel | Wat je krijgt |
| --- | --- |
| Het verhaal | Hoe het lied ontstond en waarom de tekst zo is, in korte hoofdstukken. Elk hoofdstuk hangt aan woorden uit het lied, die je aantikt voor hun betekenis. Soms raad je eerst voor je verder leest, en een citaat brengt je naar de regel in het lied |
| De tekst | Elke regel klikbaar. Per woord de betekenis en de familie, met daaronder waarom het hier zo staat en waar het vandaan komt. Achter sommige regels staat *waarom?* voor wat aan de hele regel hangt, zoals woordvolgorde of een uitdrukking. Per strofe vertelt **Waarom deze strofe** wat erin gebeurt. Komt het nummer van Spotify, dan staat de speler erboven |
| Meezingen | De tekst met gaten. Zet het lied op en vul in wat je hoort |
| Cultuur | Wat een Duitser bij de tekst weet of voelt. Elk stuk eindigt met een kapstok die het vastknoopt aan een woord of regel uit de les |
| Decodeerapparaat | De klankschuiven uit het lied, en Nederlandse woorden die je er zelf mee omzet |
| Woordverhalen | De herkomst van de mooiste woorden |
| Grammatica | Wat het lied nodig heeft, met erbij hoe het zo gekomen is |
| Valse vrienden | Woorden die op Nederlands lijken en iets anders betekenen |
| Flashcards en zelftoets | Oefenen, met het verhaal op de achterkant. Bij de toets staat wat je na de les moet kunnen |
| Bron | De pagina's waar het verhaal op steunt |

Eerst zien hoe dat eruitziet? Start de app en open `http://127.0.0.1:8787/voorbeeld`. Die voorbeeldles over *Die Gedanken sind frei* werkt zonder sleutels.

Voor het verhaal doorzoekt Claude het web: interviews, kranten, Wikipedia, de site van de artiest. Onder **Bron** staan alleen pagina's die het tijdens het maken echt gezien heeft. Een adres dat het uit zijn geheugen noemt, laat Taalstof weg. De herkomst van losse woorden komt wel uit het geheugen van het model; wat niet vaststaat, krijgt het label onzeker. Bij een onbekend lied is het verhaal korter.

## Wat je nodig hebt

Node.js 20 of nieuwer, plus twee sleutels: Spotify en Anthropic. Kopieer eerst het voorbeeld:

```sh
cp .env.example .env
```

### Spotify-app

1. Ga naar het [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) en log in.
2. Kies **Create app**. Naam en beschrijving mag je zelf kiezen.
3. Vul bij **Redirect URIs** precies dit in, met de poort uit je `.env` (standaard 8787):
   `http://127.0.0.1:8787/callback`
   Spotify accepteert `localhost` niet meer, gebruik dus `127.0.0.1`.
4. Vink **Web API** aan en sla op.
5. Kopieer de **Client ID** naar `SPOTIFY_CLIENT_ID`. Een client secret is niet nodig: Taalstof gebruikt PKCE.

Een app in development mode werkt alleen voor accounts die je onder **User Management** toevoegt. Zet je eigen Spotify-account daar neer.

Spotify levert zelf geen songteksten. Taalstof gebruikt de officiële Web API alleen voor je playlists, recent gespeelde nummers, zoeken en de link om het nummer te openen. In de les staat de officiële Spotify-speler boven de tekst, zodat je kunt meeluisteren.

### Musixmatch-sleutel (optioneel)

Niet nodig: je plakt de tekst zelf. Wil je dat Taalstof een tekst voor je zoekt, dan kan het via Musixmatch.

1. Maak een account op [developer.musixmatch.com](https://developer.musixmatch.com).
2. Kies het gratis plan en maak een applicatie aan.
3. Zet de API-sleutel in `MUSIXMATCH_API_KEY`.

Met de gratis sleutel geeft Musixmatch ongeveer 30 procent van de tekst. Taalstof ziet dat en zegt het erbij. Zonder sleutel laat Taalstof Musixmatch helemaal links liggen.

### Anthropic-sleutel

1. Log in op de [Claude Console](https://console.anthropic.com).
2. Maak onder **API Keys** een sleutel aan en zet hem in `ANTHROPIC_API_KEY`.
3. `ANTHROPIC_MODEL` staat standaard op `claude-opus-5-5`. Voor goedkopere lessen kun je `claude-sonnet-5-5` proberen.
4. `ONDERZOEK` staat standaard op `aan`: Claude zoekt op het web naar de artiest en het lied. Zoeken moet aanstaan voor je organisatie in de Claude Console. Elke zoekopdracht kost een cent, en de gelezen pagina's tellen mee als invoer. Met `ONDERZOEK=uit` vertelt Claude alleen wat het zeker weet.
5. `ANTHROPIC_EFFORT` bepaalt hoe diep het model nadenkt voor het schrijft. Standaard `high`. Met `medium` of `low` gaat het sneller en goedkoper, met meer kans op slordigheden in de herkomst.

Eén les is een flinke hoeveelheid uitvoer en duurt een paar minuten. De server maakt hem op de achtergrond en de pagina laat zien hoe ver hij is. Taalstof bewaart elke les in `data/`, zodat hetzelfde lied met dezelfde tekst en dezelfde instellingen je maar één keer geld kost.

Weigert een veiligheidsfilter van het model een tekst, dan probeert de API het zelf nog eens op het vervangende model dat Anthropic daarvoor aanraadt. Dat staat aan in `src/lesson/generator.ts` met `fallbacks`.

## Starten

```sh
npm install
npm run dev        # ontwikkelen, herstart bij wijzigingen
# of
npm run build && npm start
```

Open `http://127.0.0.1:8787`, klik op **Inloggen bij Spotify**, kies een nummer, plak de songtekst in het veld en druk op **Maak les**. Is de les klaar, dan verschijnt de knop **Open de les**.

Overige commando's:

```sh
npm test           # vitest, alles met gemockte HTTP
npm run build      # TypeScript naar dist/
```

## Mappen

| Map | Inhoud |
| --- | --- |
| `src/spotify/` | Spotify Web API met Authorization Code + PKCE |
| `src/lyrics/` | `LyricsProvider`-interface, handmatig plakken en optioneel Musixmatch |
| `src/lesson/` | Lesschema, Nederlandse prompt en de aanroep naar Claude |
| `src/render/` | Zet een les om naar één zelfstandig HTML-bestand |
| `templates/` | CSS en script van de les, overgenomen uit de eerste handgemaakte les |
| `voorbeeld/` | De voorbeeldles over een rechtenvrij volkslied, ook de maatstaf in de tests |
| `public/` | De kiespagina |
| `data/` | Cache van Spotify, songteksten en lessen, plus je Spotify-token (niet in git) |
| `lessons/` | De gemaakte lessen (niet in git) |

## Auteursrecht

Songteksten zijn auteursrechtelijk beschermd. Taalstof is daarom alleen bedoeld voor eigen gebruik op je eigen computer. De app publiceert niets, de server luistert alleen op `127.0.0.1`, en de mappen met teksten en lessen staan in `.gitignore`. Zet gemaakte lessen niet online.
