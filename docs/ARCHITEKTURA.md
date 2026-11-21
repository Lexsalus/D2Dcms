# Architektura

## Teraz (prototyp)

```
przeglądarka
 ├─ admin/  ─┐
 ├─ app/    ─┼─ assets/js/store.js ── localStorage  (tabele JSON, klucz fc.db.v1)
 │           │                     └─ IndexedDB     (pliki zdjęć, baza fc-photos)
 └───────────┴─ assets/js/verify.js (reguły kontroli)
```

- Statyczny hosting (GitHub Pages, workflow `.github/workflows`), bez kroku budowania.
- Moduły ES, bez frameworka. Biblioteki z CDN ładowane tylko gdy potrzebne: Leaflet (mapa), SheetJS (XLSX), Tesseract.js (OCR).
- `store.js` udostępnia **asynchroniczne** funkcje o kształcie docelowego API — ekrany nie wiedzą, skąd są dane.

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
| `users` | id, role (`admin`/`manager`/`rep`), name, email, active, device_id, session_version |
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
- Manager (później): odczyt i decyzje w obrębie swojego zespołu, bez eksportu i pobierania zdjęć.
