# Plan prac

| Etap | Zakres | Status |
|---|---|---|
| 0 · Prototyp | panel + aplikacja w przeglądarce, dane lokalne, reguły kontroli, PL/EN/UA, dzień/noc, podpowiedzi | ✅ 0.1.0 |
| 0.2 · Biometria | rytm PIN-u, podpis palcem, dynamika dotyku — jako flagi | ✅ 0.2.0 |
| 0.3–0.4 · Panel i aplikacja | kolory i pod-zakładki, filtr statusu, eksport XLSX/PDF, ZIP zdjęć, podział wg rejonu, sesje, powiadomienia w panelu, retencja, mapa w aplikacji, wymuszanie wersji, offline (service worker) | ✅ 0.4.0 |
| 1 · Backend | Supabase: schemat, RLS, Auth (2FA admina), Storage, Edge Function kontroli wizyty, serwerowy OCR, 2FA admina, IP w audycie, powiadomienia e-mail/push, kolejka offline wizyt | ⏳ |
| 2 · Android | Capacitor, FLAG_SECURE, aparat bez galerii, ML Kit, Play Integrity, powiązanie urządzenia | ⏳ |
| 3 · Rozszerzenia | iOS, tryb offline, powiadomienia, rola Manager, trasy na mapie, raporty PDF, retencja zdjęć | ⏳ |

## Otwarte kwestie techniczne

- Konfigurowalna lista wyników rozmowy (różne scenariusze pracy w terenie).
- Tryb pracy bez listy adresów (handlowiec dopisuje adresy na miejscu).
- Wybór dostawcy serwerowego OCR i geokodowania (koszt / jakość dla polskich adresów).
- Logowanie biometrią telefonu (odcisk / twarz) — WebAuthn w przeglądarce, wtyczka biometryczna w Capacitorze.
- Wymagania prawne dot. danych osobowych, GPS, zdjęć i biometrii behawioralnej (regulamin, retencja, DPIA) — do ustalenia przed wdrożeniem.
