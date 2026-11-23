# Changelog

## 0.4.0 — 2026-11-23

- Pulpit: filtr statusu (obok okresu i handlowca).
- Eksport raportu i dziennika: CSV, XLSX (SheetJS) i PDF (widok do druku → „Zapisz jako PDF”); każdy eksport w audycie.
- ZIP zdjęć: pojedynczej wizyty i wszystkich wizyt z okresu/handlowca, z plikiem `wizyty.csv`; zapis w audycie.
- Podział wg rejonu: k-średnie po współrzędnych (bez współrzędnych — kod pocztowy + ulica), jeden rejon na handlowca.
- Sesje: wylogowanie admina po bezczynności, maks. długość sesji handlowca (ustawienia).
- Powiadomienia w panelu (dzwonek): kolejka powyżej progu, terminy (zbliżające się i przekroczone), próby zrzutu ekranu,
  flagi biometrii; opcjonalnie powiadomienia przeglądarki.
- Retencja: zdjęcia starsze niż ustawiony okres usuwane automatycznie przy wejściu do panelu (z wpisem w audycie).
- Aplikacja: zakładka Mapa z własnymi adresami w kolorach statusów; wymuszanie aktualnej wersji (blokada do aktualizacji);
  service worker — aplikacja otwiera się bez internetu (ostatnia pobrana wersja); manifest PWA.

## 0.3.0 — 2026-11-21

Kolorystyka sekcji i pod-zakładki:

- Każda sekcja panelu ma swój kolor i ikonę (pasek boczny, nagłówek strony, pasek u góry):
  Pulpit niebieski, Nieruchomości cyjan, Do weryfikacji bursztyn, Handlowcy fiolet, Raporty róż, Ustawienia szary.
- Pod-zakładki z licznikami:
  - Nieruchomości: Wszystkie / Nieprzypisane / Przypisane (zamiast listy rozwijanej),
  - Do weryfikacji: Wszystkie / Lokalizacja / Adres-OCR / Zdjęcia / Czas / Biometria — kolorowe etykiety powodów,
  - Raporty: Skuteczność / Wyniki rozmów / Dziennik zdarzeń,
  - Ustawienia: Progi weryfikacji / Biometria / Cele w raportach / Tryb demo.
- Aplikacja: pod-zakładki Do zrobienia / Wysłane / Wszystkie, kolor statusu na krawędzi karty adresu.
- Kolory statusów (zielony / bursztyn / czerwony) bez zmian — kolory sekcji ich nie dublują.

## 0.2.0 — 2026-11-21

Biometria behawioralna jako **flagi** (nigdy automatyczne odrzucenie):

- Rytm PIN-u przy logowaniu w aplikacji — profil z pierwszych logowań, potem porównanie odstępów między cyframi.
- Podpis palcem na podsumowaniu wizyty — pierwsze podpisy tworzą wzór, kolejne porównywane (kształt DTW, tempo, rytm).
- Dynamika dotyku w tle podczas wizyty — czas i odstępy stuknięć, wielkość kontaktu, prędkość przewijania.
- Panel: wyniki biometrii i miniatura podpisu w szczegółach wizyty, postęp nauki profilu i reset profilu u handlowca,
  ustawienia (włączniki, progi, liczba próbek do nauki, „flaga kieruje do weryfikacji”).
- Testy: `tests/biometrics.test.mjs`. Dokumentacja: `docs/BIOMETRIA.md`.

## 0.1.0 — 2026-11-21

Pierwszy prototyp (bez serwera, dane lokalne w przeglądarce).

- Panel administratora: pulpit z KPI i mapą, nieruchomości (import CSV/XLSX, geokodowanie, przypisywanie, podział równy),
  kolejka „Do weryfikacji”, handlowcy, raporty z eksportem CSV i dziennikiem zdarzeń, ustawienia progów.
- Aplikacja handlowca: logowanie PIN z powiązaniem urządzenia, lista adresów, wizyta w 2 zdjęciach z OCR (Tesseract.js),
  GPS (z trybem demo), wynik rozmowy, natychmiastowa kontrola po wysłaniu.
- Reguły automatycznej weryfikacji: ulica (Levenshtein), numer budynku i lokalu, odległość i dokładność GPS,
  odstęp zdjęć, termin, duplikat zdjęcia (dHash), zdjęcie z aparatu.
- Języki PL / EN / UA, tryb dzień / noc, tooltipy i ikonki [?].
- Dane demo: 5 handlowców, 50 adresów, wizyty z bieżącego tygodnia.
