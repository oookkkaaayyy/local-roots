insert into public.lr_sources(key,name,source_type,base_url,access_method,permission_basis,enabled,authoritative_fields,refresh_schedule,notes)
values
(
 'ventura_disc_golf_club_direct',
 'Ventura Disc Golf Club direct source',
 'club',
 'https://www.casitaswater.org/disc-golf',
 'Pending direct organizer submission/feed or explicit permission; no automated retrieval enabled',
 'Official Lake Casitas page states that all disc-golf events there are managed by the Ventura Disc Golf Club and directs event questions to the club. This establishes organizer/source identity but not specific event dates.',
 false,
 array[]::text[],
 null,
 'Coverage target for Ventura County. Existing outreach draft requests a current organizer-controlled event source/feed. Do not populate dates from Disc Golf Scene or PDGA while this source remains pending.'
),
(
 'san_diego_aces_direct',
 'San Diego Aces direct source',
 'club',
 'https://sandiegoaces.com/',
 'Pending direct organizer submission/feed; official site is currently stale and must not be treated as a live schedule',
 'San Diego Aces official website provides club leadership/contact paths and explicitly asks for current event details, but its displayed Upcoming Events page is still a 2021 schedule. A direct current feed/submission is required before automation.',
 false,
 array[]::text[],
 null,
 'Coverage target for San Diego County. Existing outreach draft requests a current event source/feed. The stale official Upcoming Events page is not suitable for production scheduling.'
),
(
 'conejo_disc_golf_club_direct',
 'Conejo Disc Golf Club direct source',
 'club',
 'https://www.crpd.org/agreements',
 'Pending direct organizer submission/feed or explicit permission; no automated retrieval enabled',
 'Conejo Recreation & Park District officially identifies Conejo Disc Golf Club as its partner for support, maintenance, operation and promotion of disc golf at Rabbit Flats and Sapwi Trails. This establishes organizer identity but not current event dates.',
 false,
 array[]::text[],
 null,
 'Coverage target for Ventura County and Sapwi conflict resolution. Direct club evidence is required to resolve the current 2026 Sapwi date conflict.'
),
(
 'dog_haus_disc_golf_direct',
 'Dog Haus Disc Golf Shop direct source',
 'club',
 'https://doghausdg.com/',
 'Pending organizer-owned event page/feed or explicit submission; no automated event extraction enabled',
 'Dog Haus operates the Mast Park disc-golf concession under a City of Santee agreement and is a recurring local event organizer. Its public storefront currently does not expose a reliable event calendar suitable for ingestion.',
 false,
 array[]::text[],
 null,
 'Coverage target for San Diego County. Use a direct organizer page/feed or Local Roots submission before publishing Dog Haus events; do not substitute Disc Golf Scene scraping.'
)
on conflict (key) do update set
 name=excluded.name,
 source_type=excluded.source_type,
 base_url=excluded.base_url,
 access_method=excluded.access_method,
 permission_basis=excluded.permission_basis,
 enabled=excluded.enabled,
 authoritative_fields=excluded.authoritative_fields,
 refresh_schedule=excluded.refresh_schedule,
 notes=excluded.notes,
 updated_at=now();
