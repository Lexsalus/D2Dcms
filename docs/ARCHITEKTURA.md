# Architektura

## Teraz

```
przeglądarka
 ├─ admin/js (main → views, lib) ─┐
 ├─ app/js (main → screens, lib) ─┼─ assets/js/data/data.js ─┬─ store-sb.js → Supabase (Auth, Postgres + RLS, Storage, RPC, Edge Function)
 │                                │                          └─ store.js    → localStorage + IndexedDB (tryb Demo)
 └────────────────────────────────┴─ assets/js/domain (verify, biometrics, route, integration)
```

- Statyczny hosting (GitHub Pages, workflow build → deploy), bez kroku budowania, moduły ES.
- Oba magazyny mają **to samo API** — ekrany nie wiedzą, który działa. Tryb wybiera `config.js` / strona startowa.
- `store-sb.js` trzyma dane (w zakresie RLS) w pamięci podręcznej, odświeża po zmianach i co 20 s; zapisy i zmiany
  statusów idą przez funkcje RPC (`start_visit`, `submit_visit`, `decide_visit`, `log_event`, `bind_device`).
- Weryfikacja wizyty jest **wiążąca po stronie serwera** (`fc_verify` w SQL); `verify.js` w przeglądarce służy do podglądu i trybu demo.
- Konta zakłada Edge Function `admin-users` (klucz serwisowy nigdy nie trafia do przeglądarki).
- Webhooki CRM wysyła baza (`pg_net`), adres i token w tabeli `secrets` dostępnej tylko dla admina.

## Docelowo

| Warstwa | Technologia |
|---|---|
| Panel admina | ten sam front (GitHub Pages lub inny hosting statyczny) |
| Aplikacja handlowca | ten sam kod JS opakowany w **Capacitor** → Android (potem iOS) |
| Auth | Supabase Auth (admin: e-mail + hasło + TOTP; handlowiec: login + PIN/biometria) |
| Baza | Supabase Postgres + PostGIS, Row Level Security |
| Zdjęcia | Supabase Storage — prywatny bucket, podpisane URL-e o krótkiej ważności, region UE |
| Kontrola wizyty | Supabase Edge Function (TypeScript) — `verify.js` + serwerowy OCR (Google Cloud Vision / Azure) |
| Geokodowanie | przy imporcie (Nominatim lub Google Geocoding) |

Decyzja o statusie wizyty zawsze zapada po stronie serwera; OCR na telefonie służy tylko do podglądu.

## Model danych

| Tabela | Pola |
|---|---|
| `users` | id, role (`admin`/`manager`/`rep`), name, email, active, device_id, session_version, team (manager) |
| `bio_profiles` | user_id, pin_samples (jsonb), sig_templates (jsonb), touch_samples (jsonb), updated_at — osobna tabela, ostrzejszy RLS |
| `properties` | id, street, building, unit, zip, city, lat, lng, notes, created_at |
| `assignments` | id, property_id, user_id, due, status, assigned_by, created_at, updated_at |
| `visits` | id, assignment_id, bio (jsonb: wyniki pin/sig/touch), signature (jsonb), property_id, user_id, started_at, submitted_at, gps_lat, gps_lng, gps_accuracy, outcome, note, status, reasons[], details (jsonb), decision, decision_reason, decided_by, decided_at |
| `photos` | id, visit_id, type (`building`/`unit`/`door`), storage_key, ocr_text, ocr_conf, phash, taken_at |
| `audit_log` | id, user_id, action, object, ip, ts |
| `settings` | progi kontroli i cele raportów (jeden wiersz) |

## Mapowanie `store.js` → Supabase

| Funkcja w `store.js` | Docelowo |
|---|---|
| `loginAdmin`, `loginRep`, `currentUser`, `logout` | `supabase.auth.*`; powiązanie urządzenia w `users.device_id` |
| `listProperties`, `importProperties`, `addProperty` | `properties` (select / insert); import z walidacją w Edge Function |
| `assign`, `splitEvenly`, `unassign` | `assignments` (upsert) — tylko admin (RLS) |
| `myAssignments` | `assignments` + `properties` z RLS `user_id = auth.uid()` |
| `startVisit`, `addPhoto`, `submitVisit` | insert `visits`, upload do Storage, `submit` → Edge Function liczy status |
| `decide` | update `visits`/`assignments` — tylko admin, wpis w `audit_log` |
| `photoUrl`, `logPhotoDownload` | `storage.createSignedUrl` przez Edge Function z wpisem w audycie |
| `listAudit`, `logEvent` | `audit_log` (insert przez trigger / funkcję) |

## Zasady RLS (szkic)

- Handlowiec: `select` tylko swoich `assignments` i powiązanych `properties`; `insert` wizyt i zdjęć tylko do swoich przypisań;
  brak odczytu zdjęć po wysłaniu.
- Admin: pełny dostęp; pobieranie zdjęć i eksport wyłącznie przez funkcje zapisujące audyt.
- Manager: odczyt i decyzje w obrębie swojego zespołu (`users.team`), bez eksportu i pobierania zdjęć — w prototypie
  wymuszane politykami RLS i funkcją `in_scope()` w bazie (w trybie demo: `scope`, `inScope`, `requireAdmin` w `store.js`).
