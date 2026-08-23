-- Source-controlled counterpart of live migration 20260823233959.
-- The SoCal DGC page states these facts are supplied by tournament directors and compiled by SoCal DGC volunteers.
-- This migration stores limited factual metadata only. It does not scrape linked Disc Golf Scene, PDGA, or UDisc pages.

insert into public.lr_sources(key,name,source_type,base_url,access_method,permission_basis,enabled,authoritative_fields,refresh_schedule,notes)
values(
  'socal_dgc_manual_calendar',
  'Southern California Disc Golf Club 2026 event calendar',
  'regional_calendar',
  'https://socaldiscgolfclub.com/upcoming-events/',
  'Manual factual verification only; automated crawling disabled pending explicit permission or an approved structured feed',
  'The calendar states that its event information is provided by tournament directors and compiled/updated by SoCal DGC volunteers. Local Roots stores only limited factual event metadata and links after manual verification; no article prose is copied and automation requires separate permission.',
  true,
  array['name','start_date','end_date','city','course_name','sanctioned','td_names','registration_url']::text[],
  null,
  'Regional factual schedule source. Disc Golf Scene / PDGA links shown by the source may be stored as outbound links but are not scraped by this integration.'
)
on conflict (key) do update set
  name=excluded.name,
  source_type=excluded.source_type,
  base_url=excluded.base_url,
  access_method=excluded.access_method,
  permission_basis=excluded.permission_basis,
  enabled=excluded.enabled,
  authoritative_fields=excluded.authoritative_fields,
  notes=excluded.notes,
  updated_at=now();

create temporary table lr_socal_2026_backfill_seed(
  slug text primary key,
  name text not null,
  start_date date not null,
  end_date date not null,
  county text not null,
  city text not null,
  course_name text,
  event_type text not null,
  format text,
  sanctioned boolean not null,
  tier text,
  td_names text[] not null
) on commit drop;

insert into lr_socal_2026_backfill_seed values
('48th-wintertime-open-ams-2026','48th Wintertime Open – Ams','2026-02-07','2026-02-08','Los Angeles','La Cañada Flintridge','Oak Grove (Hahamongna Park)','tournament','Amateur',true,'B',array['Mike Jewel','Steve Rico']),
('48th-wintertime-open-pros-2026','48th Wintertime Open – Pros','2026-02-13','2026-02-15','Los Angeles','La Cañada Flintridge','Oak Grove (Hahamongna Park)','tournament','Professional',true,'A',array['Steve Rico','Mike Jewel']),
('cowtown-throwdown-2026','Cowtown Throwdown','2026-03-07','2026-03-07','San Bernardino','Chino','Prado Regional Park','tournament',null,true,'C',array['Joshua Cheney','Nathan Weaver']),
('the-yucaipa-open-2026','The Yucaipa Open','2026-03-13','2026-03-15','San Bernardino','Yucaipa','Yucaipa Regional Park','tournament','Pro/Am',true,'B',array['George Loepke']),
('battle-at-brengle-2026','Battle at Brengle','2026-03-21','2026-03-22','San Diego','Escondido','Brengle Terrace','tournament','Pro/Am',true,'C',array['Randy Wylot','Brentt Genton']),
('ice-bowl-in-paradise-chavez-ridge-2026','Ice Bowl in Paradise at Chavez Ridge','2026-03-22','2026-03-22','Los Angeles','Los Angeles','Chavez Ridge','tournament','Pro/Am',true,'XC',array['Shawn Glassford']),
('6th-annual-bert-cotton-memorial-2026','6th Annual Bert Cotton Memorial','2026-04-04','2026-04-04','Riverside','La Quinta','Palm Royal Country Club','tournament',null,true,'C',array['Jon Berg']),
('el-dorado-open-2026','El Dorado Open','2026-04-11','2026-04-11','Los Angeles','Long Beach','El Dorado Park','tournament',null,true,'C',array['Eric Conmy']),
('jo-cahow-hummingbird-team-challenge-2026','Jo Cahow Hummingbird Team Challenge','2026-04-11','2026-04-11','Los Angeles','La Cañada Flintridge','Oak Grove (Hahamongna Park)','team','Women-only team',true,'XC',array['Stephanie Ma']),
('spring-fling-at-sylmar-2026','Spring Fling at Sylmar','2026-04-18','2026-04-18','Los Angeles','Sylmar','Veteran’s Park','tournament','Pro/Am',true,'C',array['Steve Rico']),
('daniel-boe-memorial-weekend-1-2026','Daniel Boe Memorial – Weekend 1','2026-04-17','2026-04-19','San Diego','Escondido','Kit Carson Park','tournament','Amateur',true,'A',array['Mark Verrochi']),
('daniel-boe-memorial-weekend-2-2026','Daniel Boe Memorial – Weekend 2','2026-04-24','2026-04-26','San Diego','Escondido','Kit Carson Park','tournament','Pro/Am',true,'A',array['Mark Verrochi']),
('sapwi-spring-classic-2026','Sapwi Spring Classic','2026-05-02','2026-05-02','Ventura','Thousand Oaks','Sapwi','tournament',null,true,'C',array['Seth Gregory']),
('rumble-at-the-rodeo-2026','Rumble at the Rodeo','2026-05-09','2026-05-09','San Bernardino','San Bernardino','Glen Helen','tournament',null,true,'C',array['Josh Cheney','Nate Weaver']),
('surf-city-open-2026','Surf City Open','2026-05-15','2026-05-17','Orange','Huntington Beach','Huntington Beach Central Park','tournament',null,true,'A',array['Jeff Spohr']),
('wge-the-nest-invitational-2026','WGE – The Nest Invitational','2026-05-16','2026-05-16','Los Angeles','La Cañada Flintridge','Oak Grove (Hahamongna Park)','tournament','Women-only Pro/Am',true,'C',array['Tita Ugalde']),
('wge-good-vibes-open-2026','WGE – Good Vibes Open','2026-05-23','2026-05-24','San Diego','Jamul','GoodVibes Ranch','tournament','Women-only Pro/Am',true,'C',array['Christina Viola']),
('mountain-meltdown-ams-2026','Mountain Meltdown (Ams except FA1)','2026-05-30','2026-05-30','San Bernardino','Wrightwood','Sky High','tournament','Ams except FA1',true,'C',array['Joshua Cheney']),
('mountain-meltdown-pros-fa1-2026','Mountain Meltdown (Pros and FA1)','2026-05-31','2026-05-31','San Bernardino','Wrightwood','Sky High','tournament','Pros and FA1',true,'C',array['Joshua Cheney']),
('pasadena-senior-games-2026','Pasadena Senior Games','2026-06-13','2026-06-13','Los Angeles','La Cañada Flintridge','Oak Grove (Hahamongna Park)','tournament',null,true,'C',array['Mark Horn']),
('challenge-at-reidy-creek-2026','The Challenge at Reidy Creek','2026-06-19','2026-06-21','San Diego','Escondido','Reidy Creek','tournament','Pro/Am',true,'A',array['Allen Risley']),
('conejo-disc-golf-pro-am-2026','Conejo Disc Golf Pro/Am','2026-07-05','2026-07-05','Ventura','Thousand Oaks','Rabbit Flats','tournament','Pro/Am',true,'C',array['Seth Gregory']),
('nadgt-exclusive-martha-mclean-2026','NADGT Exclusive @ Martha McLean','2026-07-11','2026-07-12','Riverside','Riverside','Martha McLean','tournament',null,true,'B',array['Cody Rios']),
('yucaipa-summer-slam-2026','Yucaipa Summer Slam','2026-07-18','2026-07-18','San Bernardino','Yucaipa','Yucaipa Regional Park','tournament','Pro/Am',true,'C',array['George Loepke']),
('devils-gate-open-2026','Devil’s Gate Open','2026-07-25','2026-07-25','Los Angeles','La Cañada Flintridge','Oak Grove (Hahamongna Park)','tournament',null,true,'C',array['Pat Niessen']),
('mast-park-disc-golf-championship-2026','Mast Park Disc Golf Championship','2026-08-08','2026-08-09','San Diego','Santee','Mast Park','tournament',null,true,'C',array['Brentt Genton','Sean Stinebaugh']);

insert into public.lr_events(slug,name,start_date,end_date,county,city,course_name,event_type,format,sanctioned,tier,status,registration_status,td_names,published,confidence,last_verified_at,internal_notes)
select s.slug,s.name,s.start_date,s.end_date,s.county,s.city,s.course_name,s.event_type,s.format,s.sanctioned,s.tier,'completed','closed',s.td_names,false,0.92,now(),
       '2026 historical backfill from TD-supplied SoCal DGC regional calendar; third-party registration/results pages were not scraped.'
from lr_socal_2026_backfill_seed s
where not exists(select 1 from public.lr_events e where e.slug=s.slug);

insert into public.lr_event_sources(event_id,source_id,external_id,source_url,source_role,is_sanction_basis,source_payload,first_seen_at,last_seen_at,last_fetched_at,confidence)
select e.id,src.id,'socal:2026:'||s.slug,'https://socaldiscgolfclub.com/upcoming-events/#lr-'||s.slug,'manual_verification',s.sanctioned,
       jsonb_build_object('name',s.name,'start_date',s.start_date,'end_date',s.end_date,'city',s.city,'course_name',s.course_name,'tier',s.tier,'td_names',s.td_names,'calendar_note','Tournament-director-supplied factual listing compiled by SoCal DGC volunteers'),
       now(),now(),now(),0.92
from lr_socal_2026_backfill_seed s
join public.lr_events e on e.slug=s.slug
join public.lr_sources src on src.key='socal_dgc_manual_calendar'
where not exists(select 1 from public.lr_event_sources es where es.event_id=e.id and es.source_id=src.id);

update public.lr_events e
set published=true,confidence=greatest(coalesce(e.confidence,0),0.92),last_verified_at=coalesce(e.last_verified_at,now()),updated_at=now()
where e.slug in (select slug from lr_socal_2026_backfill_seed)
  and exists(select 1 from public.lr_event_sources es where es.event_id=e.id);
