# Changelog

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
