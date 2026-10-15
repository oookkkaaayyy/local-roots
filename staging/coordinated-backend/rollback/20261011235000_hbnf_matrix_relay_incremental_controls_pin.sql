-- Compensating rollback for migration 20261011235000_hbnf_matrix_relay_incremental_controls_pin.sql.
-- Captured from the current production v25 database with pg_get_functiondef
-- before preparing the upgrade. Apply only as a new, explicitly approved
-- compensating migration; never include this file in normal forward migration discovery.
revoke all on function public.hbnf_cart_matrix_relay_bootstrap(text,text,bigint,bigint,text,text,jsonb) from public,anon,authenticated,service_role;
drop function if exists public.hbnf_cart_matrix_relay_bootstrap(text,text,bigint,bigint,text,text,jsonb);

create or replace function public.hbnf_cart_matrix_relay_issue(
 p_relay_id text,p_cart_id text,p_desired_revision bigint,p_fence_epoch bigint,p_release_id text,
 p_matrix_mac text,p_candidate text,p_expected_state jsonb,p_wled_payload jsonb,p_ttl_seconds integer
) returns uuid language plpgsql security definer set search_path to 'pg_catalog','hbnf_internal'
as $function$
declare vr bigint;ve bigint;vl text;va boolean;cid uuid;
begin
 if p_relay_id<>'opal-hbnf-cart' or p_cart_id<>'hbnf-cart' or p_matrix_mac<>'70:4b:ca:5b:34:5c' or
    p_candidate<>'hbnf-cart2-phase2-offline-wow-r6-integrated-20261009' or p_ttl_seconds<5 or p_ttl_seconds>20 or
    jsonb_typeof(p_expected_state)<>'object' or jsonb_typeof(p_wled_payload)<>'object' or
    p_expected_state->>'matrixMac'<>p_matrix_mac or p_expected_state->>'candidate'<>p_candidate or
    p_expected_state#>>'{hbnf,candidate}'<>p_candidate then raise exception 'invalid_relay_challenge'; end if;
 select d.revision,f.epoch,f.release_id,f.active into vr,ve,vl,va
 from hbnf_internal.cart_desired_state d join hbnf_internal.cart_actuator_fence f using(cart_id)
 where d.cart_id=p_cart_id for update of d,f;
 if not found or not va or vr<>p_desired_revision or ve<>p_fence_epoch or vl<>p_release_id then raise exception 'stale_fence_or_state'; end if;
 delete from hbnf_internal.cart_matrix_relay_challenges where relay_id=p_relay_id and (expires_at<clock_timestamp() or consumed_at is not null);
 insert into hbnf_internal.cart_matrix_relay_challenges(relay_id,cart_id,desired_revision,fence_epoch,release_id,matrix_mac,candidate,expected_state,wled_payload,expires_at)
 values(p_relay_id,p_cart_id,p_desired_revision,p_fence_epoch,p_release_id,p_matrix_mac,p_candidate,p_expected_state,p_wled_payload,clock_timestamp()+make_interval(secs=>p_ttl_seconds))
 returning challenge_id into cid;
 return cid;
end; $function$;

create or replace function public.hbnf_cart_matrix_relay_confirm(p_challenge_id uuid,p_relay_id text,p_verified_state jsonb,p_reported jsonb)
returns boolean language plpgsql security definer set search_path to 'pg_catalog','hbnf_internal'
as $function$
declare c hbnf_internal.cart_matrix_relay_challenges%rowtype;vr bigint;ve bigint;vl text;va boolean;ison boolean;
begin
 select * into c from hbnf_internal.cart_matrix_relay_challenges where challenge_id=p_challenge_id and relay_id=p_relay_id for update;
 if not found or c.consumed_at is not null or c.expires_at<=clock_timestamp() then return false; end if;
 select d.revision,f.epoch,f.release_id,f.active into vr,ve,vl,va from hbnf_internal.cart_desired_state d
 join hbnf_internal.cart_actuator_fence f using(cart_id) where d.cart_id=c.cart_id for update of d,f;
 if not found or not va or vr<>c.desired_revision or ve<>c.fence_epoch or vl<>c.release_id or
 c.matrix_mac<>'70:4b:ca:5b:34:5c' or c.candidate<>'hbnf-cart2-phase2-offline-wow-r6-integrated-20261009' or
 p_verified_state is distinct from c.expected_state or p_verified_state->>'matrixMac' is distinct from c.matrix_mac or
 p_verified_state->>'candidate' is distinct from c.candidate then return false; end if;
 ison:=coalesce((p_verified_state->>'on')::boolean,false);
 update hbnf_internal.cart_matrix_relay_challenges set consumed_at=clock_timestamp() where challenge_id=c.challenge_id;
 perform public.hbnf_cart_upsert_observed(c.cart_id,'matrix',true,case when ison then 'online' else 'off' end,
 c.desired_revision,c.fence_epoch,c.release_id,left(c.matrix_mac||':'||c.candidate||':'||coalesce(p_reported->>'deviceUptimeSec','unknown'),120),
 coalesce(p_reported,'{}'::jsonb)||jsonb_build_object('confirmed',true,'commandApplicationConfirmed',true,
 'desiredRevision',c.desired_revision,'fenceEpoch',c.fence_epoch,'releaseId',c.release_id,'challengeId',c.challenge_id,'observedAt',clock_timestamp()),
 clock_timestamp());
 return true;
end; $function$;

revoke all on function public.hbnf_cart_matrix_relay_issue(text,text,bigint,bigint,text,text,text,jsonb,jsonb,integer) from public,anon,authenticated;
grant execute on function public.hbnf_cart_matrix_relay_issue(text,text,bigint,bigint,text,text,text,jsonb,jsonb,integer) to service_role;
revoke all on function public.hbnf_cart_matrix_relay_confirm(uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.hbnf_cart_matrix_relay_confirm(uuid,text,jsonb,jsonb) to service_role;
