# Wydanie nowej wersji

Wersja jest w jednym miejscu: `package.json`. Build wpisuje ją do `manifest.json` każdej przeglądarki. Sklepy przyjmują tylko format `MAJOR.MINOR.PATCH`, bez `-beta`.

## Kroki

1. Zmień `version` w `package.json`.
2. W `CHANGELOG.md` zmień `## [Unreleased]` na `## [X.Y.Z] - RRRR-MM-DD`.
3. Nad tą sekcją dodaj nową, pustą sekcję `## [Unreleased]`.
4. Uruchom `bun run check`. Typecheck, testy i lint muszą przejść.
5. Zrób commit: `git commit -am "Release X.Y.Z"`.
6. Dodaj tag i wyślij go:
   ```sh
   git tag vX.Y.Z
   git push origin main vX.Y.Z
   ```

Workflow `.github/workflows/release.yml` porównuje wersję w tagu i w `package.json`. Potem buduje paczki i tworzy GitHub Release z plikami:

- `ic3-chrome-X.Y.Z.zip`
- `ic3-firefox-X.Y.Z.zip`

Notatka do Release to sekcja wersji z `CHANGELOG.md`. GitHub sam dodaje archiwa z kodem źródłowym.

## Paczki lokalnie

```sh
bun run package    # web-ext-artifacts/ic3-<przeglądarka>-<wersja>.zip
```

## Firefox Add-ons (AMO)

Wtyczka zawiera kod zbudowany przez Bun. Dlatego AMO wymaga kodu źródłowego i instrukcji budowania:

1. Prześlij `ic3-firefox-X.Y.Z.zip` jako dodatek.
2. Jako kod źródłowy prześlij archiwum z GitHub Release dla tego taga (`Source code (zip)`).
3. Instrukcja dla recenzenta: sekcja „Build ze źródeł” w `README.md`.

Build jest powtarzalny. Wersja Bun jest w `package.json` (`packageManager`), wersje zależności w `bun.lock`. Build nie minifikuje kodu.

## Chrome Web Store

Prześlij `ic3-chrome-X.Y.Z.zip` w panelu dewelopera Chrome Web Store.
