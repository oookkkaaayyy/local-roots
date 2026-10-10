-- Private, short-lived, one-use challenges bind fresh WLED readback to the canonical Cart revision/fence.
create table if not exists hbnf_internal.cart_matrix_relay_challenges(
 challenge_id uuid primary key default gen_random_uuid(), relay_id text not null, cart_id text not null,
 desired_revision bigint not null, fence_epoch bigint not null, release_id text not null,
 matrix_mac text not null, candidate text not null, expected_state jsonb not null, wled_payload jsonb not null,
 issued_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null,
 apply_authorized_at timestamptz, consumed_at timestamptz
);
create index if not exists cart_matrix_relay_challenges_expiry_idx on hbnf_internal.cart_matrix_relay_challenges(expires_at);
revoke all on hbnf_internal.cart_matrix_relay_challenges from public,anon,authenticated;

create or replace function public.hbnf_cart_matrix_relay_issue(
 p_relay_id text,p_cart_id text,p_desired_revision bigint,p_fence_epoch bigint,p_release_id text,
 p_matrix_mac text,p_candidate text,p_expected_state jsonb,p_wled_payload jsonb,p_ttl_seconds integer
) returns uuid language plpgsql security definer set search_path to 'pg_catalog','hbnf_internal'
as $$
declare vr bigint;ve bigint;vl text;va boolean;cid uuid;
begin
 if p_relay_id<>'opal-hbnf-cart' or p_cart_id<>'hbnf-cart' or p_matrix_mac<>'70:4b:ca:5b:34:5c' or
    p_candidate<>'hbnf-cart2-phase2-offline-wow-r6-audio-cache-20261010' or p_ttl_seconds<5 or p_ttl_seconds>20 or
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
end; $$;

create or replace function public.hbnf_cart_matrix_relay_get(p_challenge_id uuid,p_relay_id text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','hbnf_internal'
as $$
declare c hbnf_internal.cart_matrix_relay_challenges%rowtype;vr bigint;ve bigint;vl text;va boolean;
begin
 select * into c from hbnf_internal.cart_matrix_relay_challenges where challenge_id=p_challenge_id and relay_id=p_relay_id;
 if not found or c.expires_at<=clock_timestamp() or c.consumed_at is not null then return null; end if;
 select d.revision,f.epoch,f.release_id,f.active into vr,ve,vl,va from hbnf_internal.cart_desired_state d
 join hbnf_internal.cart_actuator_fence f using(cart_id) where d.cart_id=c.cart_id;
 if not found or not va or vr<>c.desired_revision or ve<>c.fence_epoch or vl<>c.release_id then return null; end if;
 return jsonb_build_object('challenge_id',c.challenge_id,'desired_revision',c.desired_revision,'fence_epoch',c.fence_epoch,
 'release_id',c.release_id,'matrix_mac',c.matrix_mac,'candidate',c.candidate,'expected_state',c.expected_state,
 'wled_payload',c.wled_payload,'expires_at',c.expires_at,'apply_authorized_at',c.apply_authorized_at,'consumed_at',c.consumed_at);
end; $$;

create or replace function public.hbnf_cart_matrix_relay_authorize_apply(p_challenge_id uuid,p_relay_id text)
returns boolean language plpgsql security definer set search_path to 'pg_catalog','hbnf_internal'
as $$
declare n int;
begin
 update hbnf_internal.cart_matrix_relay_challenges c set apply_authorized_at=clock_timestamp()
 where c.challenge_id=p_challenge_id and c.relay_id=p_relay_id and c.expires_at>clock_timestamp()
 and c.consumed_at is null and c.apply_authorized_at is null and exists(
  select 1 from hbnf_internal.cart_desired_state d join hbnf_internal.cart_actuator_fence f using(cart_id)
  where d.cart_id=c.cart_id and d.revision=c.desired_revision and f.epoch=c.fence_epoch and f.release_id=c.release_id and f.active);
 get diagnostics n=row_count; return n=1;
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
 if not found or not va or vr<>c.desired_revision or ve<>c.fence_epoch or vl<>c.release_id or
 c.matrix_mac<>'70:4b:ca:5b:34:5c' or c.candidate<>'hbnf-cart2-phase2-offline-wow-r6-audio-cache-20261010' or
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
end; $$;

revoke all on function public.hbnf_cart_matrix_relay_issue(text,text,bigint,bigint,text,text,text,jsonb,jsonb,integer) from public,anon,authenticated;
revoke all on function public.hbnf_cart_matrix_relay_get(uuid,text) from public,anon,authenticated;
revoke all on function public.hbnf_cart_matrix_relay_authorize_apply(uuid,text) from public,anon,authenticated;
revoke all on function public.hbnf_cart_matrix_relay_confirm(uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.hbnf_cart_matrix_relay_issue(text,text,bigint,bigint,text,text,text,jsonb,jsonb,integer) to service_role;
grant execute on function public.hbnf_cart_matrix_relay_get(uuid,text) to service_role;
grant execute on function public.hbnf_cart_matrix_relay_authorize_apply(uuid,text) to service_role;
grant execute on function public.hbnf_cart_matrix_relay_confirm(uuid,text,jsonb,jsonb) to service_role;
