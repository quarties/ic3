<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="static/logo-wide-dark.svg">
    <img src="static/logo-wide.svg" alt="IC3" width="360">
  </picture>
</p>

# IC3

Czytaj „I see free”: wolne miejsca w pociągach Intercity.

Wtyczka do Chrome i Firefox. Na liście połączeń na [ebilet.intercity.pl](https://ebilet.intercity.pl) pokazuje liczbę wolnych miejsc pod ceną dla klasy 1 i klasy 2. Nie musisz otwierać mapy miejsc w każdym pociągu.

> **Nieoficjalna wtyczka.** IC3 to niezależny projekt open source. Nie ma związku z „PKP Intercity” S.A. Wtyczka używa nieoficjalnego API serwisu e-IC 2.0, które PKP Intercity może zmienić bez ostrzeżenia. Liczby miejsc są orientacyjne. Zobacz [Zastrzeżenia](#zastrzeżenia).

## Co pokazuje

| Tekst | Kolor | Znaczenie |
|---|---|---|
| `37 wolnych` | zielony | Zwykłe wolne miejsca. Miejsca w strefie ciszy też są zwykłymi miejscami. |
| `+6 specjalnych (🚲 2)` | szary | Wolne miejsca specjalne, w tym miejsca dla osoby z rowerem. |
| `tylko specjalne: 3` | pomarańczowy | Nie ma zwykłych miejsc. Są tylko miejsca specjalne. |
| `brak miejsc` | czerwony | Nie ma żadnych wolnych miejsc. |

Miejsca specjalne są przeznaczone dla OzN, osoby na wózku, opiekuna osoby na wózku, osoby z dzieckiem do lat 6 i osoby z rowerem. PKP Intercity zwykle sprzedaje je tylko tym pasażerom.

Najedź myszą na plakietkę, aby zobaczyć typy miejsc specjalnych i godzinę pobrania danych.

Dla połączenia z przesiadką wtyczka pokazuje najmniejszą liczbę ze wszystkich odcinków. Liczby dla każdego odcinka są w podpowiedzi.

## Instalacja

- **Chrome, Edge, Brave:** [Chrome Web Store](https://chromewebstore.google.com/detail/doiekkecdneflmaolejgpidbihofhfpj)
- **Firefox, Zen:** [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/ic3/)

Wymagane wersje: Firefox 128 albo nowsza (także Firefox ESR 128), Chrome 111 albo nowsza.

### Instalacja ręczna

Gotowe paczki są w [Releases](../../releases): `ic3-chrome-<wersja>.zip` i `ic3-firefox-<wersja>.zip`. Możesz też zbudować wtyczkę sam (zobacz [Build ze źródeł](#build-ze-źródeł)).

#### Chrome, Edge, Brave

1. Rozpakuj `ic3-chrome-<wersja>.zip` do folderu (albo zbuduj `dist/chrome/`).
2. Otwórz `chrome://extensions`.
3. Włącz „Tryb dewelopera” (prawy górny róg).
4. Kliknij „Załaduj rozpakowane” i wybierz ten folder.

#### Firefox, Zen (do restartu przeglądarki)

1. Otwórz `about:debugging#/runtime/this-firefox`.
2. Kliknij „Załaduj tymczasowy dodatek…”.
3. Wybierz plik `ic3-firefox-<wersja>.zip` (albo `dist/firefox/manifest.json`).

## Jak działa

1. Wtyczka działa w kontekście strony ebilet.intercity.pl (`world: "MAIN"`). Kod jest w jednym pliku `content.js`, zbudowanym z `src/`.
2. Wtyczka czyta odpowiedzi, które strona pobiera przy wyszukiwaniu połączeń. Sama nie wyszukuje połączeń.
3. Dla każdego połączenia widocznego na ekranie wtyczka pobiera skład pociągu i mapę miejsc każdego wagonu. Strona robi to samo, gdy wybierasz miejsce. Karty połączeń poniżej ekranu czekają, aż do nich przewiniesz.
4. Wtyczka liczy wolne miejsca i pokazuje wynik na karcie połączenia.

Ograniczenia zapytań:
- Wtyczka wysyła zapytania po kolei, z przerwą po każdym wagonie i każdym pociągu.
- W jednej karcie przeglądarki wtyczka wysyła najwyżej 400 zapytań na 5 minut. Jeden pociąg to zwykle około 8 zapytań, jeden ekran listy to około 50, a cała doba na trasie Warszawa – Kraków to około 330. Po przekroczeniu limitu następne karty połączeń czekają. Wtedy podpowiedź nad plakietką „liczę miejsca…” mówi, że IC3 czeka na limit zapytań.
- Dane jednego pociągu pobiera najwyżej raz na 5 minut (cache w `localStorage`). Wyjątek: gdy otworzysz wybór miejsc w pociągu, wtyczka usuwa ten pociąg z cache i po powrocie do listy liczy go od nowa.
- Gdy serwer odpowie 429 albo 418 (za dużo zapytań), wtyczka czeka tyle, ile mówi nagłówek `Retry-After` (domyślnie 30 s, maksymalnie 60 s), i próbuje jeszcze raz.
- Wtyczka zatrzymuje wszystkie zapytania, gdy:
  - serwer odpowie 401 albo 403,
  - serwer drugi raz na tej stronie odpowie 429 albo 418,
  - nagłówek `Retry-After` każe czekać dłużej niż 60 s.

  Zapytania wracają dopiero po przeładowaniu strony.
- Przy chwilowym błędzie serwera (5xx) albo sieci wtyczka próbuje jeszcze raz po 2 s. Gdy był to pierwszy krok liczenia (skład pociągu), wtyczka próbuje tylko wtedy, gdy połączenie jest nadal na ekranie.
- Przy błędzie wtyczka nie pokazuje nic na stronie. Wpis z błędem trafia do konsoli przeglądarki (`[IC3] …`). O ten pociąg wtyczka pyta jeszcze raz najwcześniej po 60 s. Po 3 błędach z rzędu nie pyta o ten pociąg do przeładowania strony.
- Gdy przewiniesz połączenie poza ekran, wtyczka nie zaczyna go liczyć. Gdy przejdziesz do innej karty przeglądarki, wtyczka nie zaczyna liczyć żadnego pociągu.
- Pociąg, który wtyczka już zaczęła liczyć, liczy do końca. Dzięki temu dane trafiają do cache i wtyczka nie pobiera tych samych wagonów drugi raz.
- Gdy PKP Intercity nie ma mapy miejsc dla pociągu (404), karta połączenia pokazuje „brak mapy miejsc”.

Szczegóły API: [docs/api.md](docs/api.md).

## Prywatność

- Wtyczka nie zbiera danych. Nie ma serwera, analityki ani telemetrii.
- Wszystkie zapytania idą z Twojej przeglądarki, w Twojej sesji na ebilet.intercity.pl, tylko do serwerów PKP Intercity.
- Wtyczka działa tylko na stronach `https://ebilet.intercity.pl/*`. Nie prosi o inne uprawnienia.
- Wtyczka zapisuje tylko cache liczby miejsc, na 5 minut, w `localStorage` strony ebilet.intercity.pl. Ten cache zostaje w Twojej przeglądarce.
- Wtyczka nie kupuje biletów, nie rezerwuje miejsc i nie omija zabezpieczeń serwisu.

## Build ze źródeł

Wymagania: [Bun](https://bun.sh) w wersji z pola `packageManager` w `package.json` (teraz 1.3.11).

```sh
bun install --frozen-lockfile
bun run build      # dist/chrome/ i dist/firefox/
bun run package    # dodatkowo web-ext-artifacts/ic3-<przeglądarka>-<wersja>.zip
```

Build nie minifikuje kodu. `dist/firefox/content.js` to wszystkie moduły z `src/` w jednym pliku.

## Rozwój

```sh
bun install
bun run check          # typecheck, testy, build i web-ext lint
bun test               # tylko testy
bun run watch          # build po każdej zmianie w src/ albo static/
bun run start:firefox  # Firefox z wtyczką
bun run start:chrome   # to samo w Chromium
```

Do przeglądarki ładuj `dist/firefox/` albo `dist/chrome/`. Po zmianie kodu przeładuj wtyczkę w przeglądarce, a potem stronę z wynikami.

Wydanie nowej wersji: [docs/releasing.md](docs/releasing.md).

### Struktura

Kod jest w TypeScript, w katalogu `src/`. Skrypt `scripts/build.ts` łączy go w jeden plik `content.js`, bo content script w świecie MAIN nie może importować modułów. Potem dodaje ikony i `manifest.json` dla każdej przeglądarki. Katalogu `dist/` nie ma w repozytorium.

| Katalog | Zawartość |
|---|---|
| `src/` | Kod wtyczki i testy |
| `static/` | Wspólny `manifest.json` (bez wersji), logo: ikona (`logo.svg`), logo z nazwą (`logo-wide.svg`, `logo-wide-dark.svg`) i ikony PNG |
| `scripts/` | Build, paczki, notatki do Release |
| `docs/` | Opis API, instrukcja wydania |
| `.github/workflows/` | CI przy każdym pushu, Release przy tagu `v*` |

| Plik | Zadanie |
|---|---|
| `src/main.ts` | Start: łączy moduły |
| `src/types.ts` | Typy odpowiedzi API i liczby miejsc |
| `src/capture.ts` | Czyta odpowiedzi wyszukiwania i wersję aplikacji strony |
| `src/connections.ts` | Połączenia z wyszukiwania, dopasowanie karty do połączenia |
| `src/api.ts` | Adresy i zapytania API mapy miejsc |
| `src/stations.ts` | Kod stacji wyszukiwania na kod EPA |
| `src/train-counter.ts` | Liczy miejsca jednego pociągu (skład i wagony) |
| `src/seats.ts` | Czyta mapę wagonu (SVG), rozpoznaje miejsca specjalne |
| `src/seat-service.ts` | Cache, kolejka, połączenia z przesiadką |
| `src/gate.ts`, `src/errors.ts` | Limit 400 zapytań na 5 min, reakcja na 429, 401 i 403: przerwa albo zatrzymanie |
| `src/cache.ts`, `src/queue.ts` | Cache w `localStorage`, kolejka zapytań |
| `src/ui/` | Karty połączeń, plakietki, podpowiedź, style |

Testy są obok modułów (`*.test.ts`). `bun test` uruchamia je z DOM z biblioteki happy-dom. Prawdziwe odpowiedzi API do testów są w `src/__fixtures__/`.

## Zastrzeżenia

IC3 to nieoficjalne, niezależne oprogramowanie open source. „PKP Intercity” S.A. ani inne spółki Grupy PKP nie tworzą, nie autoryzują i nie wspierają IC3. Projekt nie ma z nimi żadnego związku. Nazwy „PKP Intercity”, „Intercity”, „e-IC” oraz powiązane oznaczenia i logotypy należą do ich właścicieli. Używam ich tylko po to, aby wskazać, z jakim serwisem działa wtyczka.

Wtyczka działa tylko w Twojej przeglądarce, w Twojej sesji w serwisie ebilet.intercity.pl. Nie zbiera danych i nie przesyła ich do autora ani do osób trzecich. Nie kupuje biletów i nie omija zabezpieczeń serwisu. Liczby wolnych miejsc są orientacyjne. Wiążące są tylko informacje w serwisie PKP Intercity. Korzystasz z wtyczki na własne ryzyko i zgodnie z [Regulaminem e-IC](https://www.intercity.pl/pl/site/bip/regulaminy/regulamin-internetowej-sprzedazy-biletow.html).

**Ryzyko dla Twojego konta:** Regulamin e-IC (pkt 143 ppkt 3, wersja ważna od 24 września 2026) pozwala PKP Intercity zablokować konto, jeśli korzystasz z serwisu „niezgodnie z jego przeznaczeniem”. Regulamin nie zakazuje wprost wtyczek. IC3 pokazuje tylko informacje, które serwis i tak pokazuje na mapie miejsc. Oceniam to ryzyko jako niskie, ale nie zerowe.

**Dla PKP Intercity:** jeśli IC3 przeszkadza w działaniu serwisu albo narusza Wasze prawa, napiszcie w [Issues](../../issues). Na Waszą prośbę zmienię nazwę albo wycofam projekt.

## Współpraca

Zgłoszenia błędów i pull requesty: [CONTRIBUTING.md](CONTRIBUTING.md). Problemy z bezpieczeństwem: [SECURITY.md](SECURITY.md).

## Licencja

[MIT](LICENSE)
