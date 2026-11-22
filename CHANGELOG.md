# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/pl/1.1.0/). Wersje: [SemVer](https://semver.org/lang/pl/).

## [Unreleased]

### Zmienione

- Firefox od wersji 128 (wcześniej od 140), także Firefox ESR 128. Firefox na Androidzie od wersji 128 (wcześniej od 142).

## [1.0.0] - 2026-11-17

Pierwsze wydanie.

### Dodane

- Liczba wolnych miejsc w klasie 1 i klasie 2 przy każdym połączeniu na liście wyników ebilet.intercity.pl.
- Osobna liczba miejsc specjalnych (OzN, osoba na wózku, opiekun, osoba z dzieckiem, osoba z rowerem) i podpowiedź z typami miejsc i godziną pobrania danych.
- Połączenia z przesiadką: najmniejsza liczba miejsc ze wszystkich odcinków.
- Błąd nie zmienia strony: karta połączenia zostaje bez liczby miejsc, a opis błędu trafia do konsoli przeglądarki.
- „Brak mapy miejsc”, gdy PKP Intercity nie udostępnia mapy dla pociągu.
- Wtyczka dla Chrome (od wersji 111) i Firefox (od wersji 140).

### Ograniczenia zapytań

- Liczenie tylko dla połączeń widocznych na ekranie. Połączenie poza ekranem i strona w tle (inna karta przeglądarki na wierzchu) nie zaczynają liczenia. Pociąg, który wtyczka już zaczęła liczyć, liczy do końca i zapisuje w cache.
- Po błędzie: ponowna próba dla tego pociągu najwcześniej po 60 s (licząc od błędu pociągu, wspólnie dla wszystkich kart połączeń z tym pociągiem). Po 3 błędach z rzędu: koniec pytań o ten pociąg do przeładowania strony.
- Najwyżej 400 zapytań na 5 minut w jednej karcie przeglądarki (cała doba na typowej trasie to około 330).
- Gdy zapytania czekają na limit albo na koniec przerwy po 429, podpowiedź nad plakietką „liczę miejsca…” mówi: „IC3 czeka na limit zapytań”.
- Zapytania po kolei, z przerwami. Dane jednego pociągu najwyżej raz na 5 minut (cache w `localStorage`). Po otwarciu wyboru miejsc w pociągu: nowe dane tego pociągu.
- Odpowiedź 429 albo 418: przerwa według `Retry-After` (domyślnie 30 s, maksymalnie 60 s) i jedna ponowna próba.
- Odpowiedź 401 albo 403, drugi 429/418 na tej stronie albo `Retry-After` dłuższy niż 60 s: zatrzymanie wszystkich zapytań do przeładowania strony.
- Odpowiedź 5xx, błąd sieci albo brak odpowiedzi przez 15 s: jedna ponowna próba po 2 s. Dla składu pociągu: tylko gdy połączenie jest nadal na ekranie.

### Projekt

- Kod w TypeScript, testy jednostkowe z prawdziwymi odpowiedziami API, narzędzia w Bun.
- GitHub Actions buduje paczki `.zip` dla Chrome i Firefox i dodaje je do GitHub Releases.
- README z zastrzeżeniem, sekcją „Prywatność” i kontaktem dla PKP Intercity.
