# Changelog

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
