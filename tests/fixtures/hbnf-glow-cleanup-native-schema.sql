-- Disposable CI PostgreSQL 17 fixture, reconstructed from authenticated 2026-11-02
-- pg_get_functiondef/pg_get_triggerdef readback. NEVER run against HBNF production.
\set ON_ERROR_STOP on
CREATE TABLE public.league_state (
 id int PRIMARY KEY,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 state_json jsonb NOT NULL
);
CREATE TABLE public.hbnf_current_tag_entries (tag_number int, player_name text);
CREATE TABLE public.hbnf_matrix_control_state (id int primary key, auto_live boolean not null default false);
CREATE TABLE public.hbnf_matrix_vnext_live_queue (
 id int PRIMARY KEY, state_updated_at timestamptz, queued_at timestamptz,
 due_at timestamptz, status text, fingerprint text, last_error text, updated_at timestamptz
);
CREATE TABLE public.hbnf_cinematic_events (id int primary key);
INSERT INTO public.hbnf_matrix_control_state VALUES (1,false);
INSERT INTO public.hbnf_cinematic_events VALUES (1);
CREATE OR REPLACE FUNCTION public.hbnf_enforce_league_state_revision()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $fn$
BEGIN
 NEW.updated_at := greatest(pg_catalog.clock_timestamp(),
   coalesce(old.updated_at, '-infinity'::timestamptz) + interval '1 microsecond');
 RETURN NEW;
END; $fn$;
CREATE TRIGGER zzz_hbnf_enforce_league_state_revision BEFORE UPDATE
 ON public.league_state FOR EACH ROW EXECUTE FUNCTION public.hbnf_enforce_league_state_revision();
CREATE OR REPLACE FUNCTION public.hbnf_project_current_tags_into_league_state()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE v_bag jsonb; v_players jsonb; v_manual jsonb;
BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object('tag',e.tag_number,'name',e.player_name)
   order by e.tag_number,lower(e.player_name)),'[]'::jsonb),
 coalesce(jsonb_object_agg(e.player_name,e.tag_number),'{}'::jsonb)
 INTO v_players,v_manual FROM public.hbnf_current_tag_entries e;
 v_bag:=coalesce(new.state_json->'bagTags','{}'::jsonb);
 IF jsonb_typeof(v_bag)<>'object' THEN v_bag:='{}'::jsonb; END IF;
 new.state_json:=jsonb_set(new.state_json,'{bagTags,players}',v_players,true);
 new.state_json:=jsonb_set(new.state_json,'{bagTags,manual}',v_manual,true);
 RETURN NEW;
END; $fn$;
CREATE TRIGGER hbnf_project_current_tags_into_league_state
 BEFORE INSERT OR UPDATE OF state_json ON public.league_state
 FOR EACH ROW EXECUTE FUNCTION public.hbnf_project_current_tags_into_league_state();
CREATE OR REPLACE FUNCTION public.hbnf_matrix_vnext_capture_state_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
 IF new.id=1 AND new.state_json IS DISTINCT FROM old.state_json THEN
   INSERT INTO public.hbnf_matrix_vnext_live_queue
     (id,state_updated_at,queued_at,due_at,status,fingerprint,last_error,updated_at)
   VALUES (1,new.updated_at,now(),now()+interval '20 seconds',
           'pending',md5(new.state_json::text),null,now())
   ON CONFLICT(id) DO UPDATE SET state_updated_at=excluded.state_updated_at,
    queued_at=excluded.queued_at,due_at=excluded.due_at,status='pending',
    fingerprint=excluded.fingerprint,last_error=null,updated_at=now();
 END IF;
 RETURN NEW;
END; $fn$;
CREATE TRIGGER hbnf_matrix_vnext_capture_after_state_change
 AFTER UPDATE OF state_json ON public.league_state FOR EACH ROW
 WHEN ((new.id=1)) EXECUTE FUNCTION public.hbnf_matrix_vnext_capture_state_change();
CREATE OR REPLACE FUNCTION public.hbnf_save_league_state_v1(
 p_expected_updated_at timestamptz, p_state_json jsonb)
 RETURNS SETOF public.league_state LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO '' SET statement_timeout TO '8s' AS $fn$
DECLARE v_current_updated_at timestamptz;
BEGIN
 IF p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'expected_revision_required'; END IF;
 IF p_state_json IS NULL OR pg_catalog.jsonb_typeof(p_state_json) IS DISTINCT FROM 'object'
 THEN RAISE EXCEPTION 'state_json_must_be_object'; END IF;
 SELECT state.updated_at INTO v_current_updated_at
 FROM public.league_state AS state WHERE state.id=1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'league_state_row_missing'; END IF;
 IF v_current_updated_at IS DISTINCT FROM p_expected_updated_at THEN RETURN; END IF;
 RETURN QUERY UPDATE public.league_state AS state SET state_json=p_state_json
 WHERE state.id=1 AND state.updated_at=p_expected_updated_at RETURNING state.*;
END; $fn$;
