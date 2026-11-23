# Statusy i automatyczna weryfikacja

Kod: [`assets/js/domain/verify.js`](../assets/js/domain/verify.js) (podgląd w przeglądarce, tryb demo) i `fc_verify` w `supabase/01_schema.sql` (wiążąca ocena na serwerze).

## Statusy przypisania

| Status | Znaczenie | Przejście |
|---|---|---|
| `ASSIGNED` | adres czeka na handlowca | → `IN_PROGRESS` |
| `IN_PROGRESS` | handlowiec rozpoczął wizytę | → `SUBMITTED` |
| `SUBMITTED` | wizyta wysłana, trwa kontrola | → `AUTO_VERIFIED` / `TO_REVIEW` |
| `AUTO_VERIFIED` | wszystkie reguły spełnione | stan końcowy (admin może cofnąć do `TO_REVIEW`) |
| `TO_REVIEW` | co najmniej jedna reguła niespełniona, powody zapisane | → `APPROVED` / `REJECTED` / `ASSIGNED` (ponowna wizyta) |
| `APPROVED` | zatwierdzone ręcznie | stan końcowy |
| `REJECTED` | odrzucone z powodem | stan końcowy; można ponownie przypisać |

## Reguły (progi w *Ustawieniach*)

| Reguła | Warunek zaliczenia | Kod powodu |
|---|---|---|
| OCR budynku | jest odczyt | `r_ocr_building_unreadable` |
| Ulica | zgodność ≥ `streetMin` % (Levenshtein, po normalizacji) | `r_street_mismatch` |
| Numer budynku | dokładnie ten sam token (`20`, `20a`, `20 A`) | `r_building_no_mismatch` |
| Numer lokalu | odczyt i dokładna zgodność | `r_ocr_unit_unreadable`, `r_unit_mismatch` |
| Brak numeru na drzwiach | zawsze do weryfikacji | `r_no_unit_number` |
| GPS | jest pozycja, adres ma współrzędne | `r_no_gps`, `r_no_geocode` |
| Odległość | ≤ `gpsMax` m od adresu | `r_gps_far` |
| Dokładność GPS | ≤ `gpsAcc` m | `r_gps_inaccurate` |
| Odstęp zdjęć | ≤ `gapMax` min | `r_photo_gap` |
| Termin | wysłano przed końcem dnia terminu + `dueTol` h | `r_late` |
| Duplikat | dHash różni się o > `phashMax` bitów od zdjęć z innych wizyt | `r_duplicate` |
| Aparat | wiek pliku ≤ `cameraAge` min (w Androidzie: tylko aparat w aplikacji) | `r_not_camera` |

Brak jakiegokolwiek powodu → `AUTO_VERIFIED`, w przeciwnym razie `TO_REVIEW` z listą powodów.

## Normalizacja tekstu

Małe litery, `ł → l`, usunięcie diakrytyków, znaki niealfanumeryczne → spacja, usunięcie prefiksów
`ul`, `ulica`, `al`, `aleja`, `aleje`, `os`, `osiedle`, `pl`, `plac`. Nazwa ulicy porównywana jest z oknem słów
o podobnej długości, więc „ul. Tadeusza Kościuszki 5” pasuje do „Kościuszki”.

## Testy

`node tests/verify.test.mjs` — test reguł bez przeglądarki (normalizacja, dopasowanie ulicy i numerów, GPS, duplikat, termin).
