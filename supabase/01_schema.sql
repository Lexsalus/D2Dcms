-- FieldCheck · 01_schema.sql — tabele, zasady dostępu (RLS), weryfikacja wizyty po stronie serwera, magazyn zdjęć.
-- Uruchom po 00_reset.sql w Supabase → SQL Editor. Skrypt można uruchamiać ponownie (idempotentny tam, gdzie się da).

create extension if not exists unaccent with schema extensions;
create extension if not exists fuzzystrmatch with schema extensions;

-- ============================================================ TABELE

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  role text not null default 'rep' check (role in ('admin', 'manager', 'rep')),
  name text not null default '',
  email text,
  active boolean not null default false,          -- nowe konto czeka na aktywację przez admina
  device_id text,                                 -- powiązanie handlowca z jednym telefonem
  session_version int not null default 0,         -- zwiększenie = zdalne wylogowanie
  team uuid[] not null default '{}',              -- manager: id handlowców w zespole
  notif_seen timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  external_id text,                               -- identyfikator rekordu w CRM
  street text not null, building text not null, unit text, zip text, city text not null,
  lat double precision, lng double precision, notes text,
  created_by uuid references public.profiles, created_at timestamptz not null default now()
);
create unique index if not exists properties_unique_addr
  on public.properties (lower(street), lower(building), coalesce(lower(unit), ''), lower(city));

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null unique references public.properties on delete cascade,
  user_id uuid not null references public.profiles,
  due date,
  status text not null default 'ASSIGNED' check (status in ('ASSIGNED','IN_PROGRESS','SUBMITTED','AUTO_VERIFIED','TO_REVIEW','APPROVED','REJECTED')),
  assigned_by uuid references public.profiles,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists assignments_user on public.assignments (user_id);

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments on delete cascade,
  property_id uuid not null references public.properties on delete cascade,
  user_id uuid not null references public.profiles default auth.uid(),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,                       -- znacznik czasu nadaje serwer
  gps_lat double precision, gps_lng double precision, gps_accuracy double precision,
  outcome text check (outcome in ('talked','no_answer','refused','later')),
  note varchar(300),
  status text not null default 'IN_PROGRESS' check (status in ('IN_PROGRESS','SUBMITTED','AUTO_VERIFIED','TO_REVIEW','APPROVED','REJECTED')),
  reasons jsonb not null default '[]', details jsonb not null default '{}',
  bio jsonb, signature jsonb,
  decision text check (decision in ('approve','reject','revisit')), decision_reason text,
  decided_by uuid references public.profiles, decided_at timestamptz
);
create index if not exists visits_assignment on public.visits (assignment_id);
create index if not exists visits_user on public.visits (user_id, submitted_at);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits on delete cascade,
  type text not null check (type in ('building','unit','door')),
  storage_key text,                               -- ścieżka w buckecie „photos”: {rep_id}/{visit_id}/{type}.jpg
  ocr_text text, ocr_conf int, phash text,
  file_age_ms bigint not null default 0,
  taken_at timestamptz not null default now(),    -- czas serwera w chwili zapisu
  purged boolean not null default false
);

create table if not exists public.audit_log (
  id bigserial primary key,
  user_id uuid references public.profiles on delete set null,
  action text not null, object text, ip text,
  ts timestamptz not null default now()
);
create index if not exists audit_ts on public.audit_log (ts desc);

create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'
);
insert into public.settings (id, data) values (1, '{}') on conflict do nothing;

create table if not exists public.bio_profiles (
  user_id uuid primary key references public.profiles on delete cascade,
  pin jsonb not null default '[]', sig jsonb not null default '[]', touch jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

create table if not exists public.webhook_log (
  id bigserial primary key, ts timestamptz not null default now(),
  event text, status text, code int, ms int
);

-- ============================================================ FUNKCJE POMOCNICZE (uprawnienia)

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and active
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(my_role() = 'admin', false)
$$;

-- czy zalogowany użytkownik widzi dane handlowca rep: admin — wszystkich, manager — zespół, handlowiec — siebie
create or replace function public.in_scope(rep uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case my_role()
    when 'admin' then true
    when 'manager' then rep = any (select unnest(team) from profiles where id = auth.uid())
    when 'rep' then rep = auth.uid()
    else false end
$$;

create or replace function public.setting_num(key text, def numeric) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((data ->> key)::numeric, def) from settings where id = 1
$$;

-- wpis w dzienniku z adresem IP z nagłówków żądania
create or replace function public.fc_audit(p_action text, p_object text) returns void
language plpgsql security definer set search_path = public as $$
declare hdr json := nullif(current_setting('request.headers', true), '')::json;
begin
  insert into audit_log (user_id, action, object, ip)
  values (auth.uid(), p_action, p_object, split_part(coalesce(hdr ->> 'x-forwarded-for', hdr ->> 'x-real-ip', ''), ',', 1));
end $$;

-- nowe konto w Authentication → profil (rola rep, nieaktywny do zatwierdzenia przez admina)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, name) values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ============================================================ WERYFIKACJA WIZYTY (te same reguły co assets/js/verify.js)

create or replace function public.fc_norm(t text) returns text
language sql immutable set search_path = public, extensions as $$
  select array_to_string(array(
    select w from unnest(string_to_array(trim(regexp_replace(lower(extensions.unaccent(replace(replace(coalesce(t, ''), 'ł', 'l'), 'Ł', 'L'))), '[^a-z0-9]+', ' ', 'g')), ' ')) w
    where w <> '' and w not in ('ulica','ul','aleja','aleje','al','osiedle','os','plac','pl')
  ), ' ')
$$;

create or replace function public.fc_street_score(ocr text, street text) returns int
language plpgsql immutable set search_path = public, extensions as $$
declare
  target text := fc_norm(street);
  words text[] := string_to_array(fc_norm(ocr), ' ');
  k int := greatest(1, coalesce(array_length(string_to_array(target, ' '), 1), 1));
  best int := 0; cand text; l int; i int; mx int;
begin
  if words is null or target = '' then return 0; end if;
  for i in 1 .. coalesce(array_length(words, 1), 0) loop
    for l in greatest(1, k - 1) .. k + 1 loop
      if i + l - 1 <= array_length(words, 1) then
        cand := array_to_string(words[i : i + l - 1], ' ');
        mx := greatest(length(cand), length(target));
        best := greatest(best, round(100 * (1 - extensions.levenshtein(left(cand, 255), left(target, 255))::numeric / mx))::int);
      end if;
    end loop;
  end loop;
  return best;
end $$;

create or replace function public.fc_has_number(ocr text, num text) returns boolean
language plpgsql immutable set search_path = public as $$
declare n text := replace(fc_norm(num), ' ', ''); t text[] := string_to_array(fc_norm(ocr), ' '); i int;
begin
  if n = '' or t is null then return false; end if;
  for i in 1 .. coalesce(array_length(t, 1), 0) loop
    if t[i] = n or t[i] || coalesce(t[i + 1], '') = n then return true; end if;
  end loop;
  return false;
end $$;

create or replace function public.fc_distance(lat1 float8, lng1 float8, lat2 float8, lng2 float8) returns int
language sql immutable as $$
  select round(2 * 6371000 * asin(sqrt(power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2))))::int
$$;

create or replace function public.fc_hamming(a text, b text) returns int
language sql immutable as $$
  select case when a ~ '^[0-9a-f]{16}$' and b ~ '^[0-9a-f]{16}$'
    then bit_count(('x' || a)::bit(64) # ('x' || b)::bit(64))::int else 64 end
$$;

-- Ocena wizyty → status + powody (wiążąca, po stronie serwera)
create or replace function public.fc_verify(v_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v visits; p properties; a assignments;
  pb photos; pu photos;
  reasons jsonb := '[]'; det jsonb := '{}';
  s_street int; d int; gap int; dup boolean; cam boolean; bad_cam boolean;
begin
  select * into v from visits where id = v_id;
  select * into p from properties where id = v.property_id;
  select * into a from assignments where id = v.assignment_id;
  select * into pb from photos where visit_id = v_id and type = 'building' order by taken_at desc limit 1;
  select * into pu from photos where visit_id = v_id and type in ('unit', 'door') order by taken_at desc limit 1;

  -- zdjęcie 1: ulica (Levenshtein) + numer budynku
  if pb.id is null then reasons := reasons || '[{"code":"r_missing_photo"}]';
  elsif fc_norm(pb.ocr_text) = '' then reasons := reasons || '[{"code":"r_ocr_building_unreadable"}]';
  else
    s_street := fc_street_score(pb.ocr_text, p.street);
    det := det || jsonb_build_object('streetScore', s_street, 'buildingOk', fc_has_number(pb.ocr_text, p.building));
    if s_street < setting_num('streetMin', 90) then reasons := reasons || jsonb_build_array(jsonb_build_object('code', 'r_street_mismatch', 'n', s_street)); end if;
    if not fc_has_number(pb.ocr_text, p.building) then reasons := reasons || '[{"code":"r_building_no_mismatch"}]'; end if;
  end if;

  -- zdjęcie 2: numer lokalu
  if coalesce(p.unit, '') <> '' then
    if pu.id is null then reasons := reasons || '[{"code":"r_missing_photo"}]';
    elsif pu.type = 'door' then reasons := reasons || '[{"code":"r_no_unit_number"}]';
    elsif fc_norm(pu.ocr_text) = '' then reasons := reasons || '[{"code":"r_ocr_unit_unreadable"}]';
    else
      det := det || jsonb_build_object('unitOk', fc_has_number(pu.ocr_text, p.unit));
      if not fc_has_number(pu.ocr_text, p.unit) then reasons := reasons || '[{"code":"r_unit_mismatch"}]'; end if;
    end if;
  end if;

  -- GPS
  if v.gps_lat is null then reasons := reasons || '[{"code":"r_no_gps"}]';
  elsif p.lat is null then reasons := reasons || '[{"code":"r_no_geocode"}]';
  else
    d := fc_distance(v.gps_lat, v.gps_lng, p.lat, p.lng);
    det := det || jsonb_build_object('distance', d, 'accuracy', round(coalesce(v.gps_accuracy, 0)));
    if coalesce(v.gps_accuracy, 0) > setting_num('gpsAcc', 50) then reasons := reasons || jsonb_build_array(jsonb_build_object('code', 'r_gps_inaccurate', 'n', round(v.gps_accuracy))); end if;
    if d > setting_num('gpsMax', 100) then reasons := reasons || jsonb_build_array(jsonb_build_object('code', 'r_gps_far', 'n', d)); end if;
  end if;

  -- czas: odstęp zdjęć, termin (koniec dnia w Polsce + tolerancja)
  if pb.id is not null and pu.id is not null then
    gap := round(abs(extract(epoch from pu.taken_at - pb.taken_at)) / 60);
    det := det || jsonb_build_object('gapMin', gap);
    if gap > setting_num('gapMax', 30) then reasons := reasons || jsonb_build_array(jsonb_build_object('code', 'r_photo_gap', 'n', gap)); end if;
  end if;
  if a.due is not null and coalesce(v.submitted_at, now()) >
     ((a.due::timestamp + interval '23:59:59') at time zone 'Europe/Warsaw') + make_interval(hours => setting_num('dueTol', 24)::int) then
    reasons := reasons || '[{"code":"r_late"}]'; det := det || '{"late":true}';
  end if;

  -- duplikat (hash percepcyjny) i zdjęcie z aparatu
  select exists (
    select 1 from photos mine join photos other on other.visit_id <> mine.visit_id and other.phash is not null
    where mine.visit_id = v_id and mine.phash is not null and fc_hamming(mine.phash, other.phash) <= setting_num('phashMax', 6)
  ) into dup;
  det := det || jsonb_build_object('duplicate', dup);
  if dup then reasons := reasons || '[{"code":"r_duplicate"}]'; end if;
  select exists (select 1 from photos where visit_id = v_id and file_age_ms > setting_num('cameraAge', 5) * 60000) into bad_cam;
  det := det || jsonb_build_object('cameraOk', not bad_cam);
  if bad_cam then reasons := reasons || '[{"code":"r_not_camera"}]'; end if;

  return jsonb_build_object('status', case when jsonb_array_length(reasons) = 0 then 'AUTO_VERIFIED' else 'TO_REVIEW' end,
                            'reasons', reasons, 'details', det);
end $$;

-- ============================================================ OPERACJE (RPC) — jedyna droga zmiany statusów

-- Handlowiec: rozpoczęcie wizyty (albo kontynuacja otwartej)
create or replace function public.start_visit(p_assignment uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare a assignments; vid uuid;
begin
  select * into a from assignments where id = p_assignment;
  if a.id is null or a.user_id <> auth.uid() or my_role() <> 'rep' then raise exception 'forbidden'; end if;
  if a.status not in ('ASSIGNED', 'IN_PROGRESS') then raise exception 'not_open'; end if;
  select id into vid from visits where assignment_id = a.id and submitted_at is null order by started_at desc limit 1;
  if vid is null then
    insert into visits (assignment_id, property_id, user_id) values (a.id, a.property_id, auth.uid()) returning id into vid;
    update assignments set status = 'IN_PROGRESS', updated_at = now() where id = a.id;
    perform fc_audit('visit_start', a.property_id::text);
  end if;
  return vid;
end $$;

-- Handlowiec: wysłanie wizyty → serwer nadaje czas i ocenia; flagi biometrii (z telefonu) mogą tylko dodać powody
create or replace function public.submit_visit(p_visit uuid, p_outcome text, p_note text, p_bio jsonb default null, p_signature jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v visits; res jsonb; flags jsonb := '[]';
begin
  select * into v from visits where id = p_visit;
  if v.id is null or v.user_id <> auth.uid() or v.submitted_at is not null then raise exception 'forbidden'; end if;
  update visits set outcome = p_outcome, note = left(p_note, 300), submitted_at = now(), bio = p_bio, signature = p_signature, status = 'SUBMITTED' where id = p_visit;
  res := fc_verify(p_visit);
  if p_bio is not null and coalesce((select (data ->> 'bioToReview')::boolean from settings where id = 1), true) then
    select coalesce(jsonb_agg(jsonb_build_object('code', 'r_bio_' || k, 'n', p_bio -> k -> 'score', 'bio', true)), '[]') into flags
    from jsonb_object_keys(p_bio) k where (p_bio -> k ->> 'flag')::boolean;
  end if;
  if jsonb_array_length(flags) > 0 then res := jsonb_set(jsonb_set(res, '{reasons}', (res -> 'reasons') || flags), '{status}', '"TO_REVIEW"'); end if;
  update visits set status = res ->> 'status', reasons = res -> 'reasons', details = res -> 'details' where id = p_visit;
  update assignments set status = res ->> 'status', updated_at = now() where id = v.assignment_id;
  perform fc_audit('visit_submit', p_visit::text || ' → ' || (res ->> 'status'));
  return res;
end $$;

-- Admin / manager (w zakresie zespołu): decyzja w kolejce weryfikacji
create or replace function public.decide_visit(p_visit uuid, p_decision text, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v visits;
begin
  select * into v from visits where id = p_visit;
  if v.id is null or my_role() not in ('admin', 'manager') or not in_scope(v.user_id) then raise exception 'forbidden'; end if;
  if p_decision = 'reject' and coalesce(p_reason, '') = '' then raise exception 'reason_required'; end if;
  if p_decision = 'reopen' then
    update visits set status = 'TO_REVIEW', decision = null, decided_by = auth.uid(), decided_at = now() where id = p_visit;
    update assignments set status = 'TO_REVIEW', updated_at = now() where id = v.assignment_id;
  else
    update visits set decision = p_decision, decision_reason = p_reason, decided_by = auth.uid(), decided_at = now(),
      status = case p_decision when 'approve' then 'APPROVED' else 'REJECTED' end where id = p_visit;
    update assignments set updated_at = now(), status = case p_decision when 'approve' then 'APPROVED' when 'reject' then 'REJECTED' else 'ASSIGNED' end
      where id = v.assignment_id;
  end if;
  perform fc_audit('decision_' || p_decision, p_visit::text || coalesce(' — ' || p_reason, ''));
end $$;

-- Każdy zalogowany: zapis zdarzenia (np. próba zrzutu ekranu, eksport, pobranie zdjęcia)
create or replace function public.log_event(p_action text, p_object text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  perform fc_audit(left(p_action, 60), left(p_object, 300));
end $$;

-- ============================================================ RLS

alter table public.profiles enable row level security;
alter table public.properties enable row level security;
alter table public.assignments enable row level security;
alter table public.visits enable row level security;
alter table public.photos enable row level security;
alter table public.audit_log enable row level security;
alter table public.settings enable row level security;
alter table public.bio_profiles enable row level security;
alter table public.webhook_log enable row level security;

-- profiles: każdy widzi siebie; admin wszystkich; manager swój zespół. Zmienia tylko admin.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (id = auth.uid() or is_admin() or in_scope(id));
drop policy if exists profiles_admin on public.profiles;
create policy profiles_admin on public.profiles for update using (is_admin()) with check (is_admin());

-- properties: admin — wszystko; pozostali — adresy z przypisań w swoim zakresie
drop policy if exists properties_select on public.properties;
create policy properties_select on public.properties for select
  using (is_admin() or exists (select 1 from assignments a where a.property_id = properties.id and in_scope(a.user_id)));
drop policy if exists properties_admin on public.properties;
create policy properties_admin on public.properties for all using (is_admin()) with check (is_admin());

-- assignments: odczyt w zakresie; zmiany tylko admin (statusy zmieniają funkcje RPC)
drop policy if exists assignments_select on public.assignments;
create policy assignments_select on public.assignments for select using (in_scope(user_id));
drop policy if exists assignments_admin on public.assignments;
create policy assignments_admin on public.assignments for all using (is_admin()) with check (is_admin());

-- visits: odczyt w zakresie; handlowiec uzupełnia GPS tylko w otwartej wizycie (kolumny ograniczone niżej)
drop policy if exists visits_select on public.visits;
create policy visits_select on public.visits for select using (in_scope(user_id));
drop policy if exists visits_rep_update on public.visits;
create policy visits_rep_update on public.visits for update
  using (user_id = auth.uid() and submitted_at is null) with check (user_id = auth.uid() and submitted_at is null);

-- photos: odczyt w zakresie (handlowiec — tylko przed wysłaniem); dodaje handlowiec do własnej otwartej wizyty
drop policy if exists photos_select on public.photos;
create policy photos_select on public.photos for select using (exists (
  select 1 from visits v where v.id = photos.visit_id and in_scope(v.user_id) and (my_role() <> 'rep' or v.submitted_at is null)));
drop policy if exists photos_insert on public.photos;
create policy photos_insert on public.photos for insert with check (exists (
  select 1 from visits v where v.id = photos.visit_id and v.user_id = auth.uid() and v.submitted_at is null));
drop policy if exists photos_admin on public.photos;
create policy photos_admin on public.photos for update using (is_admin()) with check (is_admin());

-- audit_log: admin — wszystko; manager — zdarzenia zespołu i własne. Zapis tylko przez fc_audit/log_event.
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select using (is_admin() or (my_role() = 'manager' and (user_id = auth.uid() or in_scope(user_id))));

-- settings: odczyt dla zalogowanych (progi potrzebne aplikacji), zmiana — admin
drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings for select using (auth.uid() is not null);
drop policy if exists settings_admin on public.settings;
create policy settings_admin on public.settings for update using (is_admin()) with check (is_admin());

-- bio_profiles: handlowiec — swój profil; admin — wszystkie (reset)
drop policy if exists bio_own on public.bio_profiles;
create policy bio_own on public.bio_profiles for all using (user_id = auth.uid() or is_admin()) with check (user_id = auth.uid() or is_admin());

drop policy if exists webhook_admin on public.webhook_log;
create policy webhook_admin on public.webhook_log for all using (is_admin()) with check (is_admin());

-- uprawnienia kolumnowe: handlowiec nie zmieni statusu, decyzji ani czasu wizyty
revoke update on public.visits from authenticated, anon;
grant update (gps_lat, gps_lng, gps_accuracy) on public.visits to authenticated;
revoke insert, update on public.photos from authenticated, anon;
grant insert (visit_id, type, storage_key, ocr_text, ocr_conf, phash, file_age_ms) on public.photos to authenticated;
grant update (purged, storage_key) on public.photos to authenticated;
revoke insert, update, delete on public.audit_log from authenticated, anon;

grant execute on function public.start_visit(uuid), public.submit_visit(uuid, text, text, jsonb, jsonb),
  public.decide_visit(uuid, text, text), public.log_event(text, text), public.my_role(), public.is_admin(), public.in_scope(uuid)
  to authenticated;
revoke execute on function public.fc_verify(uuid), public.fc_audit(text, text) from public, anon, authenticated;

-- ============================================================ MAGAZYN ZDJĘĆ (prywatny bucket)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false;

-- ścieżka: {rep_id}/{visit_id}/{typ}.jpg
drop policy if exists photos_upload on storage.objects;
create policy photos_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text and public.my_role() = 'rep');
drop policy if exists photos_read on storage.objects;
create policy photos_read on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.my_role() in ('admin', 'manager') and public.in_scope(((storage.foldername(name))[1])::uuid));
drop policy if exists photos_delete on storage.objects;
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.is_admin());

select 'schemat FieldCheck gotowy' as wynik;
