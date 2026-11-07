\set ON_ERROR_STOP on
-- ALL DATA IN THIS FILE IS SYNTHETIC AND PRIVATE TO THE EPHEMERAL PG17 CONTAINER.
-- Exact native functions reproduced from authenticated installed pg_get_functiondef;
-- no keys, URLs, production user SQL connections or real customer cash.
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
CREATE TABLE public.league_state(id integer PRIMARY KEY,state_json jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE public.hbnf_current_tag_entries(player_key text PRIMARY KEY,player_name text NOT NULL,tag_number integer NOT NULL CHECK(tag_number>0),updated_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE public.hbnf_current_available_tags(tag_number integer PRIMARY KEY CHECK(tag_number>0),source text NOT NULL DEFAULT '',notes text NOT NULL DEFAULT '',updated_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE public.hbnf_tag_authority_state(id smallint PRIMARY KEY,revision bigint NOT NULL DEFAULT 0,latest_finalized_round date,latest_finalized_event_type text,latest_finalization_order bigint,updated_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE public.hbnf_matrix_control_state(id smallint PRIMARY KEY,auto_live boolean NOT NULL DEFAULT false);
CREATE TABLE public.hbnf_round_tag_entries(round_date date NOT NULL,event_type text NOT NULL,player_key text NOT NULL,player_name text NOT NULL,tag_number integer,status text NOT NULL DEFAULT 'unconfirmed',client_edit_id uuid NOT NULL DEFAULT gen_random_uuid(),revision bigint NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),back_tag_number integer,PRIMARY KEY(round_date,event_type,player_key));
CREATE TABLE public.hbnf_round_tag_finalizations(round_date date NOT NULL,event_type text NOT NULL,assignments jsonb NOT NULL DEFAULT '[]'::jsonb,available_tags jsonb NOT NULL DEFAULT '[]'::jsonb,client_edit_id uuid NOT NULL DEFAULT gen_random_uuid(),revision bigint NOT NULL DEFAULT 1,finalized_at timestamptz NOT NULL DEFAULT now(),finalization_order bigint,pending_assignments jsonb,pending_available_tags jsonb,handoff_pending boolean NOT NULL DEFAULT false,pending_client_edit_id uuid,handoff_confirmation_id uuid,PRIMARY KEY(round_date,event_type));
CREATE SEQUENCE public.hbnf_tag_finalization_order_seq START 5;
CREATE OR REPLACE FUNCTION public.hbnf_apply_round_tag_handoff_v1(p_assignments jsonb, p_available_tags jsonb, p_applied_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare item jsonb; v_key text; v_name text; v_status text; v_tag integer; v_source text; v_notes text;
begin
  if jsonb_typeof(coalesce(p_assignments,'[]'::jsonb))<>'array' or jsonb_typeof(coalesce(p_available_tags,'[]'::jsonb))<>'array' then
    raise exception 'assignments and available_tags must be arrays';
  end if;
  for item in select value from jsonb_array_elements(coalesce(p_assignments,'[]'::jsonb)) loop
    v_key:=lower(trim(coalesce(item->>'player_key',''))); v_name:=trim(coalesce(item->>'player_name',''));
    v_status:=coalesce(item->>'status','confirmed');
    v_tag:=case when coalesce(item->>'tag_number','')~'^[0-9]+$' then (item->>'tag_number')::integer else null end;
    if v_key='' then continue; end if;
    if v_name='' or length(v_name)>120 or v_key<>lower(v_name) then raise exception 'invalid player identity for %',v_key; end if;
    if v_tag is not null and (v_tag<1 or v_tag>999999) then raise exception 'invalid tag number for %',v_key; end if;
    if v_status not in ('confirmed','unconfirmed','unknown','untagged') then raise exception 'invalid assignment status for %',v_key; end if;
    if v_status='untagged' then delete from public.hbnf_current_tag_entries where player_key=v_key;
    elsif v_tag is not null then
      insert into public.hbnf_current_tag_entries(player_key,player_name,tag_number,updated_at)
      values(v_key,v_name,v_tag,p_applied_at)
      on conflict(player_key) do update set player_name=excluded.player_name,tag_number=excluded.tag_number,updated_at=p_applied_at;
      delete from public.hbnf_current_available_tags where tag_number=v_tag;
    end if;
  end loop;
  delete from public.hbnf_current_available_tags current_tag
   where not exists (select 1 from jsonb_array_elements(coalesce(p_available_tags,'[]'::jsonb)) d(tag_json)
     where coalesce(d.tag_json->>'tag_number','')~'^[0-9]+$' and (d.tag_json->>'tag_number')::integer>0 and (d.tag_json->>'tag_number')::integer=current_tag.tag_number);
  for item in select value from jsonb_array_elements(coalesce(p_available_tags,'[]'::jsonb)) loop
    v_tag:=case when coalesce(item->>'tag_number','')~'^[0-9]+$' then (item->>'tag_number')::integer else null end;
    v_source:=trim(coalesce(item->>'source','')); v_notes:=trim(coalesce(item->>'notes',''));
    if v_tag is null or v_tag<=0 then continue; end if;
    insert into public.hbnf_current_available_tags(tag_number,source,notes,updated_at) values(v_tag,v_source,v_notes,p_applied_at)
    on conflict(tag_number) do update set source=excluded.source,notes=excluded.notes,updated_at=p_applied_at;
  end loop;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.hbnf_enforce_league_state_revision()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at := greatest(
    pg_catalog.clock_timestamp(),
    coalesce(old.updated_at, '-infinity'::timestamptz) + interval '1 microsecond'
  );
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.hbnf_finalize_round_tags_v3(p_round_date date, p_event_type text, p_assignments jsonb, p_available_tags jsonb, p_client_edit_id uuid, p_expected_round_revision bigint, p_expected_authority_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_authority public.hbnf_tag_authority_state%rowtype; v_round public.hbnf_round_tag_finalizations%rowtype;
  v_id uuid:=coalesce(p_client_edit_id,gen_random_uuid()); v_rev bigint:=0; v_order bigint;
  v_at timestamptz:=clock_timestamp(); v_has boolean:=false; v_latest boolean:=false; v_idempotent boolean:=false;
  v_pending boolean:=false; v_assignments jsonb:=coalesce(p_assignments,'[]'::jsonb); v_available jsonb:=coalesce(p_available_tags,'[]'::jsonb);
begin
  if p_round_date is null or p_event_type is null then raise exception 'event identity is required'; end if;
  if p_event_type not in ('skins','glow') then raise exception 'invalid event_type'; end if;
  if jsonb_typeof(v_assignments)<>'array' or jsonb_typeof(v_available)<>'array' or jsonb_array_length(v_assignments)>200 or jsonb_array_length(v_available)>200 then raise exception 'invalid tag handoff payload'; end if;
  perform 1 from public.league_state where id=1 for update;
  if not found then raise exception 'league_state row 1 is required'; end if;
  select a.* into v_authority from public.hbnf_tag_authority_state a where a.id=1 for update;
  if not found then raise exception 'tag authority row 1 is required'; end if;
  select f.* into v_round from public.hbnf_round_tag_finalizations f where f.round_date=p_round_date and f.event_type=p_event_type for update;
  v_has:=found; if v_has then v_rev:=v_round.revision; end if;

  if v_has and (
      (v_round.client_edit_id=v_id and (v_round.assignments is distinct from v_assignments or v_round.available_tags is distinct from v_available))
      or (v_round.pending_client_edit_id=v_id and (v_round.pending_assignments is distinct from v_assignments or v_round.pending_available_tags is distinct from v_available))
      or (v_round.handoff_confirmation_id=v_id and (v_round.assignments is distinct from v_assignments or v_round.available_tags is distinct from v_available))
  ) then
    return jsonb_build_object('status','conflict','reason','edit_id_reused','revision',v_round.revision,'current_revision',v_authority.revision);
  elsif v_has and v_round.client_edit_id=v_id and v_round.assignments=v_assignments and v_round.available_tags=v_available then v_idempotent:=true;
  elsif v_has and v_round.handoff_pending and v_round.pending_client_edit_id=v_id and v_round.pending_assignments=v_assignments and v_round.pending_available_tags=v_available then v_idempotent:=true;
  elsif v_has and v_round.handoff_confirmation_id=v_id and v_round.assignments=v_assignments and v_round.available_tags=v_available then v_idempotent:=true;
  elsif p_expected_authority_revision is null or p_expected_authority_revision<>v_authority.revision or p_expected_round_revision is null or p_expected_round_revision<>v_rev then
    return jsonb_build_object('status','conflict','reason','revision','revision',v_rev,'current_revision',v_authority.revision,'latest_finalized_round',v_authority.latest_finalized_round);
  end if;

  v_order:=case when v_has then v_round.finalization_order else nextval('public.hbnf_tag_finalization_order_seq') end;
  v_latest:=v_authority.latest_finalized_round=p_round_date and v_authority.latest_finalized_event_type=p_event_type and v_authority.latest_finalization_order=v_order;
  if not v_idempotent then
    if v_has then
      v_pending:=v_assignments is distinct from v_round.assignments or v_available is distinct from v_round.available_tags;
      if v_pending then
        update public.hbnf_round_tag_finalizations set pending_assignments=v_assignments,pending_available_tags=v_available,
          handoff_pending=true,pending_client_edit_id=v_id,handoff_confirmation_id=null,revision=revision+1
        where round_date=p_round_date and event_type=p_event_type;
      else
        update public.hbnf_round_tag_finalizations set pending_assignments=null,pending_available_tags=null,
          handoff_pending=false,pending_client_edit_id=null,revision=revision+case when handoff_pending then 1 else 0 end
        where round_date=p_round_date and event_type=p_event_type;
      end if;
      update public.hbnf_tag_authority_state set revision=revision+1,updated_at=v_at where id=1;
    else
      v_latest:=v_authority.latest_finalized_round is null or p_round_date>v_authority.latest_finalized_round
        or (p_round_date=v_authority.latest_finalized_round and v_order>=coalesce(v_authority.latest_finalization_order,0));
      if v_latest then perform public.hbnf_apply_round_tag_handoff_v1(v_assignments,v_available,v_at); end if;
      insert into public.hbnf_round_tag_finalizations(round_date,event_type,finalization_order,assignments,available_tags,client_edit_id,revision,finalized_at,handoff_pending)
        values(p_round_date,p_event_type,v_order,v_assignments,v_available,v_id,1,v_at,false);
      update public.hbnf_tag_authority_state set revision=revision+1,
        latest_finalized_round=case when v_latest then p_round_date else latest_finalized_round end,
        latest_finalized_event_type=case when v_latest then p_event_type else latest_finalized_event_type end,
        latest_finalization_order=case when v_latest then v_order else latest_finalization_order end,updated_at=v_at where id=1;
    end if;
  end if;
  select f.* into v_round from public.hbnf_round_tag_finalizations f where f.round_date=p_round_date and f.event_type=p_event_type;
  select a.* into v_authority from public.hbnf_tag_authority_state a where a.id=1;
  return jsonb_build_object('status','saved','round_date',p_round_date,'event_type',p_event_type,'finalization_order',v_order,
    'revision',v_round.revision,'finalized_at',v_round.finalized_at,'current_revision',v_authority.revision,
    'latest_finalized_round',v_authority.latest_finalized_round,'latest_finalized_event_type',v_authority.latest_finalized_event_type,
    'latest_finalization_order',v_authority.latest_finalization_order,'applied_current',case when v_has then false else v_latest end,
    'handoff_pending',v_round.handoff_pending,'assignments',v_round.assignments,'available_tags',v_round.available_tags,
    'pending_assignments',v_round.pending_assignments,'pending_available_tags',v_round.pending_available_tags,
    'current_entries',(select coalesce(jsonb_agg(to_jsonb(t) order by t.tag_number,lower(t.player_name)),'[]'::jsonb) from public.hbnf_current_tag_entries t),
    'current_available_tags',(select coalesce(jsonb_agg(to_jsonb(t) order by t.tag_number),'[]'::jsonb) from public.hbnf_current_available_tags t));
end;
$function$
;
CREATE OR REPLACE FUNCTION public.hbnf_project_current_tags_into_league_state()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_bag jsonb; v_players jsonb; v_manual jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('tag',e.tag_number,'name',e.player_name) order by e.tag_number,lower(e.player_name)),'[]'::jsonb),
         coalesce(jsonb_object_agg(e.player_name,e.tag_number),'{}'::jsonb)
    into v_players,v_manual from public.hbnf_current_tag_entries e;
  v_bag := coalesce(new.state_json->'bagTags','{}'::jsonb);
  if jsonb_typeof(v_bag)<>'object' then v_bag := '{}'::jsonb; end if;
  new.state_json := jsonb_set(new.state_json,'{bagTags,players}',v_players,true);
  new.state_json := jsonb_set(new.state_json,'{bagTags,manual}',v_manual,true);
  return new;
end;
$function$
;
CREATE TRIGGER hbnf_project_current_tags_into_league_state BEFORE INSERT OR UPDATE OF state_json ON public.league_state FOR EACH ROW EXECUTE FUNCTION public.hbnf_project_current_tags_into_league_state();
CREATE TRIGGER zzz_hbnf_enforce_league_state_revision BEFORE UPDATE ON public.league_state FOR EACH ROW EXECUTE FUNCTION public.hbnf_enforce_league_state_revision();
INSERT INTO public.hbnf_tag_authority_state(id,revision,latest_finalized_round,latest_finalized_event_type,latest_finalization_order) VALUES(1,9,'2026-10-20','skins',4);
INSERT INTO public.hbnf_matrix_control_state(id,auto_live) VALUES(1,false);
INSERT INTO public.hbnf_current_tag_entries(player_key,player_name,tag_number,updated_at) VALUES
('rusty','Rusty',1,'2026-10-20T07:00:00Z'::timestamptz),
('andrew','Andrew',2,'2026-10-20T07:00:00Z'::timestamptz),
('fox','Fox',5,'2026-10-20T07:00:00Z'::timestamptz),
('jason','Jason',6,'2026-10-20T07:00:00Z'::timestamptz),
('quiotee','Quiotee',7,'2026-10-20T07:00:00Z'::timestamptz),
('dylan','Dylan',8,'2026-10-20T07:00:00Z'::timestamptz),
('matt','Matt',10,'2026-10-20T07:00:00Z'::timestamptz),
('karl','Karl',15,'2026-10-20T07:00:00Z'::timestamptz),
('danny','Danny',16,'2026-10-20T07:00:00Z'::timestamptz);
INSERT INTO public.hbnf_current_available_tags(tag_number,source,notes,updated_at) VALUES(14,'Manual correction','Released by manual tag update','2026-10-28T00:51:11.782725Z'::timestamptz);
INSERT INTO public.hbnf_round_tag_entries(round_date,event_type,player_key,player_name,tag_number,status) VALUES ('2026-10-27','skins','jason','Jason',6,'confirmed');
INSERT INTO public.hbnf_round_tag_finalizations(round_date,event_type,assignments,available_tags,revision,finalization_order) VALUES('2026-10-20','skins','[]'::jsonb,'[]'::jsonb,1,4);
INSERT INTO public.league_state(id,state_json,updated_at) VALUES (1,'{"glow":{"activeWeek":"2026-11-03","weeks":{"2026-11-03":{"players":[{"id":"UDISC_NOV03_1","partner1":"Fox","partner2":"Jason","cardId":"C1","scores":["3","3","3","3","3","3","3","3","3","3","3","3","2","2","2","2","2","2"]},{"id":"UDISC_NOV03_2","partner1":"Andrew","partner2":"Matt","cardId":"C1","scores":["3","3","3","3","3","3","3","3","3","3","3","3","3","3","3","3","2","2"]},{"id":"UDISC_NOV03_3","partner1":"Kyle","partner2":"Dylan","cardId":"C1","scores":["3","3","3","3","3","3","3","3","3","3","3","3","3","3","3","3","2","2"]},{"id":"UDISC_NOV03_4","partner1":"Karl","partner2":"Tony","cardId":"C1","scores":["3","3","3","3","3","3","3","3","3","3","3","3","3","3","3","4","4","4"]}],"cards":[{"id":"C1","finalized":true}],"scoresLocked":true,"scorecardText":{"holePars":{"1":"4","2":"4","3":"4","4":"4","5":"4","6":"3","7":"3","8":"3","9":"3","10":"3","11":"3","12":"3","13":"3","14":"3","15":"3","16":"3","17":"3","18":"3"}}}}},"skins":{"weeks":{"2026-10-27":{"source":"preserve"}}},"admin":{"backups":[{"id":"historic"}]},"bagTags":{"manual":{"Rusty":1,"Andrew":2,"Fox":5,"Jason":6,"Quiotee":7,"Dylan":8,"Matt":10,"Karl":15,"Danny":16},"players":[{"name":"Rusty","tag":1},{"name":"Andrew","tag":2},{"name":"Fox","tag":5},{"name":"Jason","tag":6},{"name":"Quiotee","tag":7},{"name":"Dylan","tag":8},{"name":"Matt","tag":10},{"name":"Karl","tag":15},{"name":"Danny","tag":16}],"manualEventBlockers":{},"lastManualSaveAt":"2026-10-20T00:00:00Z"}}'::jsonb,'2026-11-04T07:30:01.546079Z');
CREATE TABLE public.hbnf_pg17_fixture_baseline AS SELECT (SELECT state_json FROM public.league_state WHERE id=1) old_root,(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.tag_number) FROM public.hbnf_current_tag_entries e) old_owners,(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.tag_number) FROM public.hbnf_current_available_tags a) old_available,(SELECT count(*) FROM public.hbnf_round_tag_entries) old_entries_count,(SELECT count(*) FROM public.hbnf_round_tag_finalizations) old_finalizations_count;
SELECT 'T1_T2_PG17_NATIVE_PREIMAGE_READY' AS proof;