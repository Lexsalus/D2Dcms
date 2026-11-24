# Supabase — uruchomienie

Projekt: `qbtbquzylmgheaqlljhg` · adres API: `https://qbtbquzylmgheaqlljhg.supabase.co`
Klucz publiczny (publishable) jest w [`assets/js/core/config.js`](../assets/js/core/config.js). **Klucza secret / service_role nie umieszczamy w repo ani w przeglądarce.**

## Stan

2026-11-23 (0.6.0): uruchomione `02_extras.sql` (powiązanie urządzenia, webhooki przez `pg_net`, sekrety, wymóg 2FA),
wdrożona Edge Function `admin-users`, konfiguracja Auth: adres panelu `https://lexsalus.github.io/D2Dcms/admin/`,
dozwolone przekierowania GitHub Pages i `localhost:8765`, TOTP (2FA) włączone, rejestracja wyłączona.
Test e2e (`tests/e2e-supabase.mjs`) przeszedł w całości.

2026-11-23: projekt wyczyszczony (poprzednie tabele, funkcje i konta usunięte), uruchomione `00_reset.sql` i `01_schema.sql`,
publiczna rejestracja wyłączona. Sprawdzone: klucz publiczny bez logowania nie widzi żadnych danych (RLS).

## Kroki (od zera)

1. **SQL Editor → `supabase/00_reset.sql`** — czyści schemat `public` (tabele, widoki, funkcje, typy).
   Obiekty rozszerzeń zostają. Użytkowników logowania i pliki w Storage czyści się ręcznie w panelu.
2. **SQL Editor → `supabase/01_schema.sql`**, potem `02_extras.sql`, `03_pin.sql` i `04_case_type.sql` — tabele, RLS, funkcje, bucket `photos`, webhooki, PIN-y. Można uruchamiać ponownie.
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

## Konta i logowanie

| Kto | Jak powstaje konto | Logowanie |
|---|---|---|
| Admin, manager | panel → *Handlowcy → Managerowie → Dodaj* (rola manager / admin) → zaproszenie e-mailem; gdy e-maila nie da się wysłać, panel pokazuje link do przekazania | e-mail + hasło (+ kod 2FA, jeśli włączone) |
| Handlowiec | panel → *Handlowcy → Dodaj* (login w formie e-maila + PIN 4–6 cyfr) | aplikacja: login + PIN (telefon pamięta login); 5 błędnych prób = blokada 15 min; konto przypięte do pierwszego telefonu |

- **2FA (TOTP):** każdy włącza / wyłącza w *Moje konto* (kliknięcie nazwiska w panelu). Admin może w *Ustawieniach →
  Sesje i powiadomienia* wymagać 2FA od adminów i managerów — wtedy baza (`my_role()`) nie daje im uprawnień bez `aal2`.
- **Poczta:** projekt używa domyślnej poczty Supabase (limit kilku e-maili na godzinę, wysyłka tylko na adresy członków
  organizacji Supabase). Dla zaproszeń na dowolne adresy trzeba podłączyć własny SMTP (*Authentication → Emails → SMTP*);
  do tego czasu panel pokazuje link zaproszenia do przekazania.

## Edge Functions

- `admin-users` — zakładanie kont (handlowiec z PIN-em, admin / manager z zaproszeniem), zmiana PIN-u, link do hasła, usuwanie.
- `rep-login` — logowanie handlowca loginem i PIN-em (`fc_check_pin`), zwraca jednorazowy token wymieniany w aplikacji na sesję.

## Edge Function `admin-users`

`supabase/functions/admin-users/index.ts` — akcje `create`, `set_password`, `reinvite`, `delete`; wywołuje tylko aktywny admin.
Wdrożenie (z katalogu repo, token w zmiennej `SUPABASE_ACCESS_TOKEN`):

```powershell
npx supabase functions deploy admin-users --project-ref qbtbquzylmgheaqlljhg --no-verify-jwt --use-api --yes
```

## Dane testowe

`node tests/seed-supabase.mjs <plik>` (z `SB_SERVICE`) zakłada konta `@fieldcheck.test` (5 handlowców z PIN-ami, manager),
53 adresy `TEST-…`, przypisania i 43 wizyty ze zdjęciami; dane logowania zapisuje do pliku. `--remove` usuwa wszystko testowe.

## Test end-to-end

```powershell
npm i --no-save playwright-core
$env:SB_SERVICE = '<klucz service_role>'   # tylko w tej sesji, nie zapisywać
node tests/e2e-supabase.mjs
```

Zakłada konta testowe `e2e-*@fieldcheck.test`, przechodzi: logowanie admina → założenie handlowca → import i przypisanie →
wizyta w aplikacji (2 zdjęcia, podpis) → ocena serwera → podgląd zdjęcia w panelu → audyt z IP, potem wszystko usuwa.

## Następne kroki

- Własny SMTP (zaproszenia i reset hasła na dowolne adresy).
- Szybkie odblokowanie aplikacji PIN-em / biometrią telefonu po pierwszym logowaniu.
- Serwerowy OCR (Google Cloud Vision / Azure) w Edge Function; powiadomienia e-mail/push.
