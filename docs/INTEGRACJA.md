# Integracja z CRM

Dwa mechanizmy: **webhooki** (FieldCheck powiadamia CRM o zdarzeniach) oraz **wymiana plików JSON**
(eksport całości z FieldChecka, import adresów do FieldChecka). Konfiguracja: *Ustawienia → Integracja z CRM*.

Kod: [`assets/js/integration.js`](../assets/js/integration.js).

## Webhooki

`POST` na skonfigurowany adres, `Content-Type: application/json`, nagłówek `X-FieldCheck-Token: <token>` (jeśli ustawiony).

```json
{
  "event": "visit.submitted",
  "schema": 1,
  "sentAt": "2026-11-23T21:32:52.358Z",
  "source": "fieldcheck",
  "data": { ... }
}
```

| Zdarzenie | Kiedy | `data` |
|---|---|---|
| `visit.submitted` | handlowiec wysłał wizytę (po automatycznej kontroli) | rekord wizyty |
| `visit.decided` | decyzja w kolejce weryfikacji | rekord wizyty + `decided_by` |
| `assignment.created` | przypisanie adresów handlowcowi | `rep`, `due`, `properties[]` |
| `test` | przycisk „Wyślij test” | `message`, `by` |

### Rekord wizyty

```json
{
  "id": "uuid",
  "external_id": "ID-z-CRM lub null",
  "property": { "id": "uuid", "street": "Poznańska", "building": "20", "unit": "16", "zip": "62-800", "city": "Kalisz", "lat": 51.76, "lng": 18.09 },
  "assignment": { "id": "uuid", "due": "2026-11-29", "status": "AUTO_VERIFIED" },
  "rep": { "id": "uuid", "name": "Anna K." },
  "started_at": "ISO 8601", "submitted_at": "ISO 8601",
  "status": "AUTO_VERIFIED | TO_REVIEW | APPROVED | REJECTED",
  "outcome": "talked | no_answer | refused | later",
  "note": "tekst lub null",
  "gps": { "lat": 51.76, "lng": 18.09, "accuracy": 12 },
  "reasons": ["r_gps_far", "..."],
  "decision": "approve | reject | revisit | null",
  "decision_reason": "rr_wrong_location | ... | null",
  "decided_at": "ISO 8601 lub null"
}
```

Zdjęcia nie są wysyłane — zostają w FieldChecku (dostęp tylko dla admina, z audytem).

### Ograniczenie prototypu

Prototyp wysyła z przeglądarki, więc serwer CRM musi odpowiadać nagłówkami CORS
(`Access-Control-Allow-Origin`, `Access-Control-Allow-Headers: Content-Type, X-FieldCheck-Token`).
Bez nich wysyłka idzie w trybie *no-cors* i w dzienniku ma status „wysłano bez potwierdzenia”.
W wersji z serwerem webhooki wysyła funkcja serwerowa (bez tego ograniczenia, z ponawianiem).

## Wymiana JSON

**Eksport** (*Ustawienia → Integracja → Eksport JSON*, tylko admin, wpis w audycie):

```json
{ "schema": 1, "source": "fieldcheck", "exportedAt": "ISO",
  "properties": [ { "id", "external_id", "street", "building", "unit", "zip", "city", "lat", "lng", "notes" } ],
  "reps": [ { "id", "name", "email", "active" } ],
  "assignments": [ { "id", "property_id", "rep_id", "due", "status" } ],
  "visits": [ rekord wizyty, ... ] }
```

**Import adresów** (*Nieruchomości → Import*, plik `.json`): tablica obiektów albo `{ "properties": [...] }`.
Pola jak w CSV (`street`/`ulica`, `building`/`nr_budynku`, `unit`/`nr_lokalu`, `zip`/`kod`, `city`/`miasto`,
`notes`/`uwagi`, opcjonalnie `lat`, `lng`) oraz `external_id` — identyfikator rekordu w CRM, zwracany potem
w każdym webhooku, żeby CRM mógł dopasować wizytę do swojego rekordu.
