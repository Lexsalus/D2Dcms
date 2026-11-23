-- FieldCheck · 02_extras.sql — powiązanie urządzenia, sekrety integracji, webhooki wysyłane przez serwer (pg_net).
-- Uruchom po 01_schema.sql. Można uruchamiać ponownie.

create extension if not exists pg_net;

-- ============================================================ powiązanie handlowca z jednym telefonem
create or replace function public.bind_device(p_device text) returns text
language plpgsql security definer set search_path = public as $$
declare cur text;
begin
  if my_role() <> 'rep' then return null; end if;
  select device_id into cur from profiles where id = auth.uid();
  if cur is null then update profiles set device_id = p_device where id = auth.uid(); return p_device; end if;
  if cur <> p_device then raise exception 'device_bound'; end if;
  return cur;
end $$;
grant execute on function public.bind_device(text) to authenticated;

-- ============================================================ sekrety (adres i token webhooka) — tylko admin
create table if not exists public.secrets (key text primary key, value text);
alter table public.secrets enable row level security;
drop policy if exists secrets_admin on public.secrets;
create policy secrets_admin on public.secrets for all using (is_admin()) with check (is_admin());

alter table public.webhook_log add column if not exists req_id bigint;

-- ============================================================ webhooki
create or replace function public.fc_visit_json(v_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', v.id, 'external_id', p.external_id,
    'property', jsonb_build_object('id', p.id, 'street', p.street, 'building', p.building, 'unit', p.unit, 'zip', p.zip, 'city', p.city, 'lat', p.lat, 'lng', p.lng),
    'assignment', jsonb_build_object('id', a.id, 'due', a.due, 'status', a.status),
    'rep', jsonb_build_object('id', r.id, 'name', r.name),
    'started_at', v.started_at, 'submitted_at', v.submitted_at, 'status', v.status, 'outcome', v.outcome, 'note', v.note,
    'gps', case when v.gps_lat is null then null else jsonb_build_object('lat', v.gps_lat, 'lng', v.gps_lng, 'accuracy', v.gps_accuracy) end,
    'reasons', coalesce((select jsonb_agg(x ->> 'code') from jsonb_array_elements(v.reasons) x), '[]'),
    'decision', v.decision, 'decision_reason', v.decision_reason, 'decided_at', v.decided_at)
  from visits v join properties p on p.id = v.property_id join assignments a on a.id = v.assignment_id join profiles r on r.id = v.user_id
  where v.id = v_id
$$;

-- wysyłka: tylko gdy adres jest ustawiony, a zdarzenie włączone w ustawieniach (test — zawsze)
create or replace function public.fc_webhook(p_event text, p_data jsonb) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare url text; tok text; evs jsonb; rid bigint;
begin
  select value into url from secrets where key = 'whUrl';
  select value into tok from secrets where key = 'whToken';
  select data -> 'whEvents' into evs from settings where id = 1;
  if coalesce(url, '') = '' then return null; end if;
  if p_event <> 'test' and not coalesce(evs ? p_event, p_event in ('visit.submitted', 'visit.decided')) then return null; end if;
  select net.http_post(
    url := url,
    body := jsonb_build_object('event', p_event, 'schema', 1, 'sentAt', now(), 'source', 'fieldcheck', 'data', p_data),
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-FieldCheck-Token', coalesce(tok, ''))
  ) into rid;
  insert into webhook_log (event, status, req_id) values (p_event, 'queued', rid);
  return rid;
exception when others then
  insert into webhook_log (event, status) values (p_event, 'error');
  return null;
end $$;
revoke execute on function public.fc_webhook(text, jsonb) from public, anon, authenticated;

create or replace function public.trg_visit_webhook() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'SUBMITTED' and new.status in ('AUTO_VERIFIED', 'TO_REVIEW') then
    perform fc_webhook('visit.submitted', fc_visit_json(new.id));
  elsif new.decided_at is distinct from old.decided_at and new.decided_at is not null then
    perform fc_webhook('visit.decided', fc_visit_json(new.id) || jsonb_build_object('decided_by', jsonb_build_object('id', new.decided_by, 'name', (select name from profiles where id = new.decided_by))));
  end if;
  return new;
end $$;
drop trigger if exists visit_webhook on public.visits;
create trigger visit_webhook after update on public.visits for each row execute function public.trg_visit_webhook();

create or replace function public.trg_assignment_webhook() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.user_id is distinct from old.user_id then
    perform fc_webhook('assignment.created', jsonb_build_object(
      'rep', (select jsonb_build_object('id', id, 'name', name) from profiles where id = new.user_id), 'due', new.due,
      'properties', (select jsonb_build_array(jsonb_build_object('id', id, 'external_id', external_id, 'street', street, 'building', building, 'unit', unit, 'city', city)) from properties where id = new.property_id)));
  end if;
  return new;
end $$;
drop trigger if exists assignment_webhook on public.assignments;
create trigger assignment_webhook after insert or update of user_id on public.assignments for each row execute function public.trg_assignment_webhook();

-- test z panelu (admin)
create or replace function public.test_webhook() returns bigint
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  return fc_webhook('test', jsonb_build_object('message', 'FieldCheck — test połączenia', 'by', (select name from profiles where id = auth.uid())));
end $$;

-- dziennik dostaw z odpowiedziami serwera CRM (admin)
create or replace function public.webhook_deliveries() returns table (ts timestamptz, event text, status text, code int, ms int)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  return query
    select w.ts, w.event,
      case when w.status = 'error' then 'error' when r.id is null then 'queued' when r.status_code between 200 and 299 then 'ok' else 'error' end,
      r.status_code, (extract(epoch from (r.created - w.ts)) * 1000)::int
    from webhook_log w left join net._http_response r on r.id = w.req_id
    order by w.ts desc limit 30;
end $$;
grant execute on function public.test_webhook(), public.webhook_deliveries() to authenticated;

select 'dodatki FieldCheck gotowe' as wynik;

-- ============================================================ 2FA wymagane (ustawienie require2fa)
-- Gdy włączone, admin i manager bez potwierdzonego drugiego składnika (aal2) nie mają żadnych uprawnień w bazie.
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from profiles p
  where id = auth.uid() and active
    and (role = 'rep'
         or not coalesce((select (data ->> 'require2fa')::boolean from settings where id = 1), false)
         or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2')
$$;
