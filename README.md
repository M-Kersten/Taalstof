# Taalstof

Taalstof maakt van songteksten Duitse taallessen. Je kiest een nummer uit je eigen Spotify, plakt de songtekst erbij en Claude bouwt er een les van. Het doel is Duits leren. De les begint bij de tekst en vertelt wat een Duitser erbij hoort: de plek, het merk, de gebeurtenis of het verhaal achter een zinsnede. Daar hangen de woorden aan, en een woord dat aan een verhaal hangt, onthoud je.

Het is een kleine webapp die alleen op je eigen machine draait, op `http://127.0.0.1`. Elke les is een los HTML-bestand in `lessons/`, dat je ook zonder de server kunt openen.

## Hoe een les loopt

Een les is één verhaal: het lied zelf, van het eerste couplet tot het laatste. Je loopt het couplet voor couplet door, één stap per scherm, met **Verder** onderaan. Onder de knop staat steeds wat er hierna komt.

| Stap | Wat je doet |
| --- | --- |
| Lezen | Het couplet, met een zin waarmee het begint. Tik op een woord voor de betekenis, de familie, waarom het hier zo staat en waar het vandaan komt. Achter sommige regels staat *waarom?* voor wat aan de hele regel hangt. Komt er grammatica in voor, dan brengt een knopje je naar de uitleg |
| Erachter | Wat er in het couplet gebeurt en wat een Duitser erbij hoort: de regel uit het lied, het verhaal erachter, soms eerst een vraag om te raden, woorden om aan te tikken en een kapstok |
| Zelf doen | Koppel de woorden van dit couplet aan hun betekenis en zet een regel weer in de goede volgorde. Kwam die regel net voorbij in een verhaal, dan staat dat erbij |

Na het laatste couplet zing je het hele lied mee door de gaten in te vullen, en dan volgt de toets met wat je nu zou moeten kunnen.

Het **overzicht** is een pad met een halte per couplet, plus meezingen en de toets. Afgeronde haltes worden groen en de halte waar je bent goud. Op de telefoon is het pad je startscherm. Tik je op een halte, dan zie je wat er komt en begin je met **Begin**. Op een computer staat het pad altijd links, met de stappen van de huidige halte eronder. De Spotify-speler staat bij het overzicht. Taalstof onthoudt in je browser waar je was.

De **naslag** schuift er van rechts in, op elk moment. Daar staan de kaarten, de woordverhalen, de grammatica, de valse vrienden en de bron van de les.

De pagina maakt het pad, de stappen, de spelletjes en de zinnen bij Hierna zelf uit wat de les al heeft. Het model schrijft alleen per couplet één openingszin extra.

Eerst zien hoe dat eruitziet? Start de app en open `http://127.0.0.1:8787/voorbeeld`. Die voorbeeldles over *Die Gedanken sind frei* werkt zonder sleutels.

Claude zoekt kort op het web om te controleren wat het over de maker en de verwijzingen in de tekst vertelt. Onder **Bron** staan alleen pagina's die het tijdens het maken echt gezien heeft. Een adres dat het uit zijn geheugen noemt, laat Taalstof weg. De herkomst van losse woorden komt uit het geheugen van het model; wat niet vaststaat, krijgt het label onzeker.

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
4. `ONDERZOEK` staat standaard op `aan`: Claude doet hooguit vier zoekopdrachten om feiten na te gaan. Zoeken moet aanstaan voor je organisatie in de Claude Console. Met `ONDERZOEK=uit` vertelt Claude alleen wat het zeker weet.
5. `ANTHROPIC_EFFORT` bepaalt hoe diep het model nadenkt voor het schrijft. Standaard `medium`. Met `high` wordt het grondiger en duurder, met `low` sneller en goedkoper.

Na elke les zie je wat hij kostte, in de kiespagina en onderaan de les. Reken met ongeveer een dollar per lied met `claude-opus-5-5`, en de helft met `claude-sonnet-5-5`; een lang lied kost meer. Het grootste deel zit in wat Claude schrijft en denkt. De lange instructies gaan in de cache van de API, zodat een vervolg of herkansing weinig kost.

Eén les duurt een paar minuten. De server maakt hem op de achtergrond en de pagina laat zien hoe ver hij is. Taalstof bewaart elke les in `data/`, zodat hetzelfde lied met dezelfde tekst en dezelfde instellingen je maar één keer geld kost.

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
