-- FindIt shared community board.
-- Public item fields are readable by visitors. Reporter email is never stored
-- in this database; replies arrive in the owner's browser-local inbox.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.findit_reports (
  id text primary key check (id ~ '^[A-Za-z0-9-]{8,80}$'),
  type text not null check (type in ('Found','Lost')),
  name text not null check (char_length(name) between 1 and 60),
  category text not null,
  location text not null check (char_length(location) between 1 and 80),
  date date,
  color text not null default '' check (char_length(color) <= 60),
  description text not null default '' check (char_length(description) <= 500),
  emoji text not null default '📦' check (char_length(emoji) <= 8),
  photo_path text check (photo_path is null or photo_path ~ ('^' || id || '/[a-f0-9-]{8,80}[.](jpg|png|webp)$')),
  owner_token_hash text not null check (owner_token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);
create index if not exists findit_reports_created_at_idx on public.findit_reports (created_at desc);
alter table public.findit_reports enable row level security;
revoke all on table public.findit_reports from public, anon, authenticated;
grant select (id,type,name,category,location,date,color,description,emoji,photo_path,created_at) on table public.findit_reports to anon, authenticated;
drop policy if exists "FindIt reports are public to read" on public.findit_reports;
create policy "FindIt reports are public to read" on public.findit_reports for select to anon, authenticated using (true);

create table if not exists public.findit_messages (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  report_id text not null references public.findit_reports(id) on delete cascade,
  sender_email text not null check (char_length(sender_email) between 3 and 100),
  message text not null check (char_length(message) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists findit_messages_report_created_idx on public.findit_messages (report_id, created_at desc);
alter table public.findit_messages enable row level security;
revoke all on table public.findit_messages from public, anon, authenticated;

create table if not exists private.findit_rate_events (
  id bigint generated always as identity primary key,
  client_hash text not null,
  action text not null,
  created_at timestamptz not null default now()
);
create index if not exists findit_rate_events_lookup_idx on private.findit_rate_events (client_hash, action, created_at desc);
revoke all on table private.findit_rate_events from public, anon, authenticated;

create or replace function private.findit_client_hash()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_headers pg_catalog.json;
  v_ip text;
begin
  v_headers := coalesce(pg_catalog.current_setting('request.headers', true), '{}')::pg_catalog.json;
  v_ip := pg_catalog.split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1);
  if pg_catalog.length(pg_catalog.btrim(v_ip)) = 0 then
    raise exception 'Client network information is unavailable.' using errcode = 'P0001';
  end if;
  return pg_catalog.encode(extensions.digest(pg_catalog.btrim(v_ip) || pg_catalog.to_char(pg_catalog.now() at time zone 'utc','YYYY-MM-DD'), 'sha256'),'hex');
end;
$$;

create or replace function private.findit_check_rate(p_action text, p_limit integer, p_window interval)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_count integer;
begin
  v_hash := private.findit_client_hash();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_hash || ':' || p_action));
  delete from private.findit_rate_events where created_at < pg_catalog.now() - interval '1 day';
  select pg_catalog.count(*)::integer into v_count
    from private.findit_rate_events
    where client_hash = v_hash and action = p_action and created_at > pg_catalog.now() - p_window;
  if v_count >= p_limit then raise exception 'Too many requests. Please try again later.' using errcode = 'P0001'; end if;
  insert into private.findit_rate_events (client_hash,action) values (v_hash,p_action);
end;
$$;

create or replace function private.findit_owner_matches(p_report_id text, p_owner_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_owner_token ~ '^[a-fA-F0-9]{64}$'
     and exists (
       select 1 from public.findit_reports r
       where r.id = p_report_id
         and r.owner_token_hash = pg_catalog.encode(extensions.digest(pg_catalog.lower(p_owner_token), 'sha256'),'hex')
     );
$$;

create or replace function public.findit_create_report(p_report jsonb, p_owner_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id text := p_report ->> 'id';
  v_type text := p_report ->> 'type';
  v_name text := pg_catalog.btrim(p_report ->> 'name');
  v_category text := p_report ->> 'category';
  v_location text := pg_catalog.btrim(p_report ->> 'location');
  v_date date;
  v_result jsonb;
begin
  perform private.findit_check_rate('report:create', 8, interval '1 hour');
  if v_id is null or v_id !~ '^[A-Za-z0-9-]{8,80}$' then raise exception 'Invalid report id.' using errcode = '22023'; end if;
  if v_type not in ('Found','Lost') then raise exception 'Invalid report type.' using errcode = '22023'; end if;
  if v_name is null or pg_catalog.length(v_name) not between 1 and 60 then raise exception 'Invalid item name.' using errcode = '22023'; end if;
  if v_location is null or pg_catalog.length(v_location) not between 1 and 80 then raise exception 'Invalid item location.' using errcode = '22023'; end if;
  if p_owner_token is null or p_owner_token !~ '^[a-fA-F0-9]{64}$' then raise exception 'Invalid report recovery key.' using errcode = '22023'; end if;
  if v_category not in ('Electronics','Mobile Phones','Laptops and Tablets','Bags and Backpacks','Wallets and Purses','Keys','ID Cards and Documents','Books and Stationery','Watches and Jewelry','Clothing','Accessories','Water Bottles','Other') then v_category := 'Other'; end if;
  if coalesce(p_report ->> 'date','') <> '' then
    v_date := (p_report ->> 'date')::date;
    if v_date > current_date then raise exception 'Report date cannot be in the future.' using errcode = '22023'; end if;
  end if;
  insert into public.findit_reports (id,type,name,category,location,date,color,description,emoji,owner_token_hash)
  values (
    v_id,v_type,v_name,v_category,v_location,v_date,
    pg_catalog.left(coalesce(p_report ->> 'color',''),60),
    pg_catalog.left(coalesce(p_report ->> 'description',''),500),
    pg_catalog.left(coalesce(p_report ->> 'emoji','📦'),8),
    pg_catalog.encode(extensions.digest(pg_catalog.lower(p_owner_token),'sha256'),'hex')
  )
  on conflict (id) do nothing;
  -- A retry after a lost HTTP response is safe only for the same recovery key.
  if not found and not private.findit_owner_matches(v_id,p_owner_token) then
    raise exception 'Report id is already in use.' using errcode = '23505';
  end if;
  select pg_catalog.jsonb_build_object('id',id,'type',type,'name',name,'category',category,'location',location,'date',date,'color',color,'description',description,'emoji',emoji,'photo_path',photo_path,'created_at',created_at)
    into v_result from public.findit_reports where id = v_id;
  return v_result;
end;
$$;

create or replace function public.findit_attach_photo(p_report_id text, p_owner_token text, p_photo_path text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.findit_owner_matches(p_report_id,p_owner_token) then raise exception 'Report recovery key was not accepted.' using errcode = '42501'; end if;
  if p_photo_path !~ ('^' || p_report_id || '/[a-fA-F0-9-]{8,80}[.](jpg|png|webp)$') then raise exception 'Invalid report photo.' using errcode = '22023'; end if;
  update public.findit_reports set photo_path = p_photo_path where id = p_report_id;
  return found;
end;
$$;

create or replace function public.findit_send_message(p_report_id text, p_sender_email text, p_message text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_email text := pg_catalog.lower(pg_catalog.btrim(p_sender_email));
  v_message text := pg_catalog.btrim(p_message);
begin
  perform private.findit_check_rate('message:any', 20, interval '1 hour');
  perform private.findit_check_rate('message:' || p_report_id, 4, interval '1 hour');
  if not exists (select 1 from public.findit_reports where id = p_report_id) then raise exception 'This report is no longer available.' using errcode = 'P0002'; end if;
  if v_email is null or pg_catalog.length(v_email) not between 3 and 100 or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'Enter a valid reply email.' using errcode = '22023'; end if;
  if v_message is null or pg_catalog.length(v_message) not between 1 and 1000 then raise exception 'Message must be between 1 and 1000 characters.' using errcode = '22023'; end if;
  insert into public.findit_messages (report_id,sender_email,message) values (p_report_id,v_email,v_message) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.findit_list_messages(p_owner_tokens jsonb)
returns table (message_id uuid, report_id text, report_name text, sender_email text, message text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if pg_catalog.jsonb_typeof(p_owner_tokens) <> 'object' or pg_catalog.jsonb_object_length(p_owner_tokens) > 200 then
    raise exception 'Invalid inbox request.' using errcode = '22023';
  end if;
  return query
    select m.id,r.id,r.name,m.sender_email,m.message,m.created_at
    from pg_catalog.jsonb_each_text(p_owner_tokens) as entry(key,value)
    join public.findit_reports r on r.id = entry.key and private.findit_owner_matches(r.id,entry.value)
    join public.findit_messages m on m.report_id = r.id
    order by m.created_at desc
    limit 200;
end;
$$;

create or replace function public.findit_delete_report(p_report_id text, p_owner_token text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if not private.findit_owner_matches(p_report_id,p_owner_token) then raise exception 'Report recovery key was not accepted.' using errcode = '42501'; end if;
  delete from public.findit_reports where id = p_report_id;
  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end;
$$;

create or replace function public.findit_can_manage_photo(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.findit_owner_matches(
    pg_catalog.split_part(p_object_name,'/',1),
    pg_catalog.current_setting('request.headers',true)::pg_catalog.json ->> 'x-findit-owner-token'
  );
$$;

revoke all on function private.findit_client_hash() from public, anon, authenticated;
revoke all on function private.findit_check_rate(text,integer,interval) from public, anon, authenticated;
revoke all on function private.findit_owner_matches(text,text) from public, anon, authenticated;
revoke all on function public.findit_create_report(jsonb,text) from public, anon, authenticated;
revoke all on function public.findit_attach_photo(text,text,text) from public, anon, authenticated;
revoke all on function public.findit_send_message(text,text,text) from public, anon, authenticated;
revoke all on function public.findit_list_messages(jsonb) from public, anon, authenticated;
revoke all on function public.findit_delete_report(text,text) from public, anon, authenticated;
revoke all on function public.findit_can_manage_photo(text) from public, anon, authenticated;
grant execute on function public.findit_create_report(jsonb,text) to anon;
grant execute on function public.findit_attach_photo(text,text,text) to anon;
grant execute on function public.findit_send_message(text,text,text) to anon;
grant execute on function public.findit_list_messages(jsonb) to anon;
grant execute on function public.findit_delete_report(text,text) to anon;
grant execute on function public.findit_can_manage_photo(text) to anon;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('findit-item-photos','findit-item-photos',true,300000,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "FindIt report owners can upload photos" on storage.objects;
create policy "FindIt report owners can upload photos" on storage.objects
for insert to anon with check (bucket_id = 'findit-item-photos' and public.findit_can_manage_photo(name));
drop policy if exists "FindIt report owners can delete photos" on storage.objects;
create policy "FindIt report owners can delete photos" on storage.objects
for delete to anon using (bucket_id = 'findit-item-photos' and public.findit_can_manage_photo(name));

comment on table public.findit_reports is 'FindIt public item fields only. Email addresses and report recovery keys are not readable by visitors.';
comment on table public.findit_messages is 'Private messages readable only through findit_list_messages with the matching local report recovery key.';
