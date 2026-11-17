# Jak pomóc

Możesz zgłosić błąd albo przesłać pull request.

## Błąd albo pomysł

Otwórz [issue](../../issues/new/choose). Przy błędzie podaj:
- przeglądarkę i jej wersję,
- wersję IC3 (lista rozszerzeń w przeglądarce),
- trasę, datę i godzinę połączenia,
- zrzut ekranu karty połączenia.

## Pull request

1. Zainstaluj [Bun](https://bun.sh) w wersji z pola `packageManager` w `package.json`.
2. Uruchom `bun install`.
3. Wprowadź zmianę. Dodaj test obok zmienionego modułu (`*.test.ts`).
4. Uruchom `bun run check`. Typecheck, testy i lint muszą przejść.
5. Załaduj `dist/firefox/` albo `dist/chrome/` w przeglądarce ([instrukcja](README.md#rozwój)).
6. Sprawdź zmianę na ebilet.intercity.pl.
7. Dodaj wpis do sekcji `[Unreleased]` w [CHANGELOG.md](CHANGELOG.md).

Zasady IC3 i ich powody są w [AGENTS.md](AGENTS.md#hard-rules) (po angielsku). Nie przyjmę pull requestu, który zwiększa liczbę zapytań do API, omija odmowę serwera albo dodaje funkcje zakupu.

Język: kod, komentarze i commity po angielsku. Teksty dla użytkowników (plakietki, README, CHANGELOG) po polsku.

## API

Opis nieoficjalnego API e-IC 2.0 jest w [docs/api.md](docs/api.md). Gdy API się zmieni:

1. Pobierz nową, prawdziwą odpowiedź API i dodaj ją do `src/__fixtures__/`.
2. Zaktualizuj [docs/api.md](docs/api.md).

Nie sprawdzaj limitów API przez wysyłanie wielu zapytań naraz. Taki test obciąża serwis PKP Intercity.
