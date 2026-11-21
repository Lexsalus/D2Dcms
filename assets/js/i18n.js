// Tłumaczenia PL / EN / UK (ukraiński). Klucze wspólne dla panelu i aplikacji.
// Użycie: t('key', {n: 5}) — {n} w tekście zostanie podmienione.

const LANG_KEY = 'fc.lang';
export const LANGS = [
  { code: 'pl', label: 'PL' },
  { code: 'en', label: 'EN' },
  { code: 'uk', label: 'UA' },
];

const D = {
  pl: {
    app_name: 'FieldCheck',
    tagline: 'Kontrola wizyt w terenie — windykacja terenowa i D2D',
    open_admin: 'Panel administratora',
    open_app: 'Aplikacja handlowca',
    open_admin_desc: 'Import adresów, przypisywanie, weryfikacja wizyt, raporty.',
    open_app_desc: 'Lista adresów, zdjęcia budynku i lokalu, wynik rozmowy.',
    prototype_note: 'Prototyp — dane zapisywane lokalnie w przeglądarce (bez serwera).',
    theme_day: 'Dzień', theme_night: 'Noc',
    version: 'Wersja',

    // logowanie
    login: 'Zaloguj', logout: 'Wyloguj', email: 'E-mail', password: 'Hasło', pin: 'PIN',
    login_admin_title: 'Logowanie administratora',
    login_rep_title: 'Logowanie handlowca',
    choose_rep: 'Handlowiec',
    demo_creds: 'Dane demo: {creds}',
    bad_login: 'Nieprawidłowe dane logowania',
    account_inactive: 'Konto nieaktywne',
    device_bound: 'Konto jest przypisane do innego urządzenia. Poproś administratora o reset.',

    // nawigacja panelu
    nav_dashboard: 'Pulpit', nav_properties: 'Nieruchomości', nav_reps: 'Handlowcy',
    nav_review: 'Do weryfikacji', nav_reports: 'Raporty', nav_settings: 'Ustawienia',

    // statusy
    st_ASSIGNED: 'Przypisany', st_IN_PROGRESS: 'W trakcie', st_SUBMITTED: 'Wysłany',
    st_AUTO_VERIFIED: 'Zweryfikowany auto', st_TO_REVIEW: 'Do weryfikacji',
    st_APPROVED: 'Zatwierdzony ręcznie', st_REJECTED: 'Odrzucony', st_UNASSIGNED: 'Nieprzypisany',

    // wyniki rozmowy
    out_talked: 'Rozmowa odbyta', out_no_answer: 'Nikt nie otworzył',
    out_refused: 'Odmowa rozmowy', out_later: 'Wrócić później',

    // pulpit
    dash_title: 'Pulpit', period: 'Okres', period_week: 'Ten tydzień', period_month: 'Ten miesiąc', period_all: 'Całość',
    all_reps: 'Wszyscy handlowcy',
    kpi_assigned: 'Przypisane adresy', kpi_submitted: 'Wysłane wizyty', kpi_auto: 'Auto-weryfikacja', kpi_review: 'Do weryfikacji',
    kpi_reps: '{n} handlowców', kpi_plan: '{n}% planu', kpi_auto_of: '{a} z {b} wizyt', kpi_waiting: 'czeka na Ciebie',
    plan_by_rep: 'Realizacja planu wg handlowca', status_mix: 'Statusy adresów', recent_visits: 'Ostatnie wizyty',
    visits_map: 'Mapa wizyt', sent: 'wysłano', todo: 'Do zrobienia',
    col_address: 'Adres', col_unit: 'Lokal', col_rep: 'Handlowiec', col_status: 'Status', col_time: 'Godz.',
    col_due: 'Termin', col_city: 'Miasto', col_zip: 'Kod', col_notes: 'Uwagi', col_outcome: 'Wynik',
    no_data: 'Brak danych',

    // nieruchomości
    props_title: 'Nieruchomości — przypisywanie',
    import_file: 'Import z Excela / CSV', add_address: 'Dodaj adres',
    selected_of: 'zaznaczono {a} z {b}',
    assign_to: 'Przypisz do handlowca', split_even: 'Podziel równo', assign_btn: 'Przypisz zaznaczone ({n})',
    due_date: 'Termin wykonania', unassign: 'Cofnij przypisanie',
    filter_all: 'Wszystkie', filter_unassigned: 'Nieprzypisane', filter_assigned: 'Przypisane',
    search: 'Szukaj…',
    geocode_on_import: 'Geokoduj adresy bez współrzędnych (OpenStreetMap, ok. 1 adres/s)',
    import_result: 'Zaimportowano: {a}, pominięto duplikaty: {b}, błędy: {c}',
    import_help: 'Kolumny: ulica, nr_budynku, nr_lokalu, kod, miasto, uwagi (opcjonalnie lat, lng). Pierwszy wiersz to nagłówki.',
    geocoding: 'Geokodowanie {a}/{b}…',
    select_rep_first: 'Wybierz handlowca',
    select_props_first: 'Zaznacz adresy',
    assigned_ok: 'Przypisano {n} adresów',
    street: 'Ulica', building_no: 'Nr budynku', unit_no: 'Nr lokalu', zip: 'Kod pocztowy', city: 'Miasto', notes: 'Uwagi',
    save: 'Zapisz', cancel: 'Anuluj', close: 'Zamknij', delete: 'Usuń',
    duplicate_address: 'Taki adres już istnieje',
    cant_reassign: 'Nie można zmienić przypisania adresu z wysłaną wizytą',

    // weryfikacja
    review_title: 'Do weryfikacji ({n})', review_empty: 'Brak wizyt do weryfikacji 🎉',
    photo_building: 'Zdjęcie 1 — budynek', photo_unit: 'Zdjęcie 2 — mieszkanie', photo_door: 'Zdjęcie 2 — drzwi (brak numeru)',
    ocr: 'OCR', addr_match: 'Zgodność adresu', unit_match: 'Numer lokalu',
    match_ok: 'zgodny', match_bad: 'niezgodny',
    gps_from_addr: 'GPS: {n} m od adresu', photo_gap: 'Odstęp zdjęć: {n} min',
    dup_photo: 'Duplikat zdjęcia', in_app_camera: 'Aparat w aplikacji',
    yes: 'tak', no: 'nie',
    decision: 'Decyzja', visit: 'Wizyta', outcome: 'Wynik', note: 'Notatka',
    reject_reason: 'Powód odrzucenia',
    approve: 'Zatwierdź', reject: 'Odrzuć', revisit: 'Ponowna wizyta',
    download: 'Pobierz', download_logged: 'Pobranie zapisane w dzienniku',
    rr_wrong_address: 'Niezgodny adres', rr_wrong_location: 'Zła lokalizacja', rr_bad_photo: 'Nieczytelne zdjęcie',
    rr_duplicate: 'Duplikat zdjęcia', rr_other: 'Inny',
    decided: 'Decyzja zapisana',
    reasons: 'Powody oznaczenia',

    // powody auto-weryfikacji
    r_ocr_building_unreadable: 'OCR budynku nieczytelny',
    r_street_mismatch: 'Ulica niezgodna ({n}%)',
    r_building_no_mismatch: 'Nr budynku niezgodny',
    r_ocr_unit_unreadable: 'Nr lokalu nieczytelny',
    r_unit_mismatch: 'Nr lokalu niezgodny',
    r_no_unit_number: 'Brak numeru na drzwiach',
    r_no_gps: 'Brak GPS',
    r_gps_far: 'GPS {n} m',
    r_gps_inaccurate: 'Niska dokładność GPS ({n} m)',
    r_no_geocode: 'Adres bez współrzędnych',
    r_photo_gap: 'Odstęp zdjęć {n} min',
    r_late: 'Po terminie',
    r_duplicate: 'Duplikat zdjęcia',
    r_not_camera: 'Zdjęcie nie z aparatu',
    r_missing_photo: 'Brak zdjęcia',

    // handlowcy
    reps_title: 'Handlowcy', add_rep: 'Dodaj handlowca', name: 'Imię i nazwisko', active: 'Aktywny',
    device: 'Urządzenie', device_none: 'brak', reset_device: 'Odepnij urządzenie', remote_logout: 'Wyloguj zdalnie',
    activate: 'Aktywuj', deactivate: 'Dezaktywuj', edit: 'Edytuj', assigned_count: 'Przypisane',

    // raporty
    reports_title: 'Raporty skuteczności', export_csv: 'Eksport CSV',
    rep_plan: 'Realizacja planu', rep_auto: 'Auto-weryfikacja', rep_rejected: 'Odrzucone / podejrzane',
    rep_per_day: 'Wizyty dziennie', rep_time_per: 'Czas na adres', rep_outcomes: 'Wyniki rozmów',
    rep_review_time: 'Czas zatwierdzenia ręcznego', target: 'Cel', min: 'min', h: 'godz.',
    audit_log: 'Dziennik zdarzeń', audit_when: 'Kiedy', audit_who: 'Kto', audit_action: 'Akcja', audit_object: 'Obiekt',
    total: 'Razem',

    // ustawienia
    targets: 'Cele w raportach', s_target_plan: 'Realizacja planu — cel (%)', s_target_auto: 'Auto-weryfikacja — cel (%)', s_target_rejected: 'Odrzucone — maks. (%)', s_target_review: 'Czas decyzji ręcznej — maks. (godz.)',
    settings_title: 'Ustawienia', thresholds: 'Progi automatycznej weryfikacji',
    s_street_min: 'Min. zgodność nazwy ulicy (%)', s_gps_max: 'Maks. odległość GPS od adresu (m)',
    s_gps_acc: 'Maks. dokładność GPS (m)', s_gap_max: 'Maks. odstęp między zdjęciami (min)',
    s_due_tol: 'Tolerancja po terminie (godz.)', s_phash: 'Próg duplikatu zdjęcia (bity różnicy pHash)',
    s_camera_age: 'Maks. wiek pliku zdjęcia (min)', s_retention: 'Retencja zdjęć (dni)',
    demo_section: 'Tryb demo', s_demo_gps: 'Symuluj GPS w pobliżu adresu (do testów przy biurku)',
    reset_demo: 'Przywróć dane demo', reset_confirm: 'Usunąć wszystkie lokalne dane i wczytać dane demo?',
    clear_all: 'Wyczyść wszystko (pusta baza)', clear_confirm: 'Usunąć wszystkie dane?',
    saved: 'Zapisano',
    admin_account: 'Konto administratora',

    // aplikacja
    today_progress: 'Dzisiaj · {a} z {b}', tab_list: 'Lista', tab_profile: 'Profil',
    no_assignments: 'Brak przypisanych adresów',
    navigate: 'Nawiguj', start_visit: 'Rozpocznij wizytę', continue_visit: 'Kontynuuj wizytę',
    step_building: 'Zdjęcie 1 z 2 · Budynek', step_unit: 'Zdjęcie 2 z 2 · Lokal',
    hint_building: 'Ujmij tabliczkę z nazwą ulicy i numerem budynku',
    hint_unit: 'Numer mieszkania lub drzwi z numerem',
    take_photo: 'Zrób zdjęcie', retake: 'Powtórz', next: 'Dalej', back: 'Wstecz',
    no_number: 'Brak numeru? Zrób zdjęcie drzwi',
    recognizing: 'Rozpoznaję tekst…', detected: 'Wykryto: {s}', not_detected: 'Nie rozpoznano tekstu',
    ocr_loading: 'Ładuję moduł OCR (pierwszy raz może potrwać)…',
    summary: 'Podsumowanie wizyty', building_addr: 'Adres budynku', unit_short: 'Nr mieszkania',
    location: 'Lokalizacja', time: 'Godzina', m_from_addr: '{n} m od adresu',
    note_optional: 'Notatka (opcjonalnie)', send_visit: 'Wyślij wizytę',
    choose_outcome: 'Wybierz wynik rozmowy',
    visit_sent: 'Wizyta wysłana', visit_result: 'Wynik kontroli',
    back_to_list: 'Wróć do listy',
    gps_getting: 'Pobieram lokalizację…', gps_denied: 'Brak dostępu do lokalizacji',
    protected_content: 'Ta treść jest chroniona',
    profile: 'Profil', language: 'Język', theme: 'Motyw', device_id: 'ID urządzenia',
    camera_note: 'W prototypie przeglądarkowym zdjęcie może pochodzić z pliku; w aplikacji Android tylko z aparatu.',
    due: 'termin {d}',
    status_after: 'Status: {s}',
  },

  en: {
    app_name: 'FieldCheck',
    tagline: 'Field visit verification — field debt collection and D2D',
    open_admin: 'Admin panel', open_app: 'Field rep app',
    open_admin_desc: 'Import addresses, assign, verify visits, reports.',
    open_app_desc: 'Address list, building and unit photos, visit outcome.',
    prototype_note: 'Prototype — data is stored locally in the browser (no server).',
    theme_day: 'Day', theme_night: 'Night', version: 'Version',

    login: 'Log in', logout: 'Log out', email: 'Email', password: 'Password', pin: 'PIN',
    login_admin_title: 'Administrator login', login_rep_title: 'Field rep login', choose_rep: 'Field rep',
    demo_creds: 'Demo credentials: {creds}', bad_login: 'Invalid login details', account_inactive: 'Account inactive',
    device_bound: 'This account is bound to another device. Ask the administrator to reset it.',

    nav_dashboard: 'Dashboard', nav_properties: 'Properties', nav_reps: 'Field reps',
    nav_review: 'To review', nav_reports: 'Reports', nav_settings: 'Settings',

    st_ASSIGNED: 'Assigned', st_IN_PROGRESS: 'In progress', st_SUBMITTED: 'Submitted',
    st_AUTO_VERIFIED: 'Auto-verified', st_TO_REVIEW: 'To review',
    st_APPROVED: 'Approved manually', st_REJECTED: 'Rejected', st_UNASSIGNED: 'Unassigned',

    out_talked: 'Conversation held', out_no_answer: 'Nobody answered', out_refused: 'Refused to talk', out_later: 'Come back later',

    dash_title: 'Dashboard', period: 'Period', period_week: 'This week', period_month: 'This month', period_all: 'All time',
    all_reps: 'All field reps',
    kpi_assigned: 'Assigned addresses', kpi_submitted: 'Submitted visits', kpi_auto: 'Auto-verification', kpi_review: 'To review',
    kpi_reps: '{n} field reps', kpi_plan: '{n}% of plan', kpi_auto_of: '{a} of {b} visits', kpi_waiting: 'waiting for you',
    plan_by_rep: 'Plan completion by rep', status_mix: 'Address statuses', recent_visits: 'Recent visits',
    visits_map: 'Visits map', sent: 'submitted', todo: 'To do',
    col_address: 'Address', col_unit: 'Unit', col_rep: 'Field rep', col_status: 'Status', col_time: 'Time',
    col_due: 'Due', col_city: 'City', col_zip: 'Postcode', col_notes: 'Notes', col_outcome: 'Outcome',
    no_data: 'No data',

    props_title: 'Properties — assignment', import_file: 'Import from Excel / CSV', add_address: 'Add address',
    selected_of: '{a} of {b} selected', assign_to: 'Assign to field rep', split_even: 'Split evenly',
    assign_btn: 'Assign selected ({n})', due_date: 'Due date', unassign: 'Unassign',
    filter_all: 'All', filter_unassigned: 'Unassigned', filter_assigned: 'Assigned', search: 'Search…',
    geocode_on_import: 'Geocode addresses without coordinates (OpenStreetMap, approx. 1 address/s)',
    import_result: 'Imported: {a}, duplicates skipped: {b}, errors: {c}',
    import_help: 'Columns: street, building_no, unit_no, postcode, city, notes (optionally lat, lng). First row is headers.',
    geocoding: 'Geocoding {a}/{b}…', select_rep_first: 'Choose a field rep', select_props_first: 'Select addresses',
    assigned_ok: 'Assigned {n} addresses',
    street: 'Street', building_no: 'Building no.', unit_no: 'Unit no.', zip: 'Postcode', city: 'City', notes: 'Notes',
    save: 'Save', cancel: 'Cancel', close: 'Close', delete: 'Delete',
    duplicate_address: 'This address already exists',
    cant_reassign: 'Cannot reassign an address with a submitted visit',

    review_title: 'To review ({n})', review_empty: 'Nothing to review 🎉',
    photo_building: 'Photo 1 — building', photo_unit: 'Photo 2 — unit', photo_door: 'Photo 2 — door (no number)',
    ocr: 'OCR', addr_match: 'Address match', unit_match: 'Unit number', match_ok: 'match', match_bad: 'mismatch',
    gps_from_addr: 'GPS: {n} m from address', photo_gap: 'Photo gap: {n} min',
    dup_photo: 'Duplicate photo', in_app_camera: 'In-app camera', yes: 'yes', no: 'no',
    decision: 'Decision', visit: 'Visit', outcome: 'Outcome', note: 'Note', reject_reason: 'Rejection reason',
    approve: 'Approve', reject: 'Reject', revisit: 'Revisit',
    download: 'Download', download_logged: 'Download recorded in the audit log',
    rr_wrong_address: 'Wrong address', rr_wrong_location: 'Wrong location', rr_bad_photo: 'Unreadable photo',
    rr_duplicate: 'Duplicate photo', rr_other: 'Other',
    decided: 'Decision saved', reasons: 'Flag reasons',

    r_ocr_building_unreadable: 'Building OCR unreadable', r_street_mismatch: 'Street mismatch ({n}%)',
    r_building_no_mismatch: 'Building no. mismatch', r_ocr_unit_unreadable: 'Unit no. unreadable',
    r_unit_mismatch: 'Unit no. mismatch', r_no_unit_number: 'No number on the door', r_no_gps: 'No GPS',
    r_gps_far: 'GPS {n} m', r_gps_inaccurate: 'Low GPS accuracy ({n} m)', r_no_geocode: 'Address has no coordinates',
    r_photo_gap: 'Photo gap {n} min', r_late: 'Past due date', r_duplicate: 'Duplicate photo',
    r_not_camera: 'Photo not from camera', r_missing_photo: 'Missing photo',

    reps_title: 'Field reps', add_rep: 'Add field rep', name: 'Full name', active: 'Active',
    device: 'Device', device_none: 'none', reset_device: 'Unbind device', remote_logout: 'Remote logout',
    activate: 'Activate', deactivate: 'Deactivate', edit: 'Edit', assigned_count: 'Assigned',

    reports_title: 'Performance reports', export_csv: 'Export CSV',
    rep_plan: 'Plan completion', rep_auto: 'Auto-verification', rep_rejected: 'Rejected / suspicious',
    rep_per_day: 'Visits per day', rep_time_per: 'Time per address', rep_outcomes: 'Visit outcomes',
    rep_review_time: 'Manual review time', target: 'Target', min: 'min', h: 'h',
    audit_log: 'Audit log', audit_when: 'When', audit_who: 'Who', audit_action: 'Action', audit_object: 'Object',
    total: 'Total',

    targets: 'Report targets', s_target_plan: 'Plan completion — target (%)', s_target_auto: 'Auto-verification — target (%)', s_target_rejected: 'Rejected — max. (%)', s_target_review: 'Manual review time — max. (h)',
    settings_title: 'Settings', thresholds: 'Auto-verification thresholds',
    s_street_min: 'Min. street name match (%)', s_gps_max: 'Max. GPS distance from address (m)',
    s_gps_acc: 'Max. GPS accuracy (m)', s_gap_max: 'Max. gap between photos (min)',
    s_due_tol: 'Tolerance after due date (h)', s_phash: 'Duplicate photo threshold (pHash bit difference)',
    s_camera_age: 'Max. photo file age (min)', s_retention: 'Photo retention (days)',
    demo_section: 'Demo mode', s_demo_gps: 'Simulate GPS near the address (for desk testing)',
    reset_demo: 'Restore demo data', reset_confirm: 'Delete all local data and load demo data?',
    clear_all: 'Clear everything (empty database)', clear_confirm: 'Delete all data?',
    saved: 'Saved', admin_account: 'Administrator account',

    today_progress: 'Today · {a} of {b}', tab_list: 'List', tab_profile: 'Profile',
    no_assignments: 'No assigned addresses',
    navigate: 'Navigate', start_visit: 'Start visit', continue_visit: 'Continue visit',
    step_building: 'Photo 1 of 2 · Building', step_unit: 'Photo 2 of 2 · Unit',
    hint_building: 'Frame the sign with the street name and building number',
    hint_unit: 'Flat number or door with the number',
    take_photo: 'Take photo', retake: 'Retake', next: 'Next', back: 'Back',
    no_number: 'No number? Photograph the door',
    recognizing: 'Recognising text…', detected: 'Detected: {s}', not_detected: 'No text recognised',
    ocr_loading: 'Loading OCR module (first time may take a while)…',
    summary: 'Visit summary', building_addr: 'Building address', unit_short: 'Flat no.',
    location: 'Location', time: 'Time', m_from_addr: '{n} m from address',
    note_optional: 'Note (optional)', send_visit: 'Submit visit', choose_outcome: 'Choose the visit outcome',
    visit_sent: 'Visit submitted', visit_result: 'Check result', back_to_list: 'Back to list',
    gps_getting: 'Getting location…', gps_denied: 'No location access',
    protected_content: 'This content is protected',
    profile: 'Profile', language: 'Language', theme: 'Theme', device_id: 'Device ID',
    camera_note: 'In the browser prototype a photo may come from a file; in the Android app only from the camera.',
    due: 'due {d}', status_after: 'Status: {s}',
  },

  uk: {
    app_name: 'FieldCheck',
    tagline: 'Контроль виїзних візитів — польове стягнення боргів і D2D',
    open_admin: 'Панель адміністратора', open_app: 'Застосунок представника',
    open_admin_desc: 'Імпорт адрес, призначення, перевірка візитів, звіти.',
    open_app_desc: 'Список адрес, фото будинку та квартири, результат розмови.',
    prototype_note: 'Прототип — дані зберігаються локально в браузері (без сервера).',
    theme_day: 'День', theme_night: 'Ніч', version: 'Версія',

    login: 'Увійти', logout: 'Вийти', email: 'Ел. пошта', password: 'Пароль', pin: 'PIN',
    login_admin_title: 'Вхід адміністратора', login_rep_title: 'Вхід представника', choose_rep: 'Представник',
    demo_creds: 'Демо-дані: {creds}', bad_login: 'Невірні дані для входу', account_inactive: 'Обліковий запис неактивний',
    device_bound: 'Обліковий запис прив’язаний до іншого пристрою. Попросіть адміністратора скинути прив’язку.',

    nav_dashboard: 'Огляд', nav_properties: 'Нерухомість', nav_reps: 'Представники',
    nav_review: 'На перевірку', nav_reports: 'Звіти', nav_settings: 'Налаштування',

    st_ASSIGNED: 'Призначено', st_IN_PROGRESS: 'Виконується', st_SUBMITTED: 'Надіслано',
    st_AUTO_VERIFIED: 'Перевірено авто', st_TO_REVIEW: 'На перевірку',
    st_APPROVED: 'Підтверджено вручну', st_REJECTED: 'Відхилено', st_UNASSIGNED: 'Не призначено',

    out_talked: 'Розмова відбулася', out_no_answer: 'Ніхто не відчинив', out_refused: 'Відмова від розмови', out_later: 'Повернутися пізніше',

    dash_title: 'Огляд', period: 'Період', period_week: 'Цей тиждень', period_month: 'Цей місяць', period_all: 'Увесь час',
    all_reps: 'Усі представники',
    kpi_assigned: 'Призначені адреси', kpi_submitted: 'Надіслані візити', kpi_auto: 'Автоперевірка', kpi_review: 'На перевірку',
    kpi_reps: '{n} представників', kpi_plan: '{n}% плану', kpi_auto_of: '{a} з {b} візитів', kpi_waiting: 'чекає на вас',
    plan_by_rep: 'Виконання плану за представником', status_mix: 'Статуси адрес', recent_visits: 'Останні візити',
    visits_map: 'Карта візитів', sent: 'надіслано', todo: 'До виконання',
    col_address: 'Адреса', col_unit: 'Квартира', col_rep: 'Представник', col_status: 'Статус', col_time: 'Час',
    col_due: 'Термін', col_city: 'Місто', col_zip: 'Індекс', col_notes: 'Примітки', col_outcome: 'Результат',
    no_data: 'Немає даних',

    props_title: 'Нерухомість — призначення', import_file: 'Імпорт з Excel / CSV', add_address: 'Додати адресу',
    selected_of: 'вибрано {a} з {b}', assign_to: 'Призначити представнику', split_even: 'Розділити порівну',
    assign_btn: 'Призначити вибрані ({n})', due_date: 'Термін виконання', unassign: 'Скасувати призначення',
    filter_all: 'Усі', filter_unassigned: 'Не призначені', filter_assigned: 'Призначені', search: 'Пошук…',
    geocode_on_import: 'Геокодувати адреси без координат (OpenStreetMap, ~1 адреса/с)',
    import_result: 'Імпортовано: {a}, пропущено дублікатів: {b}, помилок: {c}',
    import_help: 'Стовпці: вулиця, номер будинку, номер квартири, індекс, місто, примітки (необов’язково lat, lng). Перший рядок — заголовки.',
    geocoding: 'Геокодування {a}/{b}…', select_rep_first: 'Виберіть представника', select_props_first: 'Виберіть адреси',
    assigned_ok: 'Призначено {n} адрес',
    street: 'Вулиця', building_no: '№ будинку', unit_no: '№ квартири', zip: 'Індекс', city: 'Місто', notes: 'Примітки',
    save: 'Зберегти', cancel: 'Скасувати', close: 'Закрити', delete: 'Видалити',
    duplicate_address: 'Така адреса вже існує',
    cant_reassign: 'Не можна змінити призначення адреси з надісланим візитом',

    review_title: 'На перевірку ({n})', review_empty: 'Немає візитів на перевірку 🎉',
    photo_building: 'Фото 1 — будинок', photo_unit: 'Фото 2 — квартира', photo_door: 'Фото 2 — двері (без номера)',
    ocr: 'OCR', addr_match: 'Збіг адреси', unit_match: 'Номер квартири', match_ok: 'збігається', match_bad: 'не збігається',
    gps_from_addr: 'GPS: {n} м від адреси', photo_gap: 'Інтервал між фото: {n} хв',
    dup_photo: 'Дублікат фото', in_app_camera: 'Камера в застосунку', yes: 'так', no: 'ні',
    decision: 'Рішення', visit: 'Візит', outcome: 'Результат', note: 'Примітка', reject_reason: 'Причина відхилення',
    approve: 'Підтвердити', reject: 'Відхилити', revisit: 'Повторний візит',
    download: 'Завантажити', download_logged: 'Завантаження записано в журнал',
    rr_wrong_address: 'Невідповідна адреса', rr_wrong_location: 'Неправильне місце', rr_bad_photo: 'Нечитабельне фото',
    rr_duplicate: 'Дублікат фото', rr_other: 'Інше',
    decided: 'Рішення збережено', reasons: 'Причини позначки',

    r_ocr_building_unreadable: 'OCR будинку нечитабельний', r_street_mismatch: 'Вулиця не збігається ({n}%)',
    r_building_no_mismatch: '№ будинку не збігається', r_ocr_unit_unreadable: '№ квартири нечитабельний',
    r_unit_mismatch: '№ квартири не збігається', r_no_unit_number: 'Немає номера на дверях', r_no_gps: 'Немає GPS',
    r_gps_far: 'GPS {n} м', r_gps_inaccurate: 'Низька точність GPS ({n} м)', r_no_geocode: 'Адреса без координат',
    r_photo_gap: 'Інтервал між фото {n} хв', r_late: 'Після терміну', r_duplicate: 'Дублікат фото',
    r_not_camera: 'Фото не з камери', r_missing_photo: 'Немає фото',

    reps_title: 'Представники', add_rep: 'Додати представника', name: 'Ім’я та прізвище', active: 'Активний',
    device: 'Пристрій', device_none: 'немає', reset_device: 'Відв’язати пристрій', remote_logout: 'Вийти віддалено',
    activate: 'Активувати', deactivate: 'Деактивувати', edit: 'Редагувати', assigned_count: 'Призначено',

    reports_title: 'Звіти ефективності', export_csv: 'Експорт CSV',
    rep_plan: 'Виконання плану', rep_auto: 'Автоперевірка', rep_rejected: 'Відхилені / підозрілі',
    rep_per_day: 'Візитів на день', rep_time_per: 'Час на адресу', rep_outcomes: 'Результати розмов',
    rep_review_time: 'Час ручної перевірки', target: 'Ціль', min: 'хв', h: 'год',
    audit_log: 'Журнал подій', audit_when: 'Коли', audit_who: 'Хто', audit_action: 'Дія', audit_object: 'Об’єкт',
    total: 'Разом',

    targets: 'Цілі у звітах', s_target_plan: 'Виконання плану — ціль (%)', s_target_auto: 'Автоперевірка — ціль (%)', s_target_rejected: 'Відхилені — макс. (%)', s_target_review: 'Час ручного рішення — макс. (год)',
    settings_title: 'Налаштування', thresholds: 'Пороги автоматичної перевірки',
    s_street_min: 'Мін. збіг назви вулиці (%)', s_gps_max: 'Макс. відстань GPS від адреси (м)',
    s_gps_acc: 'Макс. точність GPS (м)', s_gap_max: 'Макс. інтервал між фото (хв)',
    s_due_tol: 'Допуск після терміну (год)', s_phash: 'Поріг дубліката фото (різниця бітів pHash)',
    s_camera_age: 'Макс. вік файлу фото (хв)', s_retention: 'Зберігання фото (днів)',
    demo_section: 'Демо-режим', s_demo_gps: 'Імітувати GPS поруч з адресою (для тестів за столом)',
    reset_demo: 'Відновити демо-дані', reset_confirm: 'Видалити всі локальні дані та завантажити демо-дані?',
    clear_all: 'Очистити все (порожня база)', clear_confirm: 'Видалити всі дані?',
    saved: 'Збережено', admin_account: 'Обліковий запис адміністратора',

    today_progress: 'Сьогодні · {a} з {b}', tab_list: 'Список', tab_profile: 'Профіль',
    no_assignments: 'Немає призначених адрес',
    navigate: 'Навігація', start_visit: 'Почати візит', continue_visit: 'Продовжити візит',
    step_building: 'Фото 1 з 2 · Будинок', step_unit: 'Фото 2 з 2 · Квартира',
    hint_building: 'Захопіть табличку з назвою вулиці та номером будинку',
    hint_unit: 'Номер квартири або двері з номером',
    take_photo: 'Зробити фото', retake: 'Повторити', next: 'Далі', back: 'Назад',
    no_number: 'Немає номера? Сфотографуйте двері',
    recognizing: 'Розпізнаю текст…', detected: 'Виявлено: {s}', not_detected: 'Текст не розпізнано',
    ocr_loading: 'Завантажую модуль OCR (перший раз може тривати довше)…',
    summary: 'Підсумок візиту', building_addr: 'Адреса будинку', unit_short: '№ квартири',
    location: 'Місцезнаходження', time: 'Час', m_from_addr: '{n} м від адреси',
    note_optional: 'Примітка (необов’язково)', send_visit: 'Надіслати візит', choose_outcome: 'Виберіть результат розмови',
    visit_sent: 'Візит надіслано', visit_result: 'Результат перевірки', back_to_list: 'Повернутися до списку',
    gps_getting: 'Отримую місцезнаходження…', gps_denied: 'Немає доступу до місцезнаходження',
    protected_content: 'Цей вміст захищено',
    profile: 'Профіль', language: 'Мова', theme: 'Тема', device_id: 'ID пристрою',
    camera_note: 'У браузерному прототипі фото може бути з файлу; у застосунку Android — лише з камери.',
    due: 'термін {d}', status_after: 'Статус: {s}',
  },
};

export function extend(lang, obj) { Object.assign(D[lang], obj); }

let current = localStorage.getItem(LANG_KEY) || (navigator.language || 'pl').slice(0, 2);
if (!D[current]) current = 'pl';
const listeners = new Set();

export function getLang() { return current; }
export function setLang(code) {
  if (!D[code]) return;
  current = code;
  localStorage.setItem(LANG_KEY, code);
  document.documentElement.lang = code;
  applyDom();
  listeners.forEach(fn => fn(code));
}
export function onLangChange(fn) { listeners.add(fn); }

export function t(key, vars) {
  let s = D[current][key] ?? D.pl[key] ?? key;
  if (vars) for (const k in vars) s = s.replaceAll('{' + k + '}', vars[k]);
  return s;
}

// Elementy z data-i18n="klucz" (tekst) i data-i18n-ph="klucz" (placeholder)
export function applyDom(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  root.querySelectorAll('[data-i18n-tip]').forEach(el => { el.dataset.tip = t(el.dataset.i18nTip); });
}

export function locale() { return { pl: 'pl-PL', en: 'en-GB', uk: 'uk-UA' }[current]; }
export function fmtDate(ts) { return ts ? new Date(ts).toLocaleDateString(locale()) : '—'; }
export function fmtTime(ts) { return ts ? new Date(ts).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) : '—'; }
export function fmtDateTime(ts) { return ts ? new Date(ts).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' }) : '—'; }

document.documentElement.lang = current;
