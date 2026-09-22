alter table public.hbnf_aux_commissioning_state
  add constraint hbnf_aux_enable_requires_acceptance
  check (
    not aux_enabled or (
      hardware_wired
      and power_verified
      and gpio_verified
      and current_limit_verified
      and segments_verified
      and audio_input_verified
      and udp_sync_verified
      and underglow_sync_verified
      and uv_main_verified
      and uv_short_verified
      and uv_full_verified
      and thermal_verified
    )
  );

alter table public.hbnf_aux_commissioning_state
  add constraint hbnf_aux_mixed_requires_base_acceptance
  check (
    not mixed_load_verified or (
      aux_enabled
      and hardware_wired
      and power_verified
      and gpio_verified
      and current_limit_verified
      and segments_verified
      and udp_sync_verified
      and underglow_sync_verified
      and uv_main_verified
      and uv_short_verified
      and uv_full_verified
      and thermal_verified
    )
  );
