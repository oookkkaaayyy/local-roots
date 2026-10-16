-- Bind the existing single relay to the exact currently installed incremental-controls release.
-- The Matrix reports its embedded release ID, not its binary SHA; the SHA remains cross-checked
-- against the authoritative install receipt/control state before any separate release action.
-- One-time, revision-checked canonical bootstrap from a fresh validated device
-- snapshot. It can only run while the actuator fence is inactive and never
-- issues a hardware command. Legacy state fields and unobservable mic settings
-- are preserved; only values proven by Matrix/AUX readback are reconciled.
create or replace function public.hbnf_cart_matrix_relay_bootstrap(
 p_relay_id text,p_cart_id text,p_expected_revision bigint,p_expected_fence_epoch bigint,
 p_expected_release_id text,p_candidate text,p_observed_state jsonb
) returns jsonb language plpgsql security definer set search_path to 'pg_catalog','hbnf_internal'
as $$
declare d hbnf_internal.cart_desired_state%rowtype;ve bigint;vl text;va boolean;
 scene_id text;selected_vibe text;vibe_mode text;palette_id text;next_state jsonb;new_revision bigint;
 matrix_enabled boolean;aux_enabled boolean;matrix_brightness integer;matrix_aux_target integer;aux_brightness integer;
 motion_value integer;audio_value integer;palette_mode text;palette_rgb jsonb;palette_index integer;
begin
 if p_relay_id is distinct from 'opal-hbnf-cart' or p_cart_id is distinct from 'hbnf-cart' or
    p_candidate is distinct from 'hbnf-cart2-phase2-r6-skins-readable-20261014' or
    p_expected_revision is null or p_expected_fence_epoch is null or p_expected_release_id is null or
    jsonb_typeof(p_observed_state)<>'object' or
    p_observed_state->>'matrixMac' is distinct from '70:4b:ca:5b:34:5c' or
    p_observed_state->>'candidate' is distinct from p_candidate or p_observed_state#>>'{hbnf,candidate}' is distinct from p_candidate or
    p_observed_state->>'on' is null or p_observed_state->>'on' not in ('true','false') or
    p_observed_state->>'bri' is distinct from '255' or
    p_observed_state#>>'{hbnf,overlayId}' is not null or
    p_observed_state#>>'{aux,mac}' is distinct from '8c:94:df:55:c3:4c' or p_observed_state#>>'{aux,ip}' is distinct from '192.168.77.11' or
    p_observed_state#>>'{aux,live}' is distinct from 'true' or p_observed_state#>>'{aux,lm}' is distinct from 'DDP' or
    p_observed_state#>>'{aux,lip}' is distinct from '192.168.77.10' or p_observed_state#>>'{aux,lor}' is distinct from '0' or
    p_observed_state#>>'{aux,forceMaxBrightness}' is distinct from 'false' or p_observed_state#>>'{aux,on}' is null or p_observed_state#>>'{aux,on}' not in ('true','false') or
    p_observed_state#>>'{segments,0,id}' is distinct from '0' or p_observed_state#>>'{segments,1,id}' is distinct from '1' or
    p_observed_state#>>'{segments,1,start}' is distinct from '512' or p_observed_state#>>'{segments,1,stop}' is distinct from '534' or
    p_observed_state#>>'{segments,0,fx}' is distinct from '142' or p_observed_state#>>'{segments,1,fx}' is distinct from '142' or
    p_observed_state#>>'{segments,0,bri}' is distinct from '255' or p_observed_state#>>'{segments,1,bri}' is distinct from '255' or
    p_observed_state#>>'{segments,0,on}' is distinct from p_observed_state->>'on' or
    p_observed_state#>>'{segments,1,on}' is distinct from p_observed_state->>'on' then
   raise exception 'bootstrap_readback_identity_or_shape_invalid'; end if;
 if jsonb_typeof(p_observed_state#>'{segments}') is distinct from 'array' then raise exception 'bootstrap_segments_invalid'; end if;
 if jsonb_array_length(p_observed_state#>'{segments}')<>2 then raise exception 'bootstrap_segments_invalid'; end if;
 if p_observed_state#>>'{hbnf,scene}' is null or p_observed_state#>>'{hbnf,scene}' not in ('0','1','2','3') or
    p_observed_state#>>'{hbnf,vibe}' is null or p_observed_state#>>'{hbnf,vibe}' not in ('0','1','2','3','4','5') or
    p_observed_state#>>'{hbnf,motion}' is null or p_observed_state#>>'{hbnf,motion}' !~ '^(0|[1-9][0-9]?)$' or
    p_observed_state#>>'{hbnf,audioResponse}' is null or p_observed_state#>>'{hbnf,audioResponse}' !~ '^(0|[1-9][0-9]?)$' or
    p_observed_state#>>'{hbnf,matrixBrightness}' is null or p_observed_state#>>'{hbnf,matrixBrightness}' !~ '^(0|[1-9][0-9]{0,2})$' or
    p_observed_state#>>'{hbnf,auxBrightness}' is null or p_observed_state#>>'{hbnf,auxBrightness}' !~ '^(0|[1-9][0-9]{0,2})$' or
    p_observed_state#>>'{aux,bri}' is null or p_observed_state#>>'{aux,bri}' !~ '^(0|[1-9][0-9]{0,2})$' then
   raise exception 'bootstrap_readback_value_invalid'; end if;
 if (p_observed_state#>>'{hbnf,motion}')::int>100 or (p_observed_state#>>'{hbnf,audioResponse}')::int>100 or
    (p_observed_state#>>'{hbnf,matrixBrightness}')::int>255 or (p_observed_state#>>'{hbnf,auxBrightness}')::int>255 or (p_observed_state#>>'{aux,bri}')::int>255 then
   raise exception 'bootstrap_readback_value_out_of_range_or_inconsistent'; end if;
 select * into d from hbnf_internal.cart_desired_state where cart_id=p_cart_id for update;
 if not found then raise exception 'bootstrap_state_missing'; end if;
 select f.epoch,f.release_id,f.active into ve,vl,va from hbnf_internal.cart_actuator_fence f where f.cart_id=p_cart_id for update;
 if not found or coalesce(va,true) or d.revision is distinct from p_expected_revision or ve is distinct from p_expected_fence_epoch or vl is distinct from p_expected_release_id then
   raise exception 'bootstrap_revision_fence_or_release_stale'; end if;
 if d.state->>'selectedVibe' is not null then raise exception 'bootstrap_already_initialized'; end if;
 if d.state ? 'overlays' and jsonb_typeof(d.state->'overlays') not in ('array','null') then raise exception 'bootstrap_overlay_state_invalid'; end if;
 if exists(select 1 from jsonb_array_elements(coalesce(nullif(d.state->'overlays','null'::jsonb),'[]'::jsonb)) o
           where nullif(o->>'expiresAt','') is not null and (o->>'expiresAt')::timestamptz>clock_timestamp()) then
   raise exception 'active_overlay_prevents_bootstrap'; end if;
 scene_id:=case p_observed_state#>>'{hbnf,scene}' when '0' then 'course-flow' when '1' then 'field-mix' when '2' then 'hbnf-signature' when '3' then 'quiet-cosmos' end;
 selected_vibe:=case p_observed_state#>>'{hbnf,vibe}' when '0' then 'chill' when '1' then 'groove' when '2' then 'heavy' when '3' then 'psychedelic' when '4' then 'cosmic' when '5' then 'auto' end;
 vibe_mode:=case when selected_vibe='auto' then 'music' else 'manual' end;
 palette_mode:=p_observed_state#>>'{hbnf,palette,mode}'; palette_rgb:=p_observed_state#>'{hbnf,palette,rgb}';
 if palette_mode='legacy' then palette_id:='legacy';
 elsif palette_mode='wled' then
   if p_observed_state#>>'{hbnf,palette,index}' is null or p_observed_state#>>'{hbnf,palette,index}' !~ '^(0|[1-9][0-9]{0,2})$' then raise exception 'bootstrap_palette_invalid'; end if;
   palette_index:=(p_observed_state#>>'{hbnf,palette,index}')::int;
   if palette_index>255 then raise exception 'bootstrap_palette_invalid'; end if;
   palette_id:='wled-'||palette_index::text;
 elsif palette_mode='solid' then
   if jsonb_typeof(palette_rgb) is distinct from 'array' then raise exception 'bootstrap_palette_invalid'; end if;
   if jsonb_array_length(palette_rgb)<>3 then raise exception 'bootstrap_palette_invalid'; end if;
   if exists(select 1 from jsonb_array_elements_text(palette_rgb) v where v !~ '^(0|[1-9][0-9]{0,2})$') then raise exception 'bootstrap_palette_invalid'; end if;
   if exists(select 1 from jsonb_array_elements_text(palette_rgb) v where v::int>255) then raise exception 'bootstrap_palette_invalid'; end if;
   palette_id:='solid-'||upper(lpad(to_hex((palette_rgb->>0)::int),2,'0')||lpad(to_hex((palette_rgb->>1)::int),2,'0')||lpad(to_hex((palette_rgb->>2)::int),2,'0'));
 else raise exception 'bootstrap_palette_invalid'; end if;
 matrix_enabled:=coalesce((p_observed_state->>'on')::boolean,false); aux_enabled:=(p_observed_state#>>'{aux,on}')::boolean;
 matrix_brightness:=(p_observed_state#>>'{hbnf,matrixBrightness}')::int; matrix_aux_target:=(p_observed_state#>>'{hbnf,auxBrightness}')::int; aux_brightness:=(p_observed_state#>>'{aux,bri}')::int;
 motion_value:=(p_observed_state#>>'{hbnf,motion}')::int; audio_value:=(p_observed_state#>>'{hbnf,audioResponse}')::int;
 next_state:=d.state || jsonb_build_object('power',case when matrix_enabled then 'on' else 'off' end,
  'selectedVibe',selected_vibe,'vibeMode',vibe_mode,'sceneId',scene_id,'paletteId',palette_id,
  'devices',coalesce(d.state->'devices','{}'::jsonb)||jsonb_build_object(
   'matrix',coalesce(d.state#>'{devices,matrix}','{}'::jsonb)||jsonb_build_object('enabled',matrix_enabled,'brightness',matrix_brightness,'auxTargetBrightness',matrix_aux_target),
   'aux',coalesce(d.state#>'{devices,aux}','{}'::jsonb)||jsonb_build_object('enabled',aux_enabled,'brightness',aux_brightness)),
  'tuning',coalesce(d.state->'tuning','{}'::jsonb)||jsonb_build_object('motion',motion_value,'audioResponse',audio_value));
 update hbnf_internal.cart_desired_state set revision=revision+1,state=next_state
 where cart_id=p_cart_id and revision=p_expected_revision returning revision into new_revision;
 if not found then raise exception 'bootstrap_revision_changed'; end if;
 return jsonb_build_object('revision',new_revision,'state',next_state,'deviceCommandsIssued',false);
end; $$;

create or replace function public.hbnf_cart_matrix_relay_issue(
 p_relay_id text,p_cart_id text,p_desired_revision bigint,p_fence_epoch bigint,p_release_id text,
 p_matrix_mac text,p_candidate text,p_expected_state jsonb,p_wled_payload jsonb,p_ttl_seconds integer
) returns uuid language plpgsql security definer set search_path to 'pg_catalog','hbnf_internal'
as $$
declare vr bigint;ve bigint;vl text;va boolean;cid uuid;
begin
 if p_relay_id is distinct from 'opal-hbnf-cart' or p_cart_id is distinct from 'hbnf-cart' or p_matrix_mac is distinct from '70:4b:ca:5b:34:5c' or
    p_candidate is distinct from 'hbnf-cart2-phase2-r6-skins-readable-20261014' or p_desired_revision is null or p_fence_epoch is null or p_release_id is null or
    p_ttl_seconds is null or p_ttl_seconds<5 or p_ttl_seconds>20 or
    jsonb_typeof(p_expected_state) is distinct from 'object' or jsonb_typeof(p_wled_payload) is distinct from 'object' or
    jsonb_typeof(p_wled_payload->'matrix') is distinct from 'object' or jsonb_typeof(p_wled_payload->'aux') is distinct from 'object' or
    p_expected_state->>'matrixMac' is distinct from p_matrix_mac or p_expected_state->>'candidate' is distinct from p_candidate or
    p_expected_state#>>'{hbnf,candidate}' is distinct from p_candidate or
    p_expected_state#>>'{aux,mac}' is distinct from '8c:94:df:55:c3:4c' or p_expected_state#>>'{aux,ip}' is distinct from '192.168.77.11' or
    p_expected_state#>>'{aux,lm}' is distinct from 'DDP' or p_expected_state#>>'{aux,lip}' is distinct from '192.168.77.10' or
    p_expected_state#>>'{aux,live}' is distinct from 'true' or p_expected_state#>>'{aux,lor}' is distinct from '0' or
    p_expected_state#>>'{aux,forceMaxBrightness}' is distinct from 'false' or
    p_expected_state#>>'{aux,on}' is null or p_expected_state#>>'{aux,on}' not in ('true','false') or
    p_wled_payload#>>'{aux,on}' is distinct from p_expected_state#>>'{aux,on}' or
    p_expected_state#>>'{aux,bri}' is null or p_wled_payload#>>'{aux,bri}' is distinct from p_expected_state#>>'{aux,bri}' or
    p_expected_state#>>'{hbnf,auxBrightness}' is null or p_expected_state#>>'{hbnf,auxBrightness}' !~ '^(0|[1-9][0-9]{0,2})$' or
    (p_expected_state#>>'{hbnf,auxBrightness}')::int>255 or
    p_wled_payload#>>'{matrix,HBNF,auxBrightness}' is distinct from p_expected_state#>>'{hbnf,auxBrightness}' then
   raise exception 'invalid_relay_challenge'; end if;
 select d.revision,f.epoch,f.release_id,f.active into vr,ve,vl,va
 from hbnf_internal.cart_desired_state d join hbnf_internal.cart_actuator_fence f using(cart_id)
 where d.cart_id=p_cart_id for update of d,f;
 if not found or not va or vr is distinct from p_desired_revision or ve is distinct from p_fence_epoch or vl is distinct from p_release_id then raise exception 'stale_fence_or_state'; end if;
 delete from hbnf_internal.cart_matrix_relay_challenges where relay_id=p_relay_id and (expires_at<clock_timestamp() or consumed_at is not null);
 insert into hbnf_internal.cart_matrix_relay_challenges(relay_id,cart_id,desired_revision,fence_epoch,release_id,matrix_mac,candidate,expected_state,wled_payload,expires_at)
 values(p_relay_id,p_cart_id,p_desired_revision,p_fence_epoch,p_release_id,p_matrix_mac,p_candidate,p_expected_state,p_wled_payload,clock_timestamp()+make_interval(secs=>p_ttl_seconds))
 returning challenge_id into cid;
 return cid;
end; $$;


create or replace function public.hbnf_cart_matrix_relay_confirm(p_challenge_id uuid,p_relay_id text,p_verified_state jsonb,p_reported jsonb)
returns boolean language plpgsql security definer set search_path to 'pg_catalog','hbnf_internal'
as $$
declare c hbnf_internal.cart_matrix_relay_challenges%rowtype;vr bigint;ve bigint;vl text;va boolean;ison boolean;
begin
 select * into c from hbnf_internal.cart_matrix_relay_challenges where challenge_id=p_challenge_id and relay_id=p_relay_id for update;
 if not found or c.consumed_at is not null or c.expires_at<=clock_timestamp() then return false; end if;
 select d.revision,f.epoch,f.release_id,f.active into vr,ve,vl,va from hbnf_internal.cart_desired_state d
 join hbnf_internal.cart_actuator_fence f using(cart_id) where d.cart_id=c.cart_id for update of d,f;
 if not found or not va or vr is distinct from c.desired_revision or ve is distinct from c.fence_epoch or vl is distinct from c.release_id or
 c.matrix_mac is distinct from '70:4b:ca:5b:34:5c' or c.candidate is distinct from 'hbnf-cart2-phase2-r6-skins-readable-20261014' or
 p_verified_state is distinct from c.expected_state or p_verified_state->>'matrixMac' is distinct from c.matrix_mac or
 p_verified_state->>'candidate' is distinct from c.candidate or
 p_verified_state#>>'{aux,mac}' is distinct from '8c:94:df:55:c3:4c' or p_verified_state#>>'{aux,ip}' is distinct from '192.168.77.11' or
 p_verified_state#>>'{aux,lm}' is distinct from 'DDP' or p_verified_state#>>'{aux,lip}' is distinct from '192.168.77.10' or
 p_verified_state#>>'{aux,live}' is distinct from 'true' or p_verified_state#>>'{aux,lor}' is distinct from '0' or
 p_verified_state#>>'{aux,forceMaxBrightness}' is distinct from 'false' or
 p_verified_state#>>'{aux,on}' is null or p_verified_state#>>'{aux,on}' not in ('true','false') or
 p_verified_state#>>'{aux,bri}' is null or p_verified_state#>>'{hbnf,auxBrightness}' is null or
 p_verified_state#>>'{hbnf,auxBrightness}' !~ '^(0|[1-9][0-9]{0,2})$' or
 (p_verified_state#>>'{hbnf,auxBrightness}')::int>255 then return false; end if;
 ison:=coalesce((p_verified_state->>'on')::boolean,false);
 update hbnf_internal.cart_matrix_relay_challenges set consumed_at=clock_timestamp() where challenge_id=c.challenge_id;
 perform public.hbnf_cart_upsert_observed(c.cart_id,'matrix',true,case when ison then 'online' else 'off' end,
 c.desired_revision,c.fence_epoch,c.release_id,left(c.matrix_mac||':'||c.candidate||':'||coalesce(p_reported->>'deviceUptimeSec','unknown'),120),
 coalesce(p_reported,'{}'::jsonb)||jsonb_build_object('confirmed',true,'stateReadbackConfirmed',true,
 'commandsApplied',c.apply_authorized_at is not null,'desiredRevision',c.desired_revision,'fenceEpoch',c.fence_epoch,
 'releaseId',c.release_id,'challengeId',c.challenge_id,'observedAt',clock_timestamp()),clock_timestamp());
 perform public.hbnf_cart_upsert_observed(c.cart_id,'aux',true,case when p_verified_state#>>'{aux,on}'='true' then 'ddp_receiver_confirmed' else 'off' end,
 c.desired_revision,c.fence_epoch,c.release_id,left('8c:94:df:55:c3:4c:DDP:192.168.77.10',120),
 jsonb_build_object('confirmed',true,'stateReadbackConfirmed',true,'ddpReceiverConfirmed',true,
 'physicalOutputConfirmed',false,'on',p_verified_state#>>'{aux,on}','brightness',p_verified_state#>>'{aux,bri}','commandsApplied',c.apply_authorized_at is not null,
 'desiredRevision',c.desired_revision,'fenceEpoch',c.fence_epoch,'releaseId',c.release_id,'challengeId',c.challenge_id,
 'observedAt',clock_timestamp()),clock_timestamp());
 return true;
end; $$;

revoke all on function public.hbnf_cart_matrix_relay_bootstrap(text,text,bigint,bigint,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.hbnf_cart_matrix_relay_bootstrap(text,text,bigint,bigint,text,text,jsonb) to service_role;

