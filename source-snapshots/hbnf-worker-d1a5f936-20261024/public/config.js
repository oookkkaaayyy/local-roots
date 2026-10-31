(function () {
  var supabaseBase = 'https://phcpbvuqibyarpfrftgx.supabase.co';
  var matrixHost = window.location.hostname === '192.168.77.10';
  window.APP_CONFIG = {
    SUPABASE_URL: matrixHost ? supabaseBase + '/functions/v1/hbnf-cart-control' : supabaseBase,
    SUPABASE_ANON_KEY: 'sb_publishable_jc_iBS62kG9OeUNVJalpZQ_-BR9ikSC'
  };

  // Periodic standings are local-Matrix-only. The installed UI owns score
  // polling and immediate changed-score overlays; this only repeats a fresh
  // unchanged snapshot while its local dashboard is visible.
  if (!matrixHost || typeof document === 'undefined' || window.__HBNF_PERIODIC_STANDINGS_V1) return;
  window.__HBNF_PERIODIC_STANDINGS_V1 = true;
  var periodMs = 4 * 60 * 1000;
  var freshMs = 45 * 1000;
  var displayMs = 15 * 1000;
  var timer = null;
  var running = false;
  var dueAt = Date.now() + periodMs;
  function schedule() {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    if (running || document.visibilityState !== 'visible') return;
    timer = window.setTimeout(async function () {
      timer = null;
      if (running || document.visibilityState !== 'visible') return;
      running = true;
      var bridge = window.HBNFCanonical;
      try {
        if (!navigator.onLine || !bridge || typeof bridge.read !== 'function' || typeof bridge.overlay !== 'function') throw new Error('not ready');
        var status = await bridge.read('status');
        var localState = status && status.localState;
        var h = localState && localState.HBNF;
        var caps = typeof bridge.getCapabilities === 'function' ? bridge.getCapabilities() || {} : {};
        if (!h || h.overlayId || caps.gameV1 === true || caps.arcadeV1 === true || h.gameActive === true || h.gameMode || (localState.game && localState.game.active) || (localState.arcade && localState.arcade.active)) throw new Error('busy');
        var result = await bridge.read('live_status');
        var snapshot = result && result.live;
        var data = snapshot && snapshot.data;
        if (!snapshot || !Number.isFinite(snapshot.receivedAt) || Date.now() < snapshot.receivedAt || Date.now() - snapshot.receivedAt > freshMs || !data || !data.active || !Array.isArray(data.entries) || !data.entries.length || (data.label !== 'F9' && data.label !== 'B9')) throw new Error('stale');
        if (document.visibilityState !== 'visible') throw new Error('hidden');
        // Re-read confirmed local state immediately before the command so a
        // manual overlay or active game wins over the periodic display.
        status = await bridge.read('status');
        localState = status && status.localState;
        h = localState && localState.HBNF;
        caps = typeof bridge.getCapabilities === 'function' ? bridge.getCapabilities() || {} : {};
        if (!h || h.overlayId || caps.gameV1 === true || caps.arcadeV1 === true || h.gameActive === true || h.gameMode || (localState.game && localState.game.active) || (localState.arcade && localState.arcade.active) || document.visibilityState !== 'visible') throw new Error('busy');
        await bridge.overlay('scoreboard', { label: data.label, entries: data.entries.slice(0, 12) }, displayMs);
      } catch (_) {
        // Closed conditions are skipped; no cached snapshot or retry loop.
      } finally {
        running = false;
        dueAt = Date.now() + periodMs;
        schedule();
      }
    }, Math.max(0, dueAt - Date.now()));
  }
  document.addEventListener('visibilitychange', schedule);
  window.addEventListener('pagehide', function () { if (timer !== null) window.clearTimeout(timer); timer = null; });
  schedule();
})();
