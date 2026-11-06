-- Owner accounts, registered property, privacy-safe QR tags, and finder reports.
create table if not exists public.findit_owner_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 100),
  mobile text not null check (char_length(mobile) between 7 and 25),
  created_at timestamptz not null default now()
);
create or replace function public.findit_create_owner_profile()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.findit_owner_profiles(user_id,full_name,mobile)
 values(new.id,left(coalesce(new.raw_user_meta_data->>'full_name','FindIt owner'),100),left(coalesce(new.raw_user_meta_data->>'mobile',new.phone,'Not provided'),25))
 on conflict(user_id) do update set full_name=excluded.full_name,mobile=excluded.mobile;
 return new;
end $$;
drop trigger if exists findit_owner_profile_after_signup on auth.users;
create trigger findit_owner_profile_after_signup after insert on auth.users for each row execute function public.findit_create_owner_profile();
create table if not exists public.findit_owner_items (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100), category text not null,
  description text not null default '' check (char_length(description) <= 1000), photo_url text not null default '',
  status text not null default 'Active' check (status in ('Active','Recovered','Inactive')),
  created_at timestamptz not null default now()
);
create table if not exists public.findit_qr_tags (
  item_id uuid primary key references public.findit_owner_items(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'), active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.findit_finder_reports (
  id uuid primary key default gen_random_uuid(), item_id uuid not null references public.findit_owner_items(id) on delete cascade,
  finder_name text not null check (char_length(finder_name) between 1 and 100),
  finder_email text not null check (char_length(finder_email) between 3 and 254),
  finder_mobile text not null check (char_length(finder_mobile) between 7 and 25),
  location text not null check (char_length(location) between 1 and 160),
  message text not null check (char_length(message) between 1 and 2000),
  status text not null default 'Pending' check (status in ('Pending','Resolved')),
  email_status text not null default 'pending' check (email_status in ('pending','sent','failed')),
  created_at timestamptz not null default now()
);
create index if not exists findit_finder_reports_item_created on public.findit_finder_reports(item_id,created_at desc);
alter table public.findit_owner_profiles enable row level security;
alter table public.findit_owner_items enable row level security;
alter table public.findit_qr_tags enable row level security;
alter table public.findit_finder_reports enable row level security;
drop policy if exists "Owners read own profile" on public.findit_owner_profiles;
create policy "Owners read own profile" on public.findit_owner_profiles for select to authenticated using (user_id = auth.uid());
drop policy if exists "Owners insert own profile" on public.findit_owner_profiles;
create policy "Owners insert own profile" on public.findit_owner_profiles for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "Owners manage own items" on public.findit_owner_items;
create policy "Owners manage own items" on public.findit_owner_items for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "Owners read own tags" on public.findit_qr_tags;
create policy "Owners read own tags" on public.findit_qr_tags for select to authenticated using (exists(select 1 from public.findit_owner_items i where i.id=item_id and i.owner_id=auth.uid()));
drop policy if exists "Owners read and update own reports" on public.findit_finder_reports;
create policy "Owners read and update own reports" on public.findit_finder_reports for select to authenticated using (exists(select 1 from public.findit_owner_items i where i.id=item_id and i.owner_id=auth.uid()));
create policy "Owners resolve own reports" on public.findit_finder_reports for update to authenticated using (exists(select 1 from public.findit_owner_items i where i.id=item_id and i.owner_id=auth.uid())) with check (status in ('Pending','Resolved'));
revoke all on public.findit_owner_profiles,public.findit_owner_items,public.findit_qr_tags,public.findit_finder_reports from anon, authenticated;
grant select,insert on public.findit_owner_profiles to authenticated;
grant select,insert,update,delete on public.findit_owner_items to authenticated;
grant select on public.findit_qr_tags,public.findit_finder_reports to authenticated;
grant update(status) on public.findit_finder_reports to authenticated;

create or replace function public.findit_create_owner_item(p_item jsonb,p_token text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_owner uuid := auth.uid();
begin
 if v_owner is null then raise exception 'Sign in required.' using errcode='42501'; end if;
 if p_token !~ '^[a-f0-9]{64}$' then raise exception 'Invalid QR token.' using errcode='22023'; end if;
 insert into public.findit_owner_items(owner_id,name,category,description,photo_url)
 values(v_owner,left(btrim(p_item->>'name'),100),left(coalesce(p_item->>'category','Other Items'),50),left(coalesce(p_item->>'description',''),1000),left(coalesce(p_item->>'photo_url',''),1000)) returning id into v_id;
 insert into public.findit_qr_tags(item_id,token_hash) values(v_id,encode(extensions.digest(p_token,'sha256'),'hex'));
 return v_id;
end $$;
create or replace function public.findit_resolve_qr(p_token text)
returns table(item_id uuid,name text,category text,description text,photo_url text)
language sql security definer set search_path='' as $$
 select i.id,i.name,i.category,i.description,i.photo_url from public.findit_qr_tags q join public.findit_owner_items i on i.id=q.item_id
 where q.active and i.status='Active' and q.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and p_token ~ '^[a-f0-9]{64}$' limit 1;
$$;
create or replace function public.findit_rotate_qr(p_item_id uuid,p_token text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Sign in required.' using errcode='42501'; end if;
 update public.findit_qr_tags q set token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
 from public.findit_owner_items i where q.item_id=i.id and i.id=p_item_id and i.owner_id=auth.uid() and i.status <> 'Inactive';
 return found;
end $$;
grant execute on function public.findit_create_owner_item(jsonb,text) to authenticated;
grant execute on function public.findit_resolve_qr(text) to anon,authenticated;
grant execute on function public.findit_rotate_qr(uuid,text) to authenticated;
revoke all on function public.findit_create_owner_item(jsonb,text),public.findit_resolve_qr(text),public.findit_rotate_qr(uuid,text) from public;

comment on table public.findit_qr_tags is 'Only SHA-256 QR token hashes are stored. Raw tokens are printed once and never returned by database queries.';
comment on table public.findit_finder_reports is 'Finder contact data is private to the registered owner through RLS.';
