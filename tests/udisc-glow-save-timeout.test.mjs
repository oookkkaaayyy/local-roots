import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const casMigration = new URL('../supabase/migrations/20261030021038_hbnf_league_state_anon_cas_rpc.sql', import.meta.url);
const revisionMigration = new URL('../supabase/migrations/20261029203741_hbnf_league_state_server_revision_guard.sql', import.meta.url);
const timeoutMigration = new URL('../supabase/migrations/20261031093828_hbnf_glow_anon_cas_statement_timeout_8s.sql', import.meta.url);

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    alter role anon set statement_timeout = '3s';
    create table public.league_state(id integer primary key, state_json jsonb not null, updated_at timestamptz not null);
    create table public.hbnf_current_tag_entries(tag_number integer, player_name text);
    create table public.hbnf_matrix_vnext_live_queue(id integer primary key, state_updated_at timestamptz, queued_at timestamptz, due_at timestamptz, status text, fingerprint text, last_error text, updated_at timestamptz);
    create table public.hbnf_matrix_sync_control(id integer primary key, auto_live boolean not null);
    insert into public.hbnf_matrix_sync_control values (1,false);
    insert into public.hbnf_current_tag_entries values
      (1,'Test Player 1'),(2,'Test Player 2'),(3,'Test Player 3'),(4,'Test Player 4'),
      (5,'Test Player 5'),(6,'Test Player 6'),(7,'Test Player 7'),(8,'Test Player 8'),(9,'Test Player 9');

    create function public.hbnf_project_current_tags_into_league_state() returns trigger language plpgsql as $$
    declare v_players jsonb; v_manual jsonb; v_bag jsonb;
    begin
      select coalesce(jsonb_agg(jsonb_build_object('tag',e.tag_number,'name',e.player_name) order by e.tag_number,lower(e.player_name)),'[]'::jsonb),
             coalesce(jsonb_object_agg(e.player_name,e.tag_number),'{}'::jsonb)
        into v_players,v_manual from public.hbnf_current_tag_entries e;
      v_bag := coalesce(new.state_json->'bagTags','{}'::jsonb);
      if jsonb_typeof(v_bag)<>'object' then v_bag := '{}'::jsonb; end if;
      new.state_json := jsonb_set(new.state_json,'{bagTags,players}',v_players,true);
      new.state_json := jsonb_set(new.state_json,'{bagTags,manual}',v_manual,true);
      return new;
    end $$;
    create trigger hbnf_project_current_tags_into_league_state before insert or update of state_json on public.league_state
      for each row execute function public.hbnf_project_current_tags_into_league_state();

    create function public.hbnf_enforce_league_state_revision() returns trigger language plpgsql as $$
    begin
      new.updated_at := greatest(clock_timestamp(),coalesce(old.updated_at,'-infinity'::timestamptz)+interval '1 microsecond');
      return new;
    end $$;
    create trigger zzz_hbnf_enforce_league_state_revision before update on public.league_state
      for each row execute function public.hbnf_enforce_league_state_revision();

    create function public.hbnf_matrix_vnext_capture_state_change() returns trigger language plpgsql as $$
    begin
      if old.state_json is distinct from new.state_json then
        insert into public.hbnf_matrix_vnext_live_queue(id,state_updated_at,queued_at,due_at,status,fingerprint,last_error,updated_at)
        values(1,new.updated_at,now(),now()+interval '20 seconds','pending',md5(new.state_json::text),null,now())
        on conflict(id) do update set state_updated_at=excluded.state_updated_at,queued_at=excluded.queued_at,
          due_at=excluded.due_at,status='pending',fingerprint=excluded.fingerprint,last_error=null,updated_at=now();
      end if;
      return new;
    end $$;
    create trigger hbnf_matrix_vnext_capture_after_state_change after update of state_json on public.league_state
      for each row execute function public.hbnf_matrix_vnext_capture_state_change();

    create function public.hbnf_matrix_sync() returns trigger language plpgsql as $$
    begin
      if not coalesce((select auto_live from public.hbnf_matrix_sync_control where id=1),false) then return new; end if;
      return new;
    end $$;
    create trigger trg_hbnf_matrix_sync after insert or update of state_json on public.league_state
      for each row execute function public.hbnf_matrix_sync();
  `);

  // Approximately the real 2.55 MB row size, without copying real player data.
  const root = {
    glow:{activeWeek:'2026-11-03',weeks:{'2026-11-03':{date:'2026-11-03',scoresLocked:false,cards:[],players:[{id:'T1',partner1:'Test Player 1',partner2:'Test Player 2',scores:Array(18).fill('')}] }},playerAliases:{}},
    skins:{activeWeek:'2026-10-28',weeks:{'2026-10-28':{frontCards:[],backCards:[],scores:[7]}}},
    bagTags:{rounds:['historical-preserved']},
    representativePadding:'x'.repeat(2_540_000),
  };
  await db.query('insert into public.league_state values(1,$1::jsonb,$2::timestamptz)',[JSON.stringify(root),'2026-10-31T00:00:00Z']);
  await db.exec(await readFile(casMigration,'utf8'));
  await db.exec(await readFile(revisionMigration,'utf8'));
  await db.exec(await readFile(timeoutMigration,'utf8'));
  await db.exec(`
    grant select on public.league_state to anon, authenticated;
    grant update on public.league_state to anon, authenticated;
    grant select on public.hbnf_current_tag_entries to anon, authenticated;
    grant select,insert,update on public.hbnf_matrix_vnext_live_queue to anon, authenticated;
    grant select on public.hbnf_matrix_sync_control to anon, authenticated;
  `);
  return {db,root};
}

test('Glow CAS has an 8s function-local limit; anonymous role remains at 3s; repeated full-size saves preserve tag and Matrix effects',async()=>{
  const {db,root}=await fixture();
  try {
    const config=await db.query(`select p.proconfig, r.rolconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join pg_roles r where n.nspname='public' and p.proname='hbnf_save_league_state_v1' and r.rolname='anon'`);
    assert.ok(config.rows[0].proconfig.includes('statement_timeout=8s'));
    assert.ok(config.rows[0].rolconfig.includes('statement_timeout=3s'));

    const revisions=[];
    for(let i=0;i<4;i++){
      const before=(await db.query('select updated_at::text as rev,state_json from public.league_state where id=1')).rows[0];
      const next=structuredClone(before.state_json);
      next.glow.weeks['2026-11-03'].players[0].scores[i]=String(i+3);
      const saved=await db.query('select * from public.hbnf_save_league_state_v1($1::timestamptz,$2::jsonb)',[before.rev,JSON.stringify(next)]);
      assert.equal(saved.rows.length,1,`save ${i+1} should return an acknowledged row`);
      const readback=(await db.query('select updated_at::text as rev,state_json from public.league_state where id=1')).rows[0];
      assert.notEqual(readback.rev,before.rev);
      assert.equal(readback.state_json.glow.weeks['2026-11-03'].players[0].scores[i],String(i+3));
      assert.deepEqual(readback.state_json.skins,root.skins);
      assert.deepEqual(readback.state_json.bagTags.rounds,root.bagTags.rounds);
      assert.equal(readback.state_json.bagTags.players.length,9);
      const queue=(await db.query('select state_updated_at::text as rev,fingerprint from public.hbnf_matrix_vnext_live_queue where id=1')).rows[0];
      assert.equal(queue.rev,readback.rev);
      assert.equal(queue.fingerprint,(await db.query("select md5(state_json::text) as fingerprint from public.league_state where id=1")).rows[0].fingerprint);
      revisions.push(readback.rev);
    }
    assert.equal(new Set(revisions).size,4,'every acknowledged write advances the server revision');

    const stale=await db.query('select * from public.hbnf_save_league_state_v1($1::timestamptz,$2::jsonb)',[revisions[0],JSON.stringify({...root,glow:{activeWeek:'stale'}})]);
    assert.equal(stale.rows.length,0,'stale concurrent edit is rejected');

    // Existing no-login Skins page uses direct table UPDATE; retain that access and triggers.
    const glowBeforeSkins=structuredClone((await db.query('select state_json from public.league_state where id=1')).rows[0].state_json.glow);
    await db.exec('set role anon');
    const skinsBefore=(await db.query('select updated_at::text as rev,state_json from public.league_state where id=1')).rows[0];
    const skinsRoot=structuredClone(skinsBefore.state_json);
    skinsRoot.skins.weeks['2026-10-28'].scores[0]=8;
    const legacy=await db.query('update public.league_state set state_json=$1::jsonb,updated_at=clock_timestamp() where id=1 and updated_at=$2::timestamptz returning updated_at::text as rev',[JSON.stringify(skinsRoot),skinsBefore.rev]);
    assert.equal(legacy.rows.length,1,'anonymous legacy Skins direct write remains functional');
    await db.exec('reset role');
    const after=(await db.query('select state_json from public.league_state where id=1')).rows[0].state_json;
    assert.equal(after.skins.weeks['2026-10-28'].scores[0],8);
    assert.deepEqual(after.glow,glowBeforeSkins);
  } finally { await db.close(); }
});
