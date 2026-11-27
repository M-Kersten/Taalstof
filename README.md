# Taalstof

Taalstof maakt van songteksten Duitse taallessen. Je kiest een nummer uit je eigen Spotify, plakt de songtekst erbij en Claude bouwt er een les van. Het doel is Duits leren. De les begint bij de tekst en vertelt wat een Duitser erbij hoort: de plek, het merk, de gebeurtenis of het verhaal achter een zinsnede. Daar hangen de woorden aan, en een woord dat aan een verhaal hangt, onthoud je.

De app draait helemaal in je browser en staat op GitHub Pages: **https://m-kersten.github.io/Taalstof/**. Je Claude-sleutel vul je in de app zelf in. De lessen gaan als JSON naar je eigen Supabase-database, waar alleen jij na inloggen bij kunt.

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

Eerst zien hoe dat eruitziet? Onderaan de startpagina staat een link naar de voorbeeldles over *Die Gedanken sind frei*. Die werkt zonder sleutels en zonder inloggen.

Claude zoekt kort op het web om te controleren wat het over de maker en de verwijzingen in de tekst vertelt. Onder **Bron** staan alleen pagina's die het tijdens het maken echt gezien heeft. Een adres dat het uit zijn geheugen noemt, laat Taalstof weg. De herkomst van losse woorden komt uit het geheugen van het model; wat niet vaststaat, krijgt het label onzeker.

## Eenmalig instellen

Je hebt drie dingen nodig die je één keer regelt: een Supabase-project, een Spotify-app en de instellingen van deze repository. De Claude-sleutel komt daarna in de app zelf.

### Supabase

1. Maak een gratis project op [supabase.com](https://supabase.com).
2. Open **SQL Editor**, plak de inhoud van `supabase/schema.sql` en voer het uit. Dat maakt de tabel `lessen`, met regels die zorgen dat elke gebruiker alleen zijn eigen lessen ziet.
3. Ga naar **Authentication**, **URL Configuration**. Zet de **Site URL** op `https://m-kersten.github.io/Taalstof/` en voeg onder **Redirect URLs** zowel dat adres als `http://127.0.0.1:5173/` toe.
4. Kopieer onder **Project Settings**, **API** de Project URL en de anon key (in nieuwe projecten heet hij publishable key). Die zijn bedoeld om openbaar in een webpagina te staan.
5. Log één keer in via de app. Zet daarna onder **Authentication** het aanmelden van nieuwe gebruikers uit, zodat niemand anders een account in je project kan maken.

Inloggen gaat met een link per mail. De ingebouwde mailer van Supabase stuurt er maar een paar per uur; voor één gebruiker is dat genoeg. Een gratis project gaat na een week zonder gebruik in de slaapstand. Je zet hem terug met één klik in het dashboard, de lessen blijven bewaard.

### Spotify-app

1. Ga naar het [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) en kies **Create app**, of open de app die je al had.
2. Zet bij **Redirect URIs** deze twee adressen, precies zo, met de schuine streep aan het eind:
   `https://m-kersten.github.io/Taalstof/`
   `http://127.0.0.1:5173/`
   Het oude adres `http://127.0.0.1:8787/callback` mag weg.
3. Vink **Web API** aan en sla op. Een client secret is niet nodig: Taalstof gebruikt PKCE.
4. Een app in development mode werkt alleen voor accounts die onder **User Management** staan. Zet je eigen Spotify-account daar neer.

Spotify levert zelf geen songteksten. Taalstof gebruikt de officiële Web API alleen voor je playlists, recent gespeelde nummers, zoeken en de link om het nummer te openen. In de les staat de officiële Spotify-speler, zodat je kunt meeluisteren.

### GitHub

1. Zet onder **Settings**, **Pages** de **Source** op **GitHub Actions**.
2. Vul onder **Settings**, **Secrets and variables**, **Actions**, tabblad **Variables** drie variabelen in: `SPOTIFY_CLIENT_ID`, `SUPABASE_URL` en `SUPABASE_ANON_KEY`. Variabelen en geen secrets, want ze komen toch openbaar in de pagina te staan.
3. Elke push naar `main` bouwt de site opnieuw (`.github/workflows/pages.yml`). Na een wijziging in de variabelen start je de bouw zelf onder **Actions**, **Pages**, **Run workflow**.

Laat je de variabelen leeg, dan kun je de drie waarden ook in de app invullen onder **Instellingen**, **Spotify en Supabase**. Ze gelden dan alleen voor die browser.

### Claude-sleutel

1. Maak in de [Claude Console](https://console.anthropic.com) een aparte sleutel voor Taalstof, het liefst in een eigen workspace met een bestedingslimiet.
2. Open de app en vul de sleutel in onder **Instellingen**. Hij blijft in de opslag van die browser en gaat alleen naar Anthropic.

Iedereen die bij je browser kan, kan de sleutel daar uitlezen. Ook andere sites die je ooit onder `m-kersten.github.io` zet, delen die opslag met Taalstof. Een sleutel met een limiet houdt de schade dan klein, en intrekken kan altijd in de Console.

Bij **Instellingen** kies je ook het model, hoe diep het nadenkt en of Claude op het web mag zoeken. Zoeken moet aanstaan voor je organisatie in de Claude Console. Zonder zoeken vertelt Claude alleen wat het zeker weet.

## Een les maken

Log in met je mailadres, log in bij Spotify, kies een nummer, plak de songtekst en druk op **Maak les**. De les komt in **Mijn lessen** en opent op zijn eigen adres.

Eén les duurt een paar minuten en wordt in je browser gemaakt. Laat de pagina zo lang open. Op een telefoon houdt Taalstof het scherm aan; gaat hij toch op slot, dan breekt de verbinding af. Lukt het bewaren in Supabase niet, dan blijft de les in je browser staan en probeert Taalstof het opnieuw zodra je weer ingelogd bent.

Na elke les zie je wat hij kostte. Reken met ongeveer een dollar per lied met Opus 5.5, en de helft met Sonnet 5.5; een lang lied kost meer. Het grootste deel zit in wat Claude schrijft en denkt. Vraag je dezelfde les met dezelfde tekst en dezelfde instellingen nog eens, dan haalt Taalstof hem uit Supabase en kost hij niets.

Weigert een veiligheidsfilter van het model een tekst, dan probeert de API het zelf nog eens op het vervangende model dat Anthropic daarvoor aanraadt. Dat staat aan in `src/lesson/generator.ts` met `fallbacks`.

## Ontwikkelen

```sh
npm install
cp .env.example .env
npm run dev
```

Vul in `.env` dezelfde drie openbare waarden in als op GitHub en open `http://127.0.0.1:5173/`. Gebruik `127.0.0.1` en niet `localhost`: Spotify en Supabase sturen je terug naar precies het adres dat je hebt opgegeven.

| Commando | Wat het doet |
| --- | --- |
| `npm test` | vitest, alles met nep-Spotify, nep-Supabase en nep-Claude |
| `npm run build` | typecontrole en de statische site in `dist/` |
| `npm run preview` | `dist/` bekijken op `http://127.0.0.1:4173/` |

## Mappen

| Map | Inhoud |
| --- | --- |
| `index.html`, `les.html` | De startpagina en de pagina die een les laadt |
| `src/web/` | Wat in de browser draait: instellingen, inloggen, Supabase en de startpagina |
| `src/spotify/` | Spotify Web API met Authorization Code + PKCE |
| `src/lyrics/` | Geplakte tekst opschonen |
| `src/lesson/` | Lesschema, Nederlandse prompt en de aanroep naar Claude |
| `src/render/` | Zet een les om naar één zelfstandig HTML-document |
| `templates/` | CSS en script van de les |
| `voorbeeld/` | De voorbeeldles over een rechtenvrij volkslied, ook de maatstaf in de tests |
| `supabase/` | De tabel en de toegangsregels voor je lessen |

## Auteursrecht

Songteksten zijn auteursrechtelijk beschermd. Op GitHub Pages staat alleen de app zelf en de rechtenvrije voorbeeldles. Teksten en lessen staan in je eigen Supabase-database en zijn alleen na inloggen te lezen. Maak die tabel niet openbaar en zet gemaakte lessen niet in de repository.
