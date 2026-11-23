# Supabase — uruchomienie

Projekt: `qbtbquzylmgheaqlljhg` · adres API: `https://qbtbquzylmgheaqlljhg.supabase.co`
Klucz publiczny (publishable) jest w [`assets/js/config.js`](../assets/js/config.js). **Klucza secret / service_role nie umieszczamy w repo ani w przeglądarce.**

## Stan

2026-11-23: projekt wyczyszczony (poprzednie tabele, funkcje i konta usunięte), uruchomione `00_reset.sql` i `01_schema.sql`,
publiczna rejestracja wyłączona. Sprawdzone: klucz publiczny bez logowania nie widzi żadnych danych (RLS).

## Kroki (od zera)

1. **SQL Editor → `supabase/00_reset.sql`** — czyści schemat `public` (tabele, widoki, funkcje, typy).
   Obiekty rozszerzeń zostają. Użytkowników logowania i pliki w Storage czyści się ręcznie w panelu.
2. **SQL Editor → `supabase/01_schema.sql`** — tabele, RLS, funkcje, bucket `photos`. Można uruchamiać ponownie.
3. **Authentication → Users → Add user** — konto administratora (e-mail + hasło, *Auto Confirm User*).
4. **SQL Editor:**
   ```sql
   update public.profiles set role = 'admin', active = true, name = 'Admin' where email = 'TWÓJ_EMAIL';
   ```
5. **Authentication → Sign In / Providers → Email:** wyłącz publiczną rejestrację (*Allow new users to sign up*),
   konta zakłada admin.

## Co jest w schemacie

| Element | Opis |
|---|---|
| `profiles` | rola (`admin` / `manager` / `rep`), aktywność, urządzenie, wersja sesji, zespół managera; tworzony automatycznie dla nowego konta (nieaktywny) |
| `properties`, `assignments`, `visits`, `photos` | dane wizyt; unikalny adres; jedno przypisanie na adres |
| `audit_log` | kto, co, kiedy **i z jakiego IP** (z nagłówka żądania) |
| `settings` | progi (te same klucze co w panelu) |
| `bio_profiles`, `webhook_log` | profile biometrii, dziennik webhooków |
| bucket `photos` | prywatny; ścieżka `{rep_id}/{visit_id}/{typ}.jpg`; zapis — tylko handlowiec do swojego folderu; odczyt — admin i manager w zakresie zespołu |

### Funkcje (RPC) — jedyna droga zmiany statusów

| Funkcja | Kto | Co robi |
|---|---|---|
| `start_visit(assignment)` | handlowiec | otwiera wizytę (lub zwraca otwartą), status `IN_PROGRESS` |
| `submit_visit(visit, outcome, note, bio, signature)` | handlowiec | **serwer nadaje czas i ocenia wizytę** (`fc_verify`: OCR/Levenshtein, numery, GPS, odstęp, termin, duplikat pHash, aparat) |
| `decide_visit(visit, decision, reason)` | admin, manager (zespół) | zatwierdź / odrzuć (z powodem) / ponowna wizyta / cofnij |
| `log_event(action, object)` | zalogowani | wpis w dzienniku (np. próba zrzutu ekranu) |

Handlowiec nie może zmienić statusu, decyzji ani czasu wizyty — ma uprawnienia tylko do kolumn GPS
i do dodania zdjęć w swojej otwartej wizycie. Po wysłaniu nie widzi już zdjęć.

## Przetestowane lokalnie (PostgreSQL 16 z atrapą auth/storage)

- reset → schemat → ponowne uruchomienie schematu → reset: bez błędów;
- handlowiec widzi tylko swoje przypisania i adresy, nie otworzy cudzej wizyty, nie zmieni statusu;
- poprawna wizyta → `AUTO_VERIFIED`; duplikat + GPS 667 m + brak numeru + flaga PIN → `TO_REVIEW` z 4 powodami;
- manager widzi tylko zespół, decyzja dla spoza zespołu → `forbidden`; odrzucenie bez powodu → `reason_required`;
- „ponowna wizyta” → przypisanie wraca do `ASSIGNED`.

## Następne kroki

- Podłączenie `store.js` do Supabase (`BACKEND = 'supabase'` w `config.js`), logowanie przez Supabase Auth.
- Logowanie handlowca: e-mail + hasło raz na urządzeniu, potem PIN / biometria jako szybkie odblokowanie.
- Edge Function: zakładanie kont przez admina, serwerowy OCR, webhooki CRM, powiadomienia e-mail/push.
