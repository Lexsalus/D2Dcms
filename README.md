# FieldCheck

System kontroli wizyt w terenie (windykacja terenowa, D2D): panel administratora + aplikacja handlowca.
Handlowiec dostaje listę adresów, na miejscu robi 2 zdjęcia (budynek z numerem, numer lokalu), wybiera wynik rozmowy,
a system sam sprawdza OCR, GPS, czas i duplikaty. Wizyty wątpliwe trafiają do ręcznej weryfikacji.

> **Status: prototyp 0.5.x** — działa w przeglądarce, dane zapisywane lokalnie (localStorage + IndexedDB).
> Backend (Supabase) i aplikacja Android (Capacitor) — kolejne etapy, patrz [docs/PLAN.md](docs/PLAN.md).

## Uruchomienie

- **GitHub Pages:** strona startowa → *Panel administratora* (`/admin/`) lub *Aplikacja handlowca* (`/app/`).
- **Lokalnie:** dowolny serwer statyczny w katalogu repo (moduły ES nie działają z `file://`), np.
  ```powershell
  py -m http.server 8000
  ```
  i otwórz `http://localhost:8000`.

### Dane demo

| Rola | Logowanie |
|---|---|
| Administrator | `admin@fieldcheck.demo` / `demo1234` |
| Manager | `manager@fieldcheck.demo` / `demo1234` (zespół: Anna K., Piotr N., Marta S.) |
| Handlowiec | wybór z listy (Anna K., Piotr N., …), PIN `1234` |

Panel i aplikacja w tej samej przeglądarce współdzielą dane — przypisanie w panelu od razu widać w aplikacji, a wysłana wizyta trafia do panelu.
*Ustawienia → Przywróć dane demo* wczytuje przykładowy zestaw od nowa.

## Funkcje (0.5)

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
- Wizyta w 2 krokach: zdjęcie budynku → zdjęcie lokalu (lub drzwi „brak numeru”), wstępny odczyt OCR na urządzeniu.
- Podsumowanie, wynik rozmowy, notatka, wysłanie → natychmiastowy wynik kontroli.
- Znak wodny (handlowiec + urządzenie + data), zasłona przy przełączaniu aplikacji, blokada kopiowania.

**Biometria behawioralna (flagi):** rytm PIN-u, podpis palcem, dynamika dotyku — szczegóły w [docs/BIOMETRIA.md](docs/BIOMETRIA.md).

**Wspólne:** języki PL / EN / UA, tryb dzień / noc, kolor i ikona każdej sekcji, pod-zakładki z licznikami, podpowiedzi (dymki i ikonki **[?]**) przy elementach interfejsu.

## Struktura

```
index.html            strona startowa
admin/                panel administratora (index.html, admin.js, admin.css)
app/                  aplikacja handlowca (index.html, app.js, app.css)
assets/js/
  version.js          numer wersji (podbijany przy każdej wysyłce)
  i18n.js             tłumaczenia PL/EN/UA
  help.js             teksty podpowiedzi PL/EN/UA
  ui.js               motyw, przełączniki, toast, modal, tooltipy
  store.js            warstwa danych (atrapa backendu, API jak docelowe)
  verify.js           reguły automatycznej weryfikacji
  biometrics.js       biometria behawioralna (PIN, podpis, dotyk)
  route.js            planowanie trasy (najbliższy sąsiad + 2-opt)
  integration.js      webhooki i format wymiany z CRM
assets/css/base.css   wspólne style i paleta
docs/                 dokumentacja techniczna
```

## Wersjonowanie

Każda wysyłka (push) = podbicie wersji w `assets/js/version.js` + wpis w [CHANGELOG.md](CHANGELOG.md).
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
