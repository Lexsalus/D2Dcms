# Biometria behawioralna

Kod: [`assets/js/domain/biometrics.js`](../assets/js/domain/biometrics.js), integracja w `assets/js/data/store.js` i `store-sb.js` (`pinCheck`, `sigCheck`, `touchCheck`).
Metody wzorowane na projekcie [behavioral-biometrics](https://github.com/michalstankiewicz4-cell/behavioral-biometrics)
(rytm hasła, weryfikacja podpisu DTW).

**Zasada:** wynik biometrii to wyłącznie **flaga** do ręcznego sprawdzenia. Nigdy nie odrzuca wizyty automatycznie.
Cel: wychwycić sytuację, w której wizytę wykonuje inna osoba niż handlowiec (np. ktoś z jego telefonem i PIN-em).

## Wynik

Każdy sygnał daje liczbę „ile razy bardziej niż zwykle” próba różni się od profilu — odchylenie od wzorca
podzielone przez naturalny rozrzut wzorców (z dolnym limitem rozrzutu). `≈1×` = jak zwykle. Powyżej progu → flaga.

Najpierw jest **nauka**: pierwsze N prób tylko buduje profil (N ustawiane w panelu). Profil PIN-u i dotyku
uczy się dalej na próbach bez flagi; wzorce podpisu są stałe po nauce. Admin może zresetować profil handlowca.

## 1. Rytm PIN-u

- Pomiar: czas pojawienia się każdej cyfry w polu PIN (klawiatura ekranowa nie daje czasu przytrzymania klawisza).
- Cechy: logarytmy odstępów między kolejnymi cyframi (PIN 4 cyfry → 3 odstępy).
- Wynik: średnie |z| odstępów względem ostatnich 10 zgodnych logowań, min. rozrzut 0,12 (log).
- Wynik logowania trafia do sesji i jest dołączany do każdej wizyty rozpoczętej w tej sesji.

## 2. Podpis palcem

- Na podsumowaniu wizyty (wymagany, gdy włączony). Kreski `{x, y, t}` z pointer events.
- Cechy: kształt (wyśrodkowanie, skalowanie, 64 punkty), czas podpisu, profil prędkości w 12 odcinkach czasu.
- Wynik = średnia z: kształtu (DTW względem wzorców / rozrzut DTW wzorców), tempa (|log czasu − średnia| / rozrzut),
  rytmu (1 − korelacja profili / rozrzut wzorców).
- Miniatura podpisu widoczna w szczegółach wizyty w panelu.

## 3. Dynamika dotyku

- Zbierana w tle od rozpoczęcia do wysłania wizyty (bez pola podpisu).
- Cechy (mediany, log): czas przytrzymania stuknięcia, odstęp między stuknięciami, wielkość kontaktu
  (`PointerEvent.width × height`, jeśli urządzenie podaje), prędkość przesunięć.
- Wymaga min. 5 stuknięć. Najmniej pewny sygnał — domyślnie najwyższy próg.

## Ustawienia (panel → Ustawienia → Biometria behawioralna)

| Ustawienie | Domyślnie |
|---|---|
| Rytm PIN-u / Podpis / Dotyk — włączniki | wł. |
| Flaga kieruje wizytę do weryfikacji | wł. (wył. = flaga tylko widoczna w szczegółach) |
| Próg PIN / podpis / dotyk | 2,5× / 2,0× / 3,0× |
| Próbek do nauki PIN / podpis / dotyk | 5 / 3 / 5 |

## Ograniczenia

- Mało próbek → błędy w obie strony. Dlatego tylko flaga, a progi są do strojenia na realnych danych.
- Zmęczenie, pogoda (rękawiczki), inny telefon zmieniają zachowanie — po zmianie telefonu warto zresetować profil.
- Dane biometrii behawioralnej użyte do rozpoznawania osoby mogą być danymi szczególnej kategorii —
  przed wdrożeniem wymagana analiza prawna (podstawa przetwarzania, DPIA, retencja). W wersji z serwerem
  profile w osobnej tabeli z ostrzejszym dostępem.

## Testy

`node tests/biometrics.test.mjs` — rytm PIN-u, podpis i dotyk: próby zgodne poniżej progu, obce powyżej.
