# Plan prac

| Etap | Zakres | Status |
|---|---|---|
| 0 · Prototyp | panel + aplikacja w przeglądarce, dane lokalne, reguły kontroli, PL/EN/UA, dzień/noc, podpowiedzi | ✅ 0.1.0 |
| 0.2 · Biometria | rytm PIN-u, podpis palcem, dynamika dotyku — jako flagi | ✅ 0.2.0 |
| 0.3–0.4 · Panel i aplikacja | kolory i pod-zakładki, filtr statusu, eksport XLSX/PDF, ZIP zdjęć, podział wg rejonu, sesje, powiadomienia w panelu, retencja, mapa w aplikacji, wymuszanie wersji, offline (service worker) | ✅ 0.4.0 |
| 1 · Backend | pozostało: serwerowy OCR, powiadomienia e-mail/push, kolejka offline wizyt, własny SMTP | ⏳ |
| 2 · Android | Capacitor, FLAG_SECURE, aparat bez galerii, ML Kit, Play Integrity, powiązanie urządzenia | ⏳ |
| 3 · Rozszerzenia | rola Manager, trasy, raporty zaawansowane, integracja z CRM (webhooki + JSON) | ✅ 0.5.0 (prototyp) |
| 0.6 · Supabase | tryb produkcyjny: Auth (hasła, zaproszenia, 2FA), RLS, RPC, weryfikacja na serwerze, Storage, Edge Function kont, webhooki przez bazę; podział kodu na moduły | ✅ 0.6.0 |
| 4 · Później | iOS, konkretne podpięcie CRM, powiadomienia e-mail/push z serwera | ⏳ |

## Otwarte kwestie techniczne

- Konfigurowalna lista wyników rozmowy (różne scenariusze pracy w terenie).
- Tryb pracy bez listy adresów (handlowiec dopisuje adresy na miejscu).
- Wybór dostawcy serwerowego OCR i geokodowania (koszt / jakość dla polskich adresów).
- Logowanie biometrią telefonu (odcisk / twarz) — WebAuthn w przeglądarce, wtyczka biometryczna w Capacitorze.
- Wymagania prawne dot. danych osobowych, GPS, zdjęć i biometrii behawioralnej (regulamin, retencja, DPIA) — do ustalenia przed wdrożeniem.
