# API serwisu e-IC 2.0

Nieoficjalny opis. Stan na listopad 2026, wersja aplikacji `1.6.20`. PKP Intercity może zmienić API bez ostrzeżenia.

## Ochrona przed botami

Serwery `api-gateway.intercity.pl` chroni Akamai Bot Manager (ciasteczka `ak_bmsc`, `bm_sz`, `_abck`). IC3 wysyła zapytania tak samo jak strona: z kontekstu strony (`world: "MAIN"`) i z ciasteczkami (`credentials: 'include'`). Endpointy `/grm/` odpowiadają też bez ciasteczek (zobacz [Błędy](#błędy)), ale IC3 nie korzysta z tej możliwości.

## Nagłówki

Wszystkie zapytania wysyłają:

```
accept: application/json, text/plain, */*
app-version: 1.6.20
app-version-1.6.20:            (pusty nagłówek, nazwa zawiera wersję)
```

IC3 czyta aktualną wersję z nagłówka `app-version`, który wysyła strona.

## Słownik stacji

Strona trzyma słownik w `localStorage['eic2-library']`, w polu `data.stationsList`. Każda stacja ma kilka kodów:

| Pole | Przykład (Kraków Gł.) | Użycie |
|---|---|---|
| `kod` | `85` | Wyszukiwanie połączeń, parametry URL `swyj` i `sprzy` |
| `kodEPA` | `5100051` | Skład pociągu i mapa wagonu |
| `kodEVA` | `5100028` | IC3 go nie używa |

## Wyszukiwanie połączeń

`POST https://api-gateway.intercity.pl/server/public/endpoint/Pociagi`

```json
{
  "metoda": "wyszukajPolaczenia",
  "dataWyjazdu": "2026-11-15 00:00:00",
  "dataPrzyjazdu": "2026-11-15 23:59:59",
  "stacjaWyjazdu": 85,
  "stacjaPrzyjazdu": 248,
  "liczbaPrzesiadekMax": 2,
  "urzadzenieNr": 956
}
```

Odpowiedź: `polaczenia[]`. Każde połączenie ma `pociagi[]` (jeden pociąg na każdy odcinek) z polami `kategoriaPociagu`, `nrPociagu`, `nazwaPociagu`, `dataWyjazdu`, `dataPrzyjazdu`, `stacjaWyjazdu`, `stacjaPrzyjazdu`.

IC3 nie wysyła tego zapytania. Czyta odpowiedzi, które pobiera strona.

## Ceny (IC3 ich nie używa)

`POST …/endpoint/Sprzedaz` z `"metoda": "sprawdzCenyLite"` zwraca ceny dla klas i komunikaty typu „Brak miejsc ogólnodostępnych”. Ten endpoint nie mówi, czy są wolne miejsca. Zwraca cenę także wtedy, gdy zostały tylko miejsca specjalne. Dlatego IC3 liczy miejsca z mapy wagonów.

## Skład pociągu

`GET https://api-gateway.intercity.pl/grm/sklad/wbnet/{kategoria}/{nr}/{przyjazd}/{epaOd}/{odjazd}/{epaDo}`

Daty mają format `RRRRMMDDGGMM`, na przykład `202611150953`. Uwaga: w tym adresie najpierw jest czas przyjazdu, potem czas odjazdu.

Przykład: `/grm/sklad/wbnet/IC/134/202611151250/5100051/202611150953/5100143`

```json
{
  "wagony": [279, 278, 277, 276, 275, 274, 273, 272],
  "wagonyNiedostepne": [274],
  "klasa1": [273, 272],
  "klasa2": [279, 278, 277, 276, 275],
  "wagonySchemat": { "273": "2022,WITH_COMPARTMENTS", "275": "1958,WITHOUT_COMPARTMENTS" }
}
```

IC3 pomija wagony bez schematu, na przykład wagon restauracyjny, sypialny albo z kuszetkami.

IC3 nie używa pola `wagonyNiedostepne`. Frontend e-IC też go nie czyta: tej nazwy nie ma w żadnym pliku JS strony (sprawdzone 22.11.2026 na liście połączeń i w wyborze miejsc). W części pociągów nocnych pole zawiera wszystkie wagony, także wagony z wolnymi miejscami.

Przykład: TLK 53171 „Karpaty”, 26.11.2026 23:32 Warszawa Centr. → 27.11.2026 06:04 Zakopane. Skład zwraca wszystkie 12 wagonów w `wagonyNiedostepne`, a strona pokazuje mapę wagonu 14 z 40 wolnymi miejscami (`src/__fixtures__/sklad-tlk53171.json`, `wagon-tlk53171-14.svg`).

Audyt 22.11.2026: 138 pociągów bezpośrednich na 24.11 i 28.11.2026, trasy Warszawa Centr. → Zakopane, Kraków Gł. → Gdynia Gł., Przemyśl Gł. → Świnoujście, Warszawa Centr. → Kraków Gł. i Wrocław Gł. → Warszawa Centr.

| Pociągi | Liczba | `wagonyNiedostepne` (wagony ze schematem) |
|---|---|---|
| Dzienne | 120 | puste we wszystkich |
| Nocne (przez północ albo odjazd przed 5:00) | 10 | wszystkie wagony, np. TLK 53171 do Zakopanego, TLK 35171 00:36 → 08:44, IC 430 |
| Nocne | 8 | puste, np. TLK 53171 tylko do Krakowa (23:32 → 03:30), IC 61170 |

Sprawdzone na stronie (22.11.2026, TLK 53171 do Zakopanego na 26.11): mapa miejsc pozwala przełączyć każdy wagon z `klasa1`/`klasa2`, także wagony z `wagonyNiedostepne`. Suma wolnych miejsc na mapie (klasa 1: 48, klasa 2: 100 + 25 specjalnych) jest równa liczbom IC3. Wybór miejsca w wagonie z tej listy przechodzi do podsumowania zakupu (sprawdzone ręcznie, bez płatności).

W tych 10 pociągach każdy sprawdzony wagon z `wagonyNiedostepne` miał w SVG wolne miejsca (30 wagonów, od 13 do 58 wolnych). Pole nie zależy tylko od daty przyjazdu w adresie: TLK 35171 i TLK 83170 mają odjazd i przyjazd tego samego dnia. Nie wiadomo, co pole naprawdę oznacza.

Koszt: IC3 pobiera teraz także mapy wagonów z `wagonyNiedostepne`. W audycie pociągi dzienne miały to pole puste, więc wysyłają tyle samo zapytań co wcześniej. Starszy przykład IC 134 z 15.11.2026 miał jeden wagon w tym polu (274).

## Mapa wagonu

`GET https://api-gateway.intercity.pl/grm/wagon/svg/wbnet/{kategoria}/{nr}/{wagon}/{schemat}/{odjazd}/{przyjazd}/{epaOd}/{epaDo}`

W tym adresie najpierw jest czas odjazdu, potem czas przyjazdu.

Odpowiedź to SVG. Każde miejsce to element `<g>` z `aria-label` i obrazkiem z atrybutem `status`:

```xml
<g aria-label="Miejsce 93 klasa 1,  środek,  Wolne , niewybrane , Miejsce dla OzN – nie na wózku (4)">
  <image class="place" status="1" … />
</g>
```

| `status` | Znaczenie |
|---|---|
| `1` | wolne |
| `3` | zajęte albo niedostępne |

Tekst po `niewybrane ,` to cecha miejsca. IC3 uznaje miejsce za specjalne, gdy cecha pasuje do `/OzN|wózk|opiekun|dzieck|rower/i`. Inne cechy, na przykład „Strefa Ciszy*”, oznaczają zwykłe miejsce.

## Błędy

Sprawdzone w listopadzie 2026: kod frontendu e-IC 2.0 (`main.*.js`) i 10 celowo błędnych zapytań do `/grm/`.

| Sytuacja | Odpowiedź API | Co robi IC3 |
|---|---|---|
| Nieznany pociąg, stacja, wagon albo data z przeszłości | **404**, JSON `{"statusCode":404,"error":"Not found","fullScreen":false}` | Skład: „brak mapy miejsc” na karcie. Jeden wagon: pomija go i liczy resztę. |
| Zła godzina w adresie składu (dobry dzień) | 200: API sprawdza tylko datę | bez zmian |
| Zły schemat wagonu | 200 z innym SVG: API nie sprawdza schematu | bez zmian |
| Brak nagłówków `App-Version` | 200 | IC3 wysyła te nagłówki, tak jak strona. |
| Brak ciasteczek (`credentials: 'omit'`) | 200: `/grm/` nie wymaga sesji ani ciasteczek Akamai | IC3 wysyła ciasteczka, tak jak strona. |
| Chwilowy błąd serwera | **500** (zaobserwowany raz dla jednego wagonu) | Jedna ponowna próba po 2 s. |
| `GET /grm/grm/available/{nr}/{data}` dla nieznanego pociągu | 200 `{"available":false}` | IC3 nie używa tego endpointu. |

Obsługa błędów we frontendzie e-IC (interceptory axios):

- **418**: komunikat 29590 „Twoje żądanie nie może być obsłużone w tym momencie. Spróbuj ponownie lub wróć później.” Według tego komunikatu 418 oznacza przeciążenie albo limit. IC3 traktuje 418 tak jak 429.
- **401**: wylogowanie i komunikat 27022 „Sesja wygasła”.
- Błędy w treści odpowiedzi ze statusem 200: pole `bledy: [{ kod, opisy: [{ jezyk, komunikat }] }]`. Dotyczy endpointów `/server/public/endpoint/…`, nie `/grm/`.
- Frontend nie obsługuje 429 ani nagłówka `Retry-After`. Nie wiadomo, czy API je wysyła. IC3 obsługuje je na wszelki wypadek.

Limitu zapytań nie sprawdzałem przez wysyłanie wielu zapytań naraz. Taki test obciążyłby serwis.

Reakcja IC3 (`src/api.ts`, `src/gate.ts`, `src/seat-service.ts`):

- 429 albo 418: przerwa w zapytaniach według `Retry-After` (domyślnie 30 s, maksymalnie 60 s), potem jedna ponowna próba tego samego zapytania.
- 401, 403, drugi 429/418 na tej stronie albo `Retry-After` dłuższy niż 60 s: zatrzymanie wszystkich zapytań do przeładowania strony.
- 5xx, błąd sieci albo brak odpowiedzi przez 15 s: jedna ponowna próba po 2 s. Przed ponowną próbą zapytania o skład IC3 sprawdza, czy karta połączenia jest nadal na ekranie.
- Inny błąd pociągu (np. 400 albo odpowiedź, która nie jest JSON): przez 60 s żadnych zapytań o ten pociąg, dla żadnej karty połączenia. Po 3 błędach z rzędu IC3 nie pyta o ten pociąg do przeładowania strony.
- Przed pierwszym zapytaniem pociągu (skład) i po każdej przerwie przed nim IC3 sprawdza, czy karta połączenia jest nadal na ekranie i czy karta przeglądarki jest widoczna. Jeśli nie, IC3 nie zaczyna liczenia.
- Liczenie, które wysłało zapytanie o skład, idzie do końca i trafia do cache. Inaczej każde przewinięcie w tę i z powrotem pobierałoby te same wagony drugi raz.
- Brak listy stacji w `localStorage` (`NotReadyError`, bez zapytania): karta połączenia próbuje jeszcze raz po 2 s, potem po 4 s, 8 s… najwyżej co 60 s.

Lista połączeń na stronie zawiera tylko odjazdy z dnia w parametrze `dwyj` (także przy wyszukiwaniu po godzinie przyjazdu, `przy=1`). Przyciski „Wcześniej” i „Później” nie przechodzą przez północ. Zamiast tego strona zmienia `dwyj`. Sprawdzone w listopadzie 2026.

## Cache IC3

IC3 trzyma liczbę miejsc pociągu 5 minut (`CACHE_TTL_MS`). Gdy strona sama wysyła zapytanie o skład (`/grm/sklad/…`), użytkownik otworzył wybór miejsc w tym pociągu. Wtedy IC3 usuwa ten pociąg z cache (kategoria, numer, godzina odjazdu z URL) i liczy go od nowa, gdy następny raz sprawdza karty połączeń. Liczy od nowa tylko karty połączeń z tym pociągiem i nie przerywa liczenia w toku. IC3 nie usuwa stanu błędów: przerwa 60 s, zatrzymanie po 3 błędach i wynik 404 działają dalej. Własne zapytania IC3 idą przez oryginalny `fetch`, więc nie uruchamiają tego mechanizmu.

Sprawdzone 17.11.2026 w Chrome:

- Wybór miejsc to osobna ścieżka (`/wybormiejsc`). Lista połączeń znika wtedy z DOM, więc IC3 nie liczy kart połączeń pod mapą miejsc. Strona wysyła `/grm/sklad/` dopiero po „Wybierz miejsce”. Po powrocie strona buduje nowe elementy kart.
- Strona nie używa starych elementów `<li>` kart dla nowej listy. Sprawdzone przypadki: zmiana dnia na liście, nowe wyszukiwanie do bliższej stacji (Kraków Gł. → Kraków Płaszów) i powrót w historii do poprzedniej listy. Za każdym razem stare elementy znikają z DOM, a strona tworzy nowe. Mimo to sygnatura karty w IC3 ma godzinę odjazdu, godzinę przyjazdu i numery pociągów.

## Limit IC3

W jednej karcie przeglądarki IC3 wysyła najwyżej 400 zapytań na 5 minut. To wystarcza na całą dobę z zapasem, ale nie na kilka dób pod rząd (`MAX_REQUESTS_PER_WINDOW`, `RATE_WINDOW_MS`, `src/gate.ts`). Gdy limit się wyczerpie, następne zapytanie czeka. W tym czasie, a także w przerwie po 429, plakietki „liczę miejsca…” mają podpowiedź „IC3 czeka na limit zapytań. Liczenie zacznie się samo.” Gdy czeka zapytanie o skład, IC3 po czekaniu jeszcze raz sprawdza, czy karta połączenia jest na ekranie.

Pomiar (16.11.2026, Warszawa Centralna → Kraków Główny, 20.11.2026): 37 połączeń, 42 pociągi, 292 wagony z mapą miejsc. Przewinięcie całej doby to 334 zapytania, średnio 8,3 na pociąg (od 1 do 13). Jeden ekran (około 6 kart połączeń) to około 50 zapytań.

## Przerwa techniczna

PKP Intercity podaje nocną przerwę techniczną e-IC: 23:45–0:30, w pierwszy dzień miesiąca do 1:00. Pomiar 16.11.2026 o 23:54: wyszukiwanie działało, a `/grm/sklad/` odpowiedział normalnie (40 × 200, 2 × 404). Przerwa nie blokuje więc odczytu map miejsc, a IC3 nie wstrzymuje zapytań w nocy.

## Inne

- `GET /grm/grm/available/{nr}/{RRRRMMDD}` zwraca `{"available": true}`, gdy dla pociągu jest mapa miejsc.
- PKP Intercity przechowuje wyniki wyszukiwania i ceny w cache do 5 minut (stopka strony, pkt 72a Regulaminu e-IC).
