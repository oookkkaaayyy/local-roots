-- Prevent series-year headings from being mistaken for calendar-year dates.
-- The SoCal DGC series page can begin with Nov/Dec events from the prior
-- calendar year, so promotion must independently validate the actual year.

update public.lr_sources
set notes = concat_ws(
      ' ',
      nullif(notes, ''),
      'Series-year warning: the page can begin with November/December events from the prior calendar year before January of the named series year. Never infer calendar year from the page title alone; validate each event date against chronology/current source context before promotion. Example: the Dec. 20 Cowtown Christmas Classic shown ahead of January 2026 had already been played by the club''s Jan. 21, 2026 update and must not be created as a Dec. 2026 future event.'
    ),
    updated_at = now()
where key = 'socal_dgc_manual_calendar';
