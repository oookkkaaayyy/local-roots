do $$
begin
  if not exists (
    select 1 from public.gallery_items
    where id = 'ca326b26-258f-53e6-8545-cf5db63044f2'::uuid
  ) then
    update public.gallery_items
    set sort_order = coalesce(sort_order, 0) + 17;

    insert into public.gallery_items
      (id, job_id, is_published, caption, source_photo_path, stencil_path, finished_disc_path, sort_order)
    values
      ('ca326b26-258f-53e6-8545-cf5db63044f2', null, true, null, 'legacy:0:left',  null,               'legacy:0:right',  0),
      ('bcc3eabd-8aa3-565d-b2fc-e968a8227aa8', null, true, null, 'legacy:1:left',  null,               'legacy:1:right',  1),
      ('afdc7b7f-b44c-5b82-8fd1-2ece9388842b', null, true, null, 'legacy:2:left',  null,               'legacy:2:right',  2),
      ('44105adc-a3ef-5017-80a9-cac118986f38', null, true, null, 'legacy:3:left',  'legacy:3:right',   null,              3),
      ('3634084c-9b43-55f5-b716-5fc03e3fedac', null, true, null, 'legacy:4:left',  null,               'legacy:4:right',  4),
      ('90b22f7b-e6fe-5980-8602-c63e4c2e95a4', null, true, null, 'legacy:5:left',  null,               'legacy:5:right',  5),
      ('7eea748b-7370-5324-867e-4a5b87187e5a', null, true, null, 'legacy:6:left',  'legacy:6:right',   null,              6),
      ('2a6fc6ef-1b5d-5ceb-8905-023415a83cc3', null, true, null, 'legacy:7:left',  null,               'legacy:7:right',  7),
      ('e0aab18c-5610-599c-a9d7-e2a7fb96b0d8', null, true, null, 'legacy:8:left',  null,               'legacy:8:right',  8),
      ('78be5142-18ae-54f1-86d1-4f4608aa6ac1', null, true, null, 'legacy:9:left',  'legacy:9:right',   null,              9),
      ('17756bae-26e1-5869-9b00-f5fd611ca447', null, true, null, 'legacy:10:left', null,               'legacy:10:right', 10),
      ('cd6d5faf-6731-5a3b-a4e6-9d38ff88c963', null, true, null, 'legacy:11:left', null,               'legacy:11:right', 11),
      ('ae730a60-60bd-5a1b-bb34-c8226aa5411c', null, true, null, 'legacy:12:left', null,               'legacy:12:right', 12),
      ('041b6020-961e-5a34-ade0-e6184fceaec5', null, true, null, 'legacy:13:left', 'legacy:13:right',  null,              13),
      ('131e1819-fb6a-59d0-a017-3ae5afb7450a', null, true, null, 'legacy:14:left', null,               'legacy:14:right', 14),
      ('fdbeff1c-2ae4-5b58-8a42-ef71cc01c15a', null, true, null, null,             'legacy:15:left',  'legacy:15:right', 15),
      ('864cde1a-aa07-5a3e-8ddc-0da99dffe43b', null, true, null, 'legacy:16:left', null,               'legacy:16:right', 16);
  end if;
end
$$;
