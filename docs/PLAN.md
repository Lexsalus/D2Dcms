# Plan prac

| Etap | Zakres | Status |
|---|---|---|
| 0 · Prototyp | panel + aplikacja w przeglądarce, dane lokalne, reguły kontroli, PL/EN/UA, dzień/noc, podpowiedzi | ✅ 0.1.0 |
| 1 · Backend | Supabase: schemat, RLS, Auth (2FA admina), Storage, Edge Function kontroli wizyty, serwerowy OCR | ⏳ |
| 2 · Android | Capacitor, FLAG_SECURE, aparat bez galerii, ML Kit, Play Integrity, powiązanie urządzenia | ⏳ |
| 3 · Rozszerzenia | iOS, tryb offline, powiadomienia, rola Manager, trasy na mapie, raporty PDF, retencja zdjęć | ⏳ |

## Otwarte kwestie techniczne

- Konfigurowalna lista wyników rozmowy (różne scenariusze pracy w terenie).
- Tryb pracy bez listy adresów (handlowiec dopisuje adresy na miejscu).
- Wybór dostawcy serwerowego OCR i geokodowania (koszt / jakość dla polskich adresów).
- Wymagania prawne dot. danych osobowych, GPS i zdjęć (regulamin, retencja, DPIA) — do ustalenia przed wdrożeniem.
