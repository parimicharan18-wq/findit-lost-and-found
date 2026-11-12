-- Allow owner item photos to be uploaded as compressed image data from the app.
alter table public.findit_owner_items alter column photo_url type text;
alter table public.findit_owner_items drop constraint if exists findit_owner_items_photo_url_check;
alter table public.findit_owner_items add constraint findit_owner_items_photo_url_check
  check (char_length(photo_url) <= 350000 and (photo_url = '' or photo_url ~ '^https://.*' or photo_url ~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$'));

create or replace function public.findit_create_owner_item(p_item jsonb,p_token text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_owner uuid := auth.uid(); v_photo text := coalesce(p_item->>'photo_url','');
begin
 if v_owner is null then raise exception 'Sign in required.' using errcode='42501'; end if;
 if p_token !~ '^[a-f0-9]{64}$' then raise exception 'Invalid QR token.' using errcode='22023'; end if;
 if char_length(v_photo) > 350000 or (v_photo <> '' and v_photo !~ '^https://.*' and v_photo !~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$') then raise exception 'Invalid item photo.' using errcode='22023'; end if;
 insert into public.findit_owner_items(owner_id,name,category,description,photo_url)
 values(v_owner,left(btrim(p_item->>'name'),100),left(coalesce(p_item->>'category','Other Items'),50),left(coalesce(p_item->>'description',''),1000),v_photo) returning id into v_id;
 insert into public.findit_qr_tags(item_id,token_hash) values(v_id,encode(extensions.digest(p_token,'sha256'),'hex'));
 return v_id;
end $$;
grant execute on function public.findit_create_owner_item(jsonb,text) to authenticated;
