\set ON_ERROR_STOP on
CREATE TABLE public.league_state(id integer PRIMARY KEY,state_json jsonb NOT NULL);
INSERT INTO public.league_state(id,state_json) VALUES
(1,'{"glow":{"activeWeek":"2026-11-03","weeks":{"2026-11-03":{"players":[{"id":"QI_1793572411877_1"},{"id":"QI_1793572411877_2"},{"id":"QI_1793572411877_3"}],"cards":[{"id":"C1","players":[]}],"scorecardText":{"holePars":{"1":""}},"udiscSync":{"status":{"state":"failed"}}}}},"skins":{"original":"untouched"},"bagTags":{"original":"untouched"}}'::jsonb);
CREATE TEMP TABLE s1_original AS SELECT state_json AS original_state FROM public.league_state WHERE id=1;
