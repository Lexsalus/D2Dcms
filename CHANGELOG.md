# Changelog

## 0.5.1 — 2026-11-23

- Supabase: `supabase/00_reset.sql` (czyszczenie schematu) i `supabase/01_schema.sql` — tabele, RLS, funkcje RPC,
  weryfikacja wizyty po stronie serwera (czas serwera, te same reguły co w prototypie), audyt z IP, prywatny bucket zdjęć.
- `assets/js/config.js` z adresem projektu i kluczem publicznym (prototyp nadal działa lokalnie: `BACKEND = 'local'`).
- Instrukcja: `docs/SUPABASE.md`.

## 0.5.0 — 2026-11-23

Etap 3:

- **Rola Manager:** logowanie do panelu, zespół handlowców; widzi pulpit, kolejkę weryfikacji i raporty tylko swojego
  zespołu, podejmuje decyzje; bez eksportu, pobierania zdjęć, przypisywania i ustawień (blokada także w warstwie danych).
  Zarządzanie: *Handlowcy → Managerowie*. Demo: `manager@fieldcheck.demo` / `demo1234`.
- **Trasy:** w aplikacji „Trasa na dziś” — nieodwiedzone adresy w kolejności najkrótszego przejścia (najbliższy sąsiad + 2-opt),
  numerowane pinezki, długość trasy, nawigacja Google Maps z punktami pośrednimi. W panelu — zrealizowana trasa
  handlowca w wybranym dniu (kolejność wysłania, punkty GPS, km, godziny).
- **Raporty zaawansowane:** zakładka Trendy — wizyty dziennie wg handlowca, godziny wysyłania wizyt, powody oznaczeń wg handlowca.
- **Integracja z CRM:** webhooki (`visit.submitted`, `visit.decided`, `assignment.created`) z tokenem i dziennikiem dostaw,
  eksport JSON (schema 1), import adresów z JSON z `external_id`. Opis: `docs/INTEGRACJA.md`.

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
