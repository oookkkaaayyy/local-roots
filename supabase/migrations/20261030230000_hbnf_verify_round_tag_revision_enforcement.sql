-- Enforce the revisions already supplied by the round-tag client; retain edit-id idempotency.
CREATE OR REPLACE FUNCTION public.hbnf_verify_round_tag_v1(p_round_date date, p_event_type text, p_player_name text, p_tag_number integer, p_expected_authority_revision bigint, p_expected_entry_revision bigint, p_client_edit_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_name text:=trim(coalesce(p_player_name,'')); v_key text; v_now timestamptz:=clock_timestamp(); v_old_tag integer;
  v_authority public.hbnf_tag_authority_state%rowtype; v_entry public.hbnf_round_tag_entries%rowtype; v_finalized boolean; v_displaced text[];
  v_saved public.hbnf_current_tag_entries%rowtype; v_bag jsonb; v_seen public.hbnf_verified_tag_edits%rowtype;
begin
  if p_round_date is null or p_event_type not in ('skins','glow') or v_name='' or length(v_name)>120 or p_tag_number is null or p_tag_number<1 or p_tag_number>999999 or p_client_edit_id is null then
    raise exception using errcode='22023',message='invalid verified tag input'; end if;
  v_key:=lower(v_name);
  perform 1 from public.league_state where id=1 for update;
  select * into v_authority from public.hbnf_tag_authority_state where id=1 for update;
  if not found then raise exception 'tag authority state unavailable'; end if;
  select * into v_seen from public.hbnf_verified_tag_edits where client_edit_id=p_client_edit_id;
  if found then
    if v_seen.round_date<>p_round_date or v_seen.event_type<>p_event_type or v_seen.player_key<>v_key or v_seen.tag_number<>p_tag_number then
      return jsonb_build_object('status','conflict','reason','edit_id_reused','current_revision',v_authority.revision);
    end if;
    select * into v_saved from public.hbnf_current_tag_entries where player_key=v_key;
    select * into v_entry from public.hbnf_round_tag_entries where round_date=p_round_date and event_type=p_event_type and player_key=v_key;
    return jsonb_build_object('status','saved','idempotent',true,'row',to_jsonb(v_saved),'entry',to_jsonb(v_entry),
      'current_revision',v_authority.revision,'bag_tags',(select state_json->'bagTags' from public.league_state where id=1));
  end if;
  select exists(select 1 from public.hbnf_round_tag_finalizations where round_date=p_round_date and event_type=p_event_type) into v_finalized;
  if v_finalized then return jsonb_build_object('status','conflict','reason','handoff_required','current_revision',v_authority.revision); end if;
  select * into v_entry from public.hbnf_round_tag_entries where round_date=p_round_date and event_type=p_event_type and player_key=v_key for update;
  if found and v_entry.client_edit_id=p_client_edit_id and v_entry.tag_number=p_tag_number and v_entry.status='confirmed' then
    select * into v_saved from public.hbnf_current_tag_entries where player_key=v_key;
    return jsonb_build_object('status','saved','idempotent',true,'row',to_jsonb(v_saved),'current_revision',v_authority.revision,
      'bag_tags',(select state_json->'bagTags' from public.league_state where id=1));
  end if;
  if p_expected_authority_revision is null or p_expected_authority_revision<>v_authority.revision then
    return jsonb_build_object('status','conflict','reason','authority_revision','current_revision',v_authority.revision);
  end if;
  if found then
    if p_expected_entry_revision is null or p_expected_entry_revision<>v_entry.revision then
      return jsonb_build_object('status','conflict','reason','entry_revision','current_revision',v_authority.revision,'current_entry_revision',v_entry.revision);
    end if;
  elsif p_expected_entry_revision is distinct from 0 then
    return jsonb_build_object('status','conflict','reason','entry_revision','current_revision',v_authority.revision,'current_entry_revision',0);
  end if;
  select tag_number into v_old_tag from public.hbnf_current_tag_entries where player_key=v_key;
  if v_old_tag is not null and v_old_tag<>p_tag_number then
    insert into public.hbnf_current_available_tags(tag_number,source,notes,updated_at)
      select v_old_tag,'Manual correction','Released by manual tag update',v_now
      where not exists(select 1 from public.hbnf_current_tag_entries e where e.tag_number=v_old_tag and e.player_key<>v_key)
    on conflict(tag_number) do update set source=excluded.source,notes=excluded.notes,updated_at=excluded.updated_at;
  end if;
  select array_agg(player_key) into v_displaced from public.hbnf_current_tag_entries where tag_number=p_tag_number and player_key<>v_key;
  delete from public.hbnf_current_tag_entries where tag_number=p_tag_number and player_key<>v_key;
  delete from public.hbnf_current_available_tags where tag_number=p_tag_number;
  insert into public.hbnf_current_tag_entries(player_key,player_name,tag_number,updated_at) values(v_key,v_name,p_tag_number,v_now)
    on conflict(player_key) do update set player_name=excluded.player_name,tag_number=excluded.tag_number,updated_at=excluded.updated_at returning * into v_saved;
  update public.hbnf_round_tag_entries e set tag_number=null,status='unknown',client_edit_id=gen_random_uuid()
    where e.tag_number=p_tag_number and e.player_key<>v_key
      and not exists(select 1 from public.hbnf_round_tag_finalizations f where f.round_date=e.round_date and f.event_type=e.event_type);
  update public.hbnf_round_tag_entries e set tag_number=p_tag_number,status='unconfirmed',client_edit_id=gen_random_uuid()
    where e.player_key=v_key and e.tag_number is distinct from p_tag_number
      and not (e.round_date=p_round_date and e.event_type=p_event_type)
      and not exists(select 1 from public.hbnf_round_tag_finalizations f where f.round_date=e.round_date and f.event_type=e.event_type);
  insert into public.hbnf_round_tag_entries(round_date,event_type,player_key,player_name,tag_number,status,client_edit_id)
    values(p_round_date,p_event_type,v_key,v_name,p_tag_number,'confirmed',p_client_edit_id)
    on conflict(round_date,event_type,player_key) do update set player_name=excluded.player_name,tag_number=excluded.tag_number,status='confirmed',client_edit_id=excluded.client_edit_id;
  insert into public.hbnf_verified_tag_edits(client_edit_id,round_date,event_type,player_key,player_name,tag_number,created_at)
    values(p_client_edit_id,p_round_date,p_event_type,v_key,v_name,p_tag_number,v_now);
  v_bag:=public.hbnf_sync_tag_mirrors_v1(v_now);
  update public.hbnf_tag_authority_state set revision=revision+1,updated_at=v_now where id=1 returning * into v_authority;
  return jsonb_build_object('status','saved','row',to_jsonb(v_saved),'entry',(select to_jsonb(e) from public.hbnf_round_tag_entries e where e.round_date=p_round_date and e.event_type=p_event_type and e.player_key=v_key),'entry_revision',(select revision from public.hbnf_round_tag_entries where round_date=p_round_date and event_type=p_event_type and player_key=v_key),
    'current_revision',v_authority.revision,'bag_tags',v_bag,'displaced_player_keys',coalesce(to_jsonb(v_displaced),'[]'::jsonb));
end;
$function$
\n