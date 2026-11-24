# FieldCheck

System kontroli wizyt w terenie (windykacja terenowa, D2D): panel administratora + aplikacja handlowca.
Handlowiec dostaje listę adresów, na miejscu robi 2 zdjęcia (budynek z numerem, numer lokalu), wybiera wynik rozmowy,
a system sam sprawdza OCR, GPS, czas i duplikaty. Wizyty wątpliwe trafiają do ręcznej weryfikacji.

> **Status: 0.7.x** — dwa tryby (wybór na stronie startowej):
> - **Produkcja** (domyślnie): baza Supabase, prawdziwe konta, zdjęcia w prywatnym magazynie, weryfikacja na serwerze — [docs/SUPABASE.md](docs/SUPABASE.md);
> - **Demo**: przykładowe dane tylko w przeglądarce (localStorage + IndexedDB).
>
> Aplikacja Android (Capacitor) — kolejny etap, patrz [docs/PLAN.md](docs/PLAN.md).

## Uruchomienie

- **GitHub Pages:** strona startowa → *Panel administratora* (`/admin/`) lub *Aplikacja handlowca* (`/app/`).
- **Lokalnie:** dowolny serwer statyczny w katalogu repo (moduły ES nie działają z `file://`), np.
  ```powershell
  py -m http.server 8000
  ```
  i otwórz `http://localhost:8000`.

### Logowanie (produkcja)

Konta zakłada administrator w panelu (*Handlowcy*): handlowiec dostaje login + PIN (jak w demo), admin / manager —
zaproszenie z linkiem do ustawienia hasła. 2FA włącza każdy w *Moje konto*; admin może je wymagać w *Ustawieniach*.

### Dane demo (tryb Demo)

| Rola | Logowanie |
|---|---|
| Administrator | `admin@fieldcheck.demo` / `demo1234` |
| Manager | `manager@fieldcheck.demo` / `demo1234` (zespół: Anna K., Piotr N., Marta S.) |
| Handlowiec | wybór z listy (Anna K., Piotr N., …), PIN `1234` |

Panel i aplikacja w tej samej przeglądarce współdzielą dane — przypisanie w panelu od razu widać w aplikacji, a wysłana wizyta trafia do panelu.
*Ustawienia → Przywróć dane demo* wczytuje przykładowy zestaw od nowa.

## Funkcje (0.7)

**Panel administratora**
- Pulpit: KPI z filtrami (okres, handlowiec, status), realizacja planu wg handlowca, statusy adresów, ostatnie wizyty, mapa (Leaflet/OSM).
- Powiadomienia (dzwonek): kolejka powyżej progu, terminy, próby zrzutu ekranu, flagi biometrii; opcjonalnie powiadomienia przeglądarki.
- Nieruchomości: import CSV/XLSX, dodawanie ręczne, geokodowanie (Nominatim), przypisywanie, podział równy lub wg rejonu, termin.
- Do weryfikacji: dwa zdjęcia, odczyt OCR, zgodność adresu, GPS, odstęp zdjęć, duplikat; zatwierdź / odrzuć / ponowna wizyta; ZIP zdjęć wizyty.
- Role: administrator (pełny dostęp) i manager (pulpit, weryfikacja i raporty swojego zespołu, bez eksportu i pobierania zdjęć).
- Handlowcy: konta, PIN, aktywacja, powiązanie z jednym urządzeniem, zdalne wylogowanie.
- Raporty: realizacja planu, auto-weryfikacja, odrzucone, wizyty dziennie, czas na adres, wyniki rozmów, czas decyzji; eksport CSV / XLSX / PDF, ZIP zdjęć z okresu; trendy (wizyty dziennie, godziny, powody wg handlowca); dziennik zdarzeń.
- Trasa handlowca na mapie pulpitu (zrealizowana w wybranym dniu).
- Integracja z CRM: webhooki zdarzeń, eksport JSON, import adresów z JSON — [docs/INTEGRACJA.md](docs/INTEGRACJA.md).
- Ustawienia: progi automatycznej weryfikacji, biometria, cele w raportach, sesje i powiadomienia, retencja zdjęć, tryb demo GPS.

**Aplikacja handlowca**
- Logowanie PIN (sesja z limitem czasu), lista i mapa własnych adresów, trasa na dziś z nawigacją Google Maps.
- Wymuszanie aktualnej wersji, działanie offline (service worker, ostatnia pobrana wersja).
- Wizyta na jednym ekranie po kliknięciu adresu: zdjęcie klatki / budynku, zdjęcie drzwi (albo „brak numeru”), wynik rozmowy,
  notatka, podpis, wysłanie → natychmiastowy wynik kontroli. Między zdjęciami można wyjść z aplikacji — wizyta jest zapisana.
- Znak wodny (handlowiec + urządzenie + data), zasłona przy przełączaniu aplikacji, blokada kopiowania.

**Biometria behawioralna (flagi):** rytm PIN-u, podpis palcem, dynamika dotyku — szczegóły w [docs/BIOMETRIA.md](docs/BIOMETRIA.md).

**Wspólne:** języki PL / EN / UA, tryb dzień / noc, kolor i ikona każdej sekcji, pod-zakładki z licznikami, podpowiedzi (dymki i ikonki **[?]**) przy elementach interfejsu.

## Struktura

```
index.html                 strona startowa (wybór panelu / aplikacji, tryb Produkcja / Demo)
admin/
  index.html, admin.css    panel administratora
  js/main.js               start, logowanie, nawigacja
  js/core.js               wspólny stan, kolory sekcji, filtry, pomocnicze
  js/views/                widoki: dashboard, properties, review, reps, reports, settings
  js/lib/                  account (hasło, 2FA), notifications, import, export, trends
app/
  index.html, app.css      aplikacja handlowca (PWA: manifest, sw.js, icon.svg)
  js/main.js               start, wersja, offline, przełączanie ekranów
  js/core.js               stan, nawigacja, pasek górny
  js/screens/              login, list, map, visit (zdjęcia, wynik, notatka, wysłanie), detail, result, profile
  js/lib/                  capture (aparat, GPS, OCR), signature, protect (ochrona treści)
assets/js/
  core/                    config, version, i18n (PL/EN/UA), help (podpowiedzi), ui (motyw, tooltipy, modal)
  domain/                  verify (reguły kontroli), biometrics, route (trasy, rejony), integration (CRM)
  data/                    data.js (wybór trybu), store.js (demo), store-sb.js (Supabase)
assets/css/base.css        wspólne style, paleta, statusy, pod-zakładki, tooltipy
supabase/                  00_reset … 04_case_type.sql, functions/admin-users i rep-login (Edge Functions)
tests/                     testy reguł i biometrii (Node), e2e na Supabase (Edge/Chrome), dane testowe (seed)
docs/                      dokumentacja techniczna
```

## Wersjonowanie

Każda wysyłka (push) = podbicie wersji w `assets/js/core/version.js` + wpis w [CHANGELOG.md](CHANGELOG.md).
Wersja jest widoczna w stopce panelu, na ekranie logowania i w profilu aplikacji.
Schemat: `MAJOR.MINOR.PATCH` — PATCH poprawki, MINOR nowe funkcje, MAJOR zmiana niekompatybilna (np. przejście na serwer).

## Dokumentacja

- [docs/ARCHITEKTURA.md](docs/ARCHITEKTURA.md) — warstwy, model danych, przejście na Supabase
- [docs/WERYFIKACJA.md](docs/WERYFIKACJA.md) — statusy i reguły automatycznej kontroli
- [docs/BIOMETRIA.md](docs/BIOMETRIA.md) — rytm PIN-u, podpis, dynamika dotyku
- [docs/INTEGRACJA.md](docs/INTEGRACJA.md) — webhooki i wymiana JSON z CRM
- [docs/SUPABASE.md](docs/SUPABASE.md) — uruchomienie bazy, schemat, RLS, funkcje
- [docs/ANDROID.md](docs/ANDROID.md) — aplikacja Android (Capacitor), ochrona ekranu, OCR
- [docs/PLAN.md](docs/PLAN.md) — etapy prac
