# Aplikacja Android (Capacitor)

Kod aplikacji pozostaje w HTML/CSS/JS (`app/`). Capacitor opakowuje go w natywną aplikację i daje dostęp do funkcji telefonu przez wtyczki npm.

## Funkcje natywne

| Funkcja | Rozwiązanie |
|---|---|
| Blokada zrzutów i nagrywania ekranu | `FLAG_SECURE` — wtyczka *privacy screen* lub kilka linii w `MainActivity` |
| Tylko aparat, bez galerii | `@capacitor/camera`, `source: CameraSource.Camera`, `saveToGallery: false` |
| GPS z dokładnością | `@capacitor/geolocation` (`enableHighAccuracy`) |
| OCR na urządzeniu (podgląd) | wtyczka ML Kit Text Recognition (zastępuje Tesseract.js z prototypu) |
| Root / integralność | Play Integrity API |
| Bezpieczne przechowywanie | szyfrowany magazyn (np. secure storage), `allowBackup=false` |
| Tryb offline | kolejka wizyt w szyfrowanym magazynie, wysyłka po odzyskaniu sieci |

Na iOS nie ma odpowiednika `FLAG_SECURE`: ukrywanie treści przy `UIScreen.isCaptured`, zasłona w przełączniku aplikacji,
reakcja na zrzut (rozmycie, wpis w dzienniku). Fotografowania ekranu drugim urządzeniem nie da się zablokować — stąd znak wodny.

## Przygotowanie (Windows)

1. Node.js LTS, Android Studio (z JDK i Android SDK).
2. W repo:
   ```powershell
   npm init -y
   npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/camera @capacitor/geolocation
   npx cap init FieldCheck pl.fieldcheck.app --web-dir=www
   npx cap add android
   ```
3. Skrypt kopiujący `app/` + `assets/` do `www/`, potem `npx cap sync android`.
4. `npx cap open android` → Run na telefonie (tryb deweloperski + debugowanie USB) lub emulatorze.

W kodzie `app/app.js` miejsca do podmiany są oznaczone: wybór zdjęcia (`capture`), GPS (`getGps`), OCR (`runOcr`).

## Kryteria akceptacji (Android)

- Zrzut i nagranie ekranu dają czarny obraz.
- Zdjęcia z galerii lub wykonane poza aplikacją nie mogą zostać dodane.
- Zdjęcia nie trafiają do galerii i są usuwane z telefonu po wysłaniu.
- Konto działa tylko na jednym urządzeniu; zmiana wymaga odpięcia przez admina.
