-- Exact compensating definition captured from the immediately preceding v27 migration source.
-- Restores the original ddp_receiver_confirmed status emission; apply only as a guarded rollback.
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

REVOKE ALL ON FUNCTION public.hbnf_cart_matrix_relay_confirm(uuid,text,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hbnf_cart_matrix_relay_confirm(uuid,text,jsonb,jsonb) TO service_role;
