(function () {
  'use strict';
  var bldCache0 = null, GEO = null, TI = {}, KEY = 'hbnf-studio-v2', MIN_N = 4, K = 6, PRIOR = { 3: -0.4, 4: 0.3 }, BPRIOR = 25, hist = [], histRel = [];
  var $ = function (id) { return document.getElementById(id); };
  var enc = null, H = {}, pool = [], seq = {}, dates = [];
  var st = { base: null, slots: [], sel: -1, view: 'route', sort: 'fit', all: false, q: '', goal: 'easier', more: false, lock: {}, note: null, busy: null, tgt: null, pf: 'need', mk: 'tree', cards: 0, prev: null, pgoal: null, hover: null, draft: [], bp: { pad: '', bsk: '', par: 3 }, cr: null, di: -1, bi: 0 };
  var baseGrade = null, PN = {}, CKEY = 'hbnf-studio-custom';
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); }
  function f(v, d) { return v === null || v === undefined || isNaN(v) ? '-' : Number(v).toFixed(d); }
  function sg(v, d) { if (v === null || v === undefined || isNaN(v)) { return '-'; } return (v > 0 ? '+' : '') + Number(v).toFixed(d); }
  function cl(v, inv) { if (!v) { return ''; } var good = inv ? v > 0 : v < 0; return good ? 'neg' : 'pos'; }
  function get(url, cb) {
    var x = new XMLHttpRequest();
    x.open('GET', url, true);
    x.onload = function () { if (x.status === 200) { try { cb(JSON.parse(x.responseText)); } catch (e) { cb(null); } } else { cb(null); } };
    x.onerror = function () { cb(null); };
    x.send();
  }
  var SB2 = 'https://phcpbvuqibyarpfrftgx.supabase.co/rest/v1/hbnf_studio_state', cloudT = null;
  function sb2(method, url, body, cb) {
    var x = new XMLHttpRequest();
    x.open(method, SB2 + url, true);
    x.setRequestHeader('apikey', 'sb_publishable_jc_iBS62kG9OeUNVJalpZQ_-BR9ikSC'); x.setRequestHeader('Content-Type', 'application/json');
    if (method === 'POST') { x.setRequestHeader('Prefer', 'resolution=merge-duplicates,return=minimal'); }
    x.onload = function () { cb(x.status >= 200 && x.status < 300 ? (x.responseText ? JSON.parse(x.responseText) : true) : null); };
    x.onerror = function () { cb(null); };
    x.send(body ? JSON.stringify(body) : null);
  }
  function cloudPush() {
    cloudT = null; cloudSync(true);
  }
  function cloudStatus(v) { st.cloud = v; var el = $('cloud'); if (el) { el.textContent = v === 'saved' ? 'Saved to cloud' : 'Offline, saved on this device'; } }
  function cloudWrite() {
    sb2('POST', '?on_conflict=id', { id: 'layout-builder', data: { base: st.base, slots: st.slots, lock: st.lock, draft: st.draft, customs: customs(), mg: MG, ts: st.ts || Date.now() }, updated_at: new Date(st.ts || Date.now()).toISOString() }, function (r) { cloudStatus(r ? 'saved' : 'offline'); });
  }
  function cloudSoon() { if (cloudT) { clearTimeout(cloudT); } st.cloud = 'saving'; var el = $('cloud'); if (el) { el.textContent = 'Saving'; } cloudT = setTimeout(cloudPush, 1500); }
  function cloudPull() { if (!cloudT) { cloudSync(false); } }
  function cloudSync(writing) {
    sb2('GET', '?select=data,updated_at&id=eq.layout-builder', null, function (rows) {
      var d, i, c, have, ok = true, mgc, newer, differs;
      st.pulled = true;
      if (!rows) { st.cloud = 'offline'; renderSheet(); return; }
      if (!rows.length) { st.ts = st.ts || Date.now(); cloudWrite(); return; }
      d = rows[0].data || {};
      mgc = mergeMG(d.mg);
      newer = (d.ts || 0) > (st.ts || 0);
      differs = mgStr(MG) !== mgStr(normMG(d.mg));
      c = customs(); have = {}; for (i = 0; i < c.length; i++) { have[c[i].pad + '>' + c[i].bsk] = 1; }
      (d.customs || []).forEach(function (x) { if (!have[x.pad + '>' + x.bsk]) { c.push(x); mgc = true; } });
      try { localStorage.setItem(CKEY, JSON.stringify(c)); } catch (e) { /* storage unavailable */ }
      if (mgc) { storeMG(); }
      loadCustoms(); applyPins();
      if (newer) {
        if (d.slots && d.slots.length === 18) { for (i = 0; i < 18; i++) { if (!H[d.slots[i].id]) { ok = false; } } } else { ok = false; }
        if (ok) { st.slots = d.slots; st.base = d.base; st.lock = d.lock || {}; baseGrade = grade(st.slots); hist = []; }
        st.draft = (d.draft || []).map(function (x) { return x && H[x.id] ? x : null; });
        st.ts = d.ts; save2Local();
      }
      if ((d.ts || 0) < (st.ts || 0) || differs) { cloudWrite(); } else { st.cloud = 'saved'; }
      if (newer || mgc) { renderBase(); renderAll(); } else if (!writing) { renderSheet(); }
    });
  }
  function save2Local() { try { localStorage.setItem(KEY, JSON.stringify({ base: st.base, slots: st.slots, lock: st.lock, draft: st.draft, ts: st.ts })); } catch (e) { /* storage unavailable */ } }
  function save() { st.ts = Date.now(); save2Local(); if (st.pulled) { cloudSoon(); } }
  function load() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (d && d.slots && d.slots.length === 18) {
        for (var i = 0; i < 18; i++) { if (!H[d.slots[i].id]) { return null; } }
        return d;
      }
    } catch (e) { /* ignore */ }
    return null;
  }
  function prep() {
    var i, j, h, s, o;
    for (i = 0; i < enc.holes.length; i++) {
      h = enc.holes[i]; s = h.stats || {};
      H[h.hole_id] = { id: h.hole_id, label: h.label, par: h.par || 3, pad: h.pad_id, bsk: h.basket_id, n: s.team_holes || 0,
        avg: s.avg_strokes, rel: s.avg_rel_par, bird: s.birdie_pct, bog: (s.bogey_pct || 0) + (s.double_plus_pct || 0), occ: h.occurrences || [] };
      for (j = 0; j < H[h.hole_id].occ.length; j++) {
        o = H[h.hole_id].occ[j];
        (seq[o.event_date] = seq[o.event_date] || [])[o.layout_hole - 1] = { id: h.hole_id, par: o.par };
      }
    }
    for (var d in seq) {
      if (seq.hasOwnProperty(d)) {
        var ok = seq[d].length === 18;
        for (j = 0; ok && j < 18; j++) { if (!seq[d][j]) { ok = false; } }
        if (ok) { dates.push(d); }
      }
    }
    dates.sort().reverse();
    var sr = { 3: [0, 0], 4: [0, 0] }, sb = [0, 0];
    for (i = 0; i < enc.holes.length; i++) {
      h = H[enc.holes[i].hole_id];
      if (h.n >= MIN_N && h.avg !== undefined && h.avg !== null) {
        var pp = h.par >= 4 ? 4 : 3; sr[pp][0] += (h.avg - h.par) * h.n; sr[pp][1] += h.n; sb[0] += (h.bird || 0) * h.n; sb[1] += h.n;
      }
    }
    if (sr[3][1]) { PRIOR[3] = sr[3][0] / sr[3][1]; } if (sr[4][1]) { PRIOR[4] = sr[4][0] / sr[4][1]; } if (sb[1]) { BPRIOR = sb[0] / sb[1]; }
    for (i = 0; i < enc.holes.length; i++) {
      h = H[enc.holes[i].hole_id];
      if (h.id.indexOf('unresolved') < 0 && h.id.indexOf('temp') < 0) { pool.push(h); }
    }
  }
  function tested(h) { return h.n >= MIN_N; }
  function exp(h, par) {
    var n = h.n || 0, pr = h.geo && h.geo.pred && h.geo.par === par ? h.geo.pred : par + (PRIOR[par] !== undefined ? PRIOR[par] : PRIOR[4]);
    return n && h.avg !== null && h.avg !== undefined ? (n * h.avg + K * pr) / (n + K) : pr;
  }
  function bird(h) { var n = h.n || 0; return n ? (n * (h.bird || 0) + K * BPRIOR) / (n + K) : BPRIOR; }
  function dupBsk(slots) { var m = {}, d = 0, i; for (i = 0; i < slots.length; i++) { var b = canon(H[slots[i].id].bsk); if (m[b]) { d++; } m[b] = 1; } return d; }
  function ll(k) { var n = GEO.nodes[k], la = n[0] * Math.PI / 180; return [n[1] * 111320 * Math.cos(33.698 * Math.PI / 180), n[0] * 111320]; }
  function walk(a, b) {
    if (!GEO || !a || !b) { return 0; }
    var p = ll(a), q = ll(b), v = Math.sqrt(Math.pow(p[0] - q[0], 2) + Math.pow(p[1] - q[1], 2)) * 1.2 / 65, i = TI[a], j = TI[b], m = i === undefined || j === undefined ? null : GEO.t[i][j];
    return m !== null && m !== undefined && m < v ? m : v;
  }
  function segX(p, q, r, s) {
    function o(a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
    return o(p, q, r) * o(p, q, s) < 0 && o(r, s, p) * o(r, s, q) < 0;
  }
  function pd(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
    return Math.sqrt(Math.pow(p[0] - a[0] - t * dx, 2) + Math.pow(p[1] - a[1] - t * dy, 2));
  }
  function geoStats(slots) {
    var r = { walk: 0, leg: 0, ft: 0, cross: 0, hit: {}, legs: [] }, i, j, gi, gj, w, pi, qi, pj, qj;
    if (!GEO) { return r; }
    for (i = 0; i < slots.length; i++) {
      gi = H[slots[i].id].geo; r.legs.push(0);
      if (!gi) { continue; }
      r.ft += gi.d * 3.28084;
      w = i === 0 ? walk(GEO.park, gi.p) : (H[slots[i - 1].id].geo ? walk(H[slots[i - 1].id].geo.b, gi.p) : 0);
      r.legs[i] = w; r.walk += w; if (w > r.leg) { r.leg = w; }
    }
    for (i = 0; i < slots.length; i++) {
      gi = H[slots[i].id].geo; if (!gi) { continue; }
      pi = ll(gi.p); qi = ll(gi.b);
      for (j = i + 1; j < slots.length && j <= i + 2; j++) {
        gj = H[slots[j].id].geo; if (!gj || gj.b === gi.b || gj.p === gi.p || (j === i + 1 && gj.p === gi.b)) { continue; }
        pj = ll(gj.p); qj = ll(gj.b);
        if (segX(pi, qi, pj, qj)) {
          r.cross++; (r.hit[i] = r.hit[i] || []).push(j + 1); (r.hit[j] = r.hit[j] || []).push(i + 1);
        }
      }
    }
    return r;
  }
  function grade(slots) {
    var g = { exp: 0, par: 0, bird: 0, front: 0, back: 0, hard: 0, untested: 0, par4: 0, rels: [] }, i, h, r;
    for (i = 0; i < slots.length; i++) {
      h = H[slots[i].id]; r = exp(h, slots[i].par) - slots[i].par;
      g.exp += exp(h, slots[i].par); g.par += slots[i].par; g.rels.push(r);
      if (i < 9) { g.front += r; } else { g.back += r; }
      g.bird += bird(h) / 100; if (tested(h)) { if (h.bog >= 15) { g.hard++; } } else { g.untested++; }
      if (slots[i].par >= 4) { g.par4++; }
    }
    g.rel = g.exp - g.par; g.dup = dupBsk(slots);
    var gs = geoStats(slots); g.walk = gs.walk; g.leg = gs.leg; g.ft = gs.ft; g.cross = gs.cross; g.hit = gs.hit; g.legs = gs.legs;
    var m = g.rels.reduce(function (a, b) { return a + b; }, 0) / g.rels.length;
    g.sd = Math.sqrt(g.rels.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / g.rels.length);
    return g;
  }
  function objective(goal, g) {
    if (goal === 'easier') { return -g.rel; }
    if (goal === 'harder') { return g.rel; }
    if (goal === 'birdies') { return g.bird; }
    if (goal === 'faster') { return -(g.exp + 0.5 * g.par4); }
    if (goal === 'walk') { return -g.walk; }
    if (goal === 'safe') { return -(g.cross + g.walk * 0.001); }
    return -(g.sd + 0.5 * Math.abs(g.front - g.back));
  }
  var GOALS = [['easier', 'Easier', 'Lowest expected score'], ['harder', 'Harder', 'Highest expected score'], ['birdies', 'More birdies', 'Most birdie chances'], ['faster', 'Faster rounds', 'Fewest strokes, shortest holes'], ['balance', 'Even difficulty', 'Front and back nine matched'], ['walk', 'Less walking', 'Shortest total walk'], ['safe', 'No overlaps', 'Fewest crossing fairways']];
  function guideText(id, par) {
    var h = H[id]; if (composed(h)) { return pairName(h) + (par !== 3 ? ' (par ' + par + ')' : ''); }
    var t = h.occ.length ? h.occ[h.occ.length - 1].source_text : h.label;
    t = t.replace(/→/g, 'to').replace(/★/g, '').replace(/\(par[^)]*\)/ig, '').replace(/\s+/g, ' ').trim();
    return par !== 3 ? t + ' (par ' + par + ')' : t;
  }
  var ordCache = null;
  function bestOrder() {
    var n = 18, base = st.slots, gs = [], i, j, k, c, b, bc = 1e9, best = null, it, perm, imp, cost;
    for (i = 0; i < n; i++) { gs.push(H[base[i].id].geo); if (!gs[i]) { return null; } }
    var S = [], C = [];
    for (i = 0; i < n; i++) { S.push(walk(GEO.park, gs[i].p)); C.push([]); for (j = 0; j < n; j++) { C[i].push(i === j ? 0 : walk(gs[i].b, gs[j].p)); } }
    function tot(p) { var t = S[p[0]], q; for (q = 1; q < n; q++) { t += C[p[q - 1]][p[q]]; } return t; }
    var seed = 7; function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
    for (it = 0; it < 60; it++) {
      perm = []; for (i = 0; i < n; i++) { perm.push(i); }
      if (it > 0) { for (i = n - 1; i > 0; i--) { j = Math.floor(rnd() * (i + 1)); c = perm[i]; perm[i] = perm[j]; perm[j] = c; } }
      cost = tot(perm); imp = true;
      while (imp) {
        imp = false;
        for (i = 0; i < n; i++) {
          for (j = 0; j < n; j++) {
            if (i === j) { continue; }
            var t = perm.slice(); c = t.splice(i, 1)[0]; t.splice(j, 0, c); b = tot(t);
            if (b < cost - 1e-6) { perm = t; cost = b; imp = true; }
          }
        }
        for (i = 0; i < n - 1; i++) { for (j = i + 1; j < n; j++) { var u = perm.slice(i, j + 1).reverse(), t2 = perm.slice(0, i).concat(u, perm.slice(j + 1)); b = tot(t2); if (b < cost - 1e-6) { perm = t2; cost = b; imp = true; } } }
      }
      if (cost < bc) { bc = cost; best = perm; }
    }
    return { perm: best, cost: bc };
  }
  var bldCache = null;
  function penalty(g) { return g.dup * 4 + g.cross * 2 + g.walk * 0.04 + g.untested * 3; }
  function buildLayout(goal) {
    var cand = pool.filter(function (p) { return p.n >= 8 && p.par && !isRet(p) && (!GEO || p.geo); }), cur = st.slots.slice(), cg = grade(cur),
        cs = objective(goal, cg) - penalty(cg), best = cur.slice(), bs = cs, it, T, i, j, p, tr, tg, ts, used, k, N = 30000, seed = 11;
    function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
    if (!cand.length) { return null; }
    for (it = 0; it < N; it++) {
      T = 0.6 * (1 - it / N) + 0.005; tr = cur.slice();
      if (rnd() < 0.7) {
        i = Math.floor(rnd() * 18); if (st.lock[i]) { continue; } p = cand[Math.floor(rnd() * cand.length)]; used = false;
        for (k = 0; k < 18; k++) { if (tr[k].id === p.id) { used = true; } }
        if (used) { continue; }
        tr[i] = { id: p.id, par: p.par };
      } else {
        i = Math.floor(rnd() * 18); j = Math.floor(rnd() * 18); if (i === j || st.lock[i] || st.lock[j]) { continue; }
        k = tr[i]; tr[i] = tr[j]; tr[j] = k;
      }
      tg = grade(tr); ts = objective(goal, tg) - penalty(tg);
      if (ts >= cs || rnd() < Math.exp((ts - cs) / T)) { cur = tr; cs = ts; if (cs > bs) { bs = cs; best = cur.slice(); } }
    }
    return best;
  }
  function suggest(goal) {
    var out = [], base = objective(goal, grade(st.slots)), i, j, p, g, trial, nb, pb;
    for (i = 0; i < 18; i++) {
      for (j = 0; j < pool.length; j++) {
        p = pool[j];
        if (p.n < 12 || isRet(p) || inLayout(p.id, i)) { continue; }
        nb = i < 17 ? H[st.slots[i + 1].id].bsk : null; pb = i > 0 ? H[st.slots[i - 1].id].bsk : null;
        if (p.bsk === nb || p.bsk === pb) { continue; }
        trial = st.slots.slice(); trial[i] = { id: p.id, par: p.par };
        g = objective(goal, grade(trial)) - base;
        if (g > 0.001) { out.push({ i: i, to: p.id, gain: g }); }
      }
    }
    out.sort(function (a, b) { return b.gain - a.gain; });
    var seen = {}, seenTo = {}, res = [];
    for (i = 0; i < out.length && res.length < 10; i++) { if (!seen[out[i].i] && !seenTo[out[i].to]) { seen[out[i].i] = 1; seenTo[out[i].to] = 1; res.push(out[i]); } }
    return res;
  }
  var RD = {}, USE = {}, pins = {}, marks = [], me = null, watchId = null, SB = 'https://phcpbvuqibyarpfrftgx.supabase.co/rest/v1/hbnf_studio_pins', SK = 'sb_publishable_jc_iBS62kG9OeUNVJalpZQ_-BR9ikSC', PKEY = 'hbnf-pins-v1';
  var map = null, L = window.L, layers = { all: null, route: null, ghost: null, hov: null, pins: null, marks: null, me: null, tgt: null, xs: null }, MAPOK = false;
  function short(id) { return composed(H[id]) ? pairName(H[id]) : H[id].label.replace(/\s*\(.*\)\s*$/, ''); }
  function ftOf(p) { return p.geo ? (p.geo.pf === 'a' || p.geo.bf === 'a' ? 'approx ' : '') + Math.round(p.geo.d * 3.28084 / 5) * 5 : '-'; }
  function rank(rel) { var r = 1, i; for (i = 0; i < histRel.length; i++) { if (histRel[i] < rel) { r++; } } return r; }
  function snap() { hist.push(JSON.stringify(st.slots)); if (hist.length > 50) { hist.shift(); } st.note = null; }
  function undo() { if (hist.length) { st.slots = JSON.parse(hist.pop()); st.note = null; save(); renderAll(); } }
  function inLayout(id, except) { for (var i = 0; i < 18; i++) { if (i !== except && st.slots[i].id === id) { return true; } } return false; }
  function loadBase(d) { st.base = d; st.slots = seq[d].map(function (s) { return { id: s.id, par: s.par }; }); baseGrade = grade(st.slots); st.sel = -1; st.view = 'route'; st.prev = null; st.lock = {}; st.note = null; hist = []; save(); }
  function ll2(k) { var n = GEO.nodes[k]; return [n[0], n[1]]; }
  function relColor(r, ok) { if (!ok) { return '#9a9a9a'; } return r < -0.15 ? '#8fcf8f' : r < 0.15 ? '#e9d39b' : '#e2a066'; }
  function holeRel(s) { var h = H[s.id]; return exp(h, s.par) - s.par; }
  function setCollapsed(c) { document.body.setAttribute('data-sheet', c ? 'min' : 'open'); if (map) { setTimeout(function () { map.invalidateSize(); }, 60); } }
  function drawLayout(group, slots, o) {
    var i, h, p, b, cg = geoStats(slots), pts = [], prevB = GEO.park;
    group.clearLayers();
    if (!o.ghost) {
      var a1, b1, c1, d1, j1, gj1, ii, jj;
      for (ii = 0; ii < slots.length; ii++) {
        a1 = H[slots[ii].id].geo; if (!a1) { continue; }
        for (jj = ii + 1; jj < slots.length && jj <= ii + 2; jj++) {
          gj1 = H[slots[jj].id].geo; if (!gj1 || gj1.b === a1.b || gj1.p === a1.p) { continue; }
          b1 = ll(a1.p); c1 = ll(a1.b); d1 = ll(gj1.p); var e1 = ll(gj1.b);
          if ((o.ghost || st.sel < 0 || st.sel === ii || st.sel === jj) && segX(b1, c1, d1, e1)) {
            var den = (c1[0] - b1[0]) * (e1[1] - d1[1]) - (c1[1] - b1[1]) * (e1[0] - d1[0]), tt = ((d1[0] - b1[0]) * (e1[1] - d1[1]) - (d1[1] - b1[1]) * (e1[0] - d1[0])) / den, px = b1[0] + tt * (c1[0] - b1[0]), py = b1[1] + tt * (c1[1] - b1[1]);
            L.marker([py / 111320, px / (111320 * Math.cos(33.698 * Math.PI / 180))], { icon: L.divIcon({ className: 'pin mk xo', html: '<span>X</span>', iconSize: [16, 16], iconAnchor: [8, 8] }), interactive: false, keyboard: false }).addTo(group);
          }
        }
      }
    }
    var grp = {}, gi = {};
    for (i = 0; i < slots.length; i++) { h = H[slots[i].id]; if (h.geo) { grp[h.geo.p] = (grp[h.geo.p] || 0) + 1; gi[i] = grp[h.geo.p] - 1; } }
    for (i = 0; i < slots.length; i++) {
      h = H[slots[i].id]; if (!h.geo) { continue; }
      p = ll2(h.geo.p); b = ll2(h.geo.b);
      var col = o.ghost ? '#c9b4f0' : relColor(holeRel(slots[i]), tested(h)), sel = !o.ghost && i === st.sel, dim = !o.ghost && st.sel >= 0 && st.sel < slots.length && !sel;
      if (sel) { L.polyline([ll2(prevB), p], { color: '#f4e9d6', weight: 2, opacity: 0.85, dashArray: '2 6', interactive: false }).addTo(group); }
      if (!o.ghost && !dim) { L.polyline([p, b], { color: sel ? '#f4e9d6' : '#1d1812', weight: sel ? 11 : 7, opacity: 0.9, lineCap: 'round', interactive: false }).addTo(group); }
      var ln = L.polyline([p, b], { color: col, weight: sel ? 6 : 4, opacity: dim ? 0.3 : 0.95, dashArray: o.ghost ? '8 6' : null, lineCap: 'round' }).addTo(group);
      if (!o.ghost) { (function (k) { ln.on('click', function () { pick(k); }); })(i); }
      if (!sel) {
        var cm = L.marker(b, { icon: L.divIcon({ className: 'pin cup' + (dim ? ' dim' : ''), html: '<span style="border-color:' + col + '"></span>', iconSize: [18, 18], iconAnchor: [9, 9] }), keyboard: false, interactive: !o.ghost }).addTo(group);
        if (!o.ghost) { (function (k) { cm.on('click', function () { pick(k); }); })(i); }
      }
      var gn = grp[h.geo.p], fa = 2 * Math.PI * gi[i] / gn - Math.PI / 2, fx = gn > 1 && !sel ? Math.round(Math.cos(fa) * (gn > 3 ? 26 : 19)) : 0, fy = gn > 1 && !sel ? Math.round(Math.sin(fa) * (gn > 3 ? 26 : 19)) : 0;
      var ic = L.divIcon({ className: 'pin pad' + (sel ? ' sel' : '') + (dim ? ' dim' : '') + (o.ghost ? ' gh' : ''), html: '<span style="background:' + col + '">' + (o.nums ? o.nums[i] : i + 1) + '</span>', iconSize: [28, 28], iconAnchor: [14 - fx, 14 - fy] });
      var m = L.marker(p, { icon: ic, keyboard: false, draggable: !!sel, zIndexOffset: sel ? 1000 : 0 }).addTo(group);
      if (!o.ghost) { (function (k) { m.on('click', function () { pick(k); }); })(i); }
      if (sel) {
        (function (hh) {
          m.bindTooltip('Drag to move pad', { direction: 'top', offset: [0, -14] });
          m.on('dragend', function (ev) { var q = ev.target.getLatLng(); setTimeout(function () { movePoint(hh.pad, q.lat, q.lng); }, 0); });
          var bm = L.marker(b, { icon: L.divIcon({ className: 'pin cup sel', html: '<span style="border-color:' + col + '">' + (i + 1) + '</span>', iconSize: [32, 32], iconAnchor: [16, 16] }), draggable: true, keyboard: false, zIndexOffset: 1100 }).addTo(group);
          bm.bindTooltip('Drag to move basket', { direction: 'top', offset: [0, -14] });
          bm.on('dragend', function (ev) { var q = ev.target.getLatLng(); setTimeout(function () { movePoint(hh.bsk, q.lat, q.lng); }, 0); });
        })(h);
      }
      prevB = h.geo.b;
    }
  }
  function drawMap() {
    if (!map) { return; }
    if (st.view === 'build') { var bc = dc(-1, -1, null); drawLayout(layers.route, bc.s, { nums: bc.ix }); } else { drawLayout(layers.route, st.view === 'hist' && st.hd ? [] : st.slots, {}); }
    layers.ghost.clearLayers();
    if (st.prev) { drawLayout(layers.ghost, st.prev, { ghost: true }); }
    layers.hov.clearLayers();
    if (st.hover && (st.sel >= 0 || st.view === 'build') && H[st.hover] && H[st.hover].geo) {
      var g = H[st.hover].geo;
      L.polyline([ll2(g.p), ll2(g.b)], { color: '#c9b4f0', weight: 7, opacity: 0.95, dashArray: '8 6', interactive: false }).addTo(layers.hov);
      L.circleMarker(ll2(g.p), { radius: 7, color: '#c9b4f0', weight: 3, fillColor: '#1d1812', fillOpacity: 1, interactive: false }).addTo(layers.hov);
    }
    if (st.view === 'build' && st.bp.pad && st.bp.bsk && H['H:' + st.bp.pad + '>' + st.bp.bsk] && H['H:' + st.bp.pad + '>' + st.bp.bsk].geo) {
      var pg = H['H:' + st.bp.pad + '>' + st.bp.bsk].geo;
      L.polyline([ll2(pg.p), ll2(pg.b)], { color: '#c9b4f0', weight: 7, opacity: 0.95, dashArray: '8 6', interactive: false }).addTo(layers.hov);
      L.circleMarker(ll2(pg.p), { radius: 7, color: '#c9b4f0', weight: 3, fillColor: '#1d1812', fillOpacity: 1, interactive: false }).addTo(layers.hov);
    }
    var fit = st.view !== 'build' && st.sel >= 0 && H[st.slots[st.sel].id].geo ? [ll2(H[st.slots[st.sel].id].geo.p), ll2(H[st.slots[st.sel].id].geo.b)] : null;
    if (st.fit) { st.fit = false; var pts = [], i, fs = st.view === 'build' ? dc(-1, -1, null).s : st.slots; for (i = 0; i < fs.length; i++) { if (H[fs[i].id].geo) { pts.push(ll2(H[fs[i].id].geo.p), ll2(H[fs[i].id].geo.b)); } } if (st.view === 'build' && !pts.length) { var kk, bk = []; for (kk in GEO.nodes) { if (GEO.nodes.hasOwnProperty(kk) && kk.indexOf('pin:') !== 0) { bk.push(ll2(kk)); } } pts = bk; } if (pts.length) { map.invalidateSize(); map.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [40, 40], paddingBottomRight: [40, 78], animate: false }); } }
    else if (st.view !== 'build' && fit && st.focus) { st.focus = false; map.invalidateSize(); map.fitBounds(L.latLngBounds(fit), { padding: [90, 90], maxZoom: 18, animate: false }); }
  }
  function initMap() {
    if (!L || !GEO) { return; }
    map = L.map('map', { zoomControl: true, attributionControl: true, maxZoom: 20, zoomSnap: 0.5 });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 19, maxZoom: 20, attribution: 'Esri' }).addTo(map);
    layers.all = L.layerGroup().addTo(map); layers.route = L.layerGroup().addTo(map); layers.ghost = L.layerGroup().addTo(map); layers.hov = L.layerGroup().addTo(map); layers.xs = L.layerGroup().addTo(map); layers.pins = L.layerGroup().addTo(map); layers.marks = L.layerGroup().addTo(map); layers.tgt = L.layerGroup().addTo(map); layers.me = L.layerGroup().addTo(map);
    var k, kp = []; for (k in GEO.nodes) { if (GEO.nodes.hasOwnProperty(k)) { kp.push(ll2(k)); } }
    map.fitBounds(L.latLngBounds(kp), { padding: [20, 20], animate: false });
    var p = GEO.park && GEO.nodes[GEO.park] ? ll2(GEO.park) : null;
    if (p) { L.marker(p, { icon: L.divIcon({ className: 'pin park', html: '<span>P</span>', iconSize: [28, 28], iconAnchor: [14, 14] }), interactive: false, keyboard: false }).addTo(map); }
    MAPOK = true; st.fit = true;
  }
  function dist2(u, v) { return Math.sqrt(Math.pow(u[0] - v[0], 2) + Math.pow(u[1] - v[1], 2)); }
  function drawAll() {
    if (!map) { return; }
    layers.all.clearLayers();
    if (st.view === 'build') {
      var lk0 = ll(prevKey(st.bi)), bi, bp2, ub0 = usedB(), used0 = {}, dd0 = D(); for (bi = 0; bi < 18; bi++) { if (dd0[bi] && bi !== st.bi) { used0[dd0[bi].id] = 1; } }
      for (bi = 0; bi < pool.length; bi++) {
        bp2 = pool[bi]; if (!bp2.geo || used0[bp2.id] || ub0[canon(bp2.bsk)] || isRet(bp2) || bp2.syn || dist2(ll(bp2.geo.p), lk0) > 120) { continue; }
        (function (pp) { var ln2 = L.polyline([ll2(pp.geo.p), ll2(pp.geo.b)], { color: '#d9cebb', weight: 3, opacity: 0.4 }).addTo(layers.all); ln2.bindTooltip(short(pp.id) + ' (set as hole ' + (st.bi + 1) + ')', { sticky: true }); ln2.on('mouseover', function () { st.hover = pp.id; drawMap(); }).on('mouseout', function () { st.hover = null; drawMap(); }).on('click', function () { addDraft(pp.id, pp.par); }); })(bp2);
      }
      return;
    }
    if (!(st.view === 'route' && st.sel >= 0 && st.xp)) { return; }
    var i, p, g, c = st.sel >= 0 && H[st.slots[st.sel].id].geo ? H[st.slots[st.sel].id].geo : null, a, d;
    a = c ? [ll(c.p), ll(c.b)] : null;
    for (i = 0; i < pool.length; i++) {
      p = pool[i]; g = p.geo; if (!g || isRet(p) || inLayout(p.id, st.sel) || p.n < MIN_N) { continue; }
      if (a) { d = Math.min(dist2(ll(g.p), a[0]), dist2(ll(g.p), a[1]), dist2(ll(g.b), a[0]), dist2(ll(g.b), a[1])); if (d > 120) { continue; } }
      (function (pp) {
        var ln = L.polyline([ll2(pp.geo.p), ll2(pp.geo.b)], { color: '#d9cebb', weight: 2, opacity: 0.28 }).addTo(layers.all);
        ln.bindTooltip('Replace with ' + short(pp.id) + ' (click)', { sticky: true });
        ln.on('mouseover', function () { st.hover = pp.id; drawMap(); }).on('mouseout', function () { st.hover = null; drawMap(); }).on('click', function () { replaceWith(pp.id); });
      })(p);
    }
  }

  function mxy(a) { return [a[1] * 111320 * Math.cos(33.698 * Math.PI / 180), a[0] * 111320]; }
  function mdist(a, b) { var u = mxy(a), v = mxy(b); return Math.sqrt(Math.pow(u[0] - v[0], 2) + Math.pow(u[1] - v[1], 2)); }
  function tname(id) { if (MG.nm[id]) { return MG.nm[id]; } var n = id.replace(/^(pad|bsk):/, '').replace(/^new-/, '').replace(/-/g, ' '); return n.charAt(0).toUpperCase() + n.slice(1); }
  function tlabel(id) { var k = id.indexOf('pad:') === 0 ? 'Pad ' : id.indexOf('bsk:') === 0 ? 'Basket ' : ''; return k + (MG.nm[id] || id.replace(/^(pad|bsk):/, '').replace(/-/g, ' ')); }
  function composed(h) { return !!(h.syn || canon(h.pad) !== h.pad || canon(h.bsk) !== h.bsk || MG.nm[h.pad] || MG.nm[h.bsk]); }
  function pairName(h) { var bn = tname(canon(h.bsk)); return tname(canon(h.pad)) + ' to ' + (/^\d+$/.test(bn) ? 'Basket ' : '') + bn; }
  function sb(method, url, body, cb) {
    var x = new XMLHttpRequest();
    x.open(method, SB + url, true);
    x.setRequestHeader('apikey', SK); x.setRequestHeader('Content-Type', 'application/json');
    if (method === 'POST') { x.setRequestHeader('Prefer', 'resolution=merge-duplicates,return=minimal'); }
    x.onload = function () { cb(x.status >= 200 && x.status < 300 ? (x.responseText ? JSON.parse(x.responseText) : true) : null); };
    x.onerror = function () { cb(null); };
    x.send(body ? JSON.stringify(body) : null);
  }
  function savePinsLocal() { try { localStorage.setItem(PKEY, JSON.stringify({ pins: pins, marks: marks })); } catch (e) { /* storage unavailable */ } }
  function loadPinsLocal() { try { var d = JSON.parse(localStorage.getItem(PKEY) || 'null'); if (d) { pins = d.pins || {}; marks = d.marks || []; } } catch (e) { /* ignore */ } }
  function pushPin(id, kind, lat, lon) { sb('POST', '?on_conflict=id', { id: id, kind: kind, lat: lat, lon: lon, updated_at: new Date().toISOString() }, function (r) { st.sync = r ? 'saved' : 'offline'; if (st.view === 'pins') { renderSheet(); } }); }
  function pullPins(cb) {
    sb('GET', '?select=id,kind,lat,lon', null, function (rows) {
      if (!rows) { cb(); return; }
      var srv = {}, i, r, out = [];
      for (i = 0; i < rows.length; i++) {
        r = rows[i]; srv[r.id] = 1;
        if (r.kind === 'point') { pins[r.id] = [r.lat, r.lon]; } else { out.push({ id: r.id, kind: r.kind, lat: r.lat, lon: r.lon }); }
      }
      for (i = 0; i < marks.length; i++) { if (!srv[marks[i].id] && !marks[i].del) { pushPin(marks[i].id, marks[i].kind, marks[i].lat, marks[i].lon); out.push(marks[i]); } }
      marks = out;
      for (r in pins) { if (pins.hasOwnProperty(r) && !srv[r]) { pushPin(r, 'point', pins[r][0], pins[r][1]); } }
      savePinsLocal(); cb();
    });
  }
  function applyPins() {
    if (!GEO) { return; }
    var q, h, m = GEO.meta.model, pp, bp, g, d, idn = {}, idf = {}, pid, cp, cb, P;
    for (pid in pins) { if (pins.hasOwnProperty(pid)) { GEO.nodes['pin:' + pid] = [pins[pid][0], pins[pid][1], 0, 0]; } }
    for (pid in MG.at) { GEO.nodes['pin:' + pid] = [MG.at[pid][0], MG.at[pid][1], 0, 0]; }
    for (q in H) {
      if (!H.hasOwnProperty(q)) { continue; }
      h = H[q];
      if (h.geo0 === undefined) { h.geo0 = h.geo ? JSON.parse(JSON.stringify(h.geo)) : null; }
      if (h.geo0) {
        if (!idn[h.pad] || (idf[h.pad] === 'a' && h.geo0.pf === 'v')) { idn[h.pad] = h.geo0.p; idf[h.pad] = h.geo0.pf; }
        if (!idn[h.bsk] || (idf[h.bsk] === 'a' && h.geo0.bf === 'v')) { idn[h.bsk] = h.geo0.b; idf[h.bsk] = h.geo0.bf; }
      }
    }
    PN = idn;
    function over(c, raw) { if (ppos(c)) { return ['pin:' + c, 'v']; } return c !== raw && idn[c] ? [idn[c], idf[c]] : null; }
    for (q in H) {
      if (!H.hasOwnProperty(q)) { continue; }
      h = H[q];
      h.geo = h.geo0 ? JSON.parse(JSON.stringify(h.geo0)) : null;
      cp = canon(h.pad); cb = canon(h.bsk); pp = over(cp, h.pad); bp = over(cb, h.bsk);
      if (!pp && !bp && h.geo) { continue; }
      if (!h.geo) {
        P = [pp || (idn[cp] ? [idn[cp], idf[cp] || 'a'] : null), bp || (idn[cb] ? [idn[cb], idf[cb] || 'a'] : null)];
        if (!P[0] || !P[1]) { continue; }
        h.geo = { p: P[0][0], b: P[1][0], pf: P[0][1], bf: P[1][1], n: h.n, par: h.par, d: 0, pred: 0, up: 0.5 };
      } else {
        if (pp) { h.geo.p = pp[0]; h.geo.pf = pp[1]; }
        if (bp) { h.geo.b = bp[0]; h.geo.bf = bp[1]; }
      }
      g = h.geo; d = mdist(ll2(g.p), ll2(g.b)); g.d = d;
      g.pred = Math.round((m.c0 + m.per100m * d / 100 + (g.par >= 4 ? m.par4 : 0)) * 100) / 100;
    }
  }
  function targets() {
    var m = {}, i, h, k, id, t, f, c = customs();
    function ent(x) { return m[x] || (m[x] = { id: x, holes: [], need: 2, ok: false, ap: false }); }
    for (i = 0; i < pool.length; i++) {
      h = pool[i];
      for (k = 0; k < 2; k++) {
        id = k ? h.bsk : h.pad; if (!usable(id)) { continue; }
        t = ent(canon(id)); t.holes.push(h.id); f = h.geo0 ? (k ? h.geo0.bf : h.geo0.pf) : null;
        if (f && canon(id) === id) { if (f === 'a') { t.ap = true; } else { t.ok = true; } }
      }
    }
    c.forEach(function (x) { if (usable(x.pad)) { ent(canon(x.pad)); } if (usable(x.bsk)) { ent(canon(x.bsk)); } });
    [pins, MG.nm, MG.rt, MG.at].forEach(function (o) { for (var x in o) { if (usable(x)) { ent(canon(x)); } } });
    for (id in MG.m) { if (usable(id)) { ent(canon(id)); } }
    var out = [];
    for (id in m) { if (m.hasOwnProperty(id)) { t = m[id]; t.need = t.ok ? 0 : t.ap || (PN[id] && !ppos(id)) ? 1 : 2; if (ppos(id)) { t.need = -1; } t.ret = !!MG.rt[id]; out.push(t); } }
    return out;
  }
  function tpos(t) {
    if (ppos(t.id)) { return ppos(t.id); }
    if (PN[t.id] && GEO) { return ll2(PN[t.id]); }
    var i, h, g;
    for (i = 0; i < t.holes.length; i++) { h = H[t.holes[i]]; g = h.geo; if (g) { return ll2(canon(h.pad) === t.id ? g.p : g.b); } }
    return null;
  }
  function locate(follow) {
    if (!navigator.geolocation) { st.gps = 'No GPS'; $('loc').textContent = 'No GPS'; setTimeout(function () { $('loc').textContent = 'Me'; }, 2500); return; }
    st.follow = follow !== false;
    if (watchId !== null) { if (me && map && st.follow) { map.setView([me.lat, me.lon], Math.max(map.getZoom(), 18), { animate: false }); } return; }
    watchId = navigator.geolocation.watchPosition(function (p) {
      var first = !me; me = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy };
      st.gps = '';
      drawMe();
      if (first && st.follow && map) { map.setView([me.lat, me.lon], 18, { animate: false }); }
      if (st.view === 'pins' || st.view === 'auto') { renderSheet(); }
      $('loc').setAttribute('aria-pressed', 'true');
    }, function () { st.gps = 'No GPS'; watchId = null; $('loc').textContent = 'No GPS'; setTimeout(function () { $('loc').textContent = 'Me'; }, 2500); $('loc').setAttribute('aria-pressed', 'false'); if (st.view === 'pins') { renderSheet(); } }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 });
  }
  function drawMe() {
    if (!map || !me) { return; }
    layers.me.clearLayers();
    L.circle([me.lat, me.lon], { radius: me.acc, color: '#7fb2ff', weight: 1, fillColor: '#7fb2ff', fillOpacity: 0.12, interactive: false }).addTo(layers.me);
    L.circleMarker([me.lat, me.lon], { radius: 7, color: '#1d1812', weight: 2, fillColor: '#7fb2ff', fillOpacity: 1, interactive: false }).addTo(layers.me);
  }
  function drawUnused() {
    var used = {}, i, h;
    for (i = 0; i < st.slots.length; i++) { h = H[st.slots[i].id]; used[canon(h.pad)] = 1; used[canon(h.bsk)] = 1; }
    targets().forEach(function (t) {
      var q = t.ret || used[t.id] ? null : tpos(t), pad = t.id.indexOf('pad:') === 0, m;
      if (!q) { return; }
      m = L.marker(q, { icon: L.divIcon({ className: 'pin un ' + (pad ? 'upad' : 'ucup'), html: '<span></span>', iconSize: [26, 26], iconAnchor: [13, 13] }), keyboard: false, zIndexOffset: -500 }).addTo(layers.pins);
      m.on('click', function () { st.view = 'pins'; st.tk = pad ? 'pad' : 'bsk'; st.tgt = t.id; st.sel = -1; st.rn = undefined; st.mw = st.kn = st.ks = null; st.cr = null; st.hd = null; st.prev = null; setCollapsed(false); renderAll(); map.panTo(q); });
    });
  }
  function drawPins() {
    if (!map) { return; }
    layers.pins.clearLayers(); layers.marks.clearLayers(); layers.tgt.clearLayers();
    var id, i, m, ic, L2 = { tree: 'T', ob: 'OB', overlap: 'X', note: 'N' };
    for (id in pins) {
      if (!pins.hasOwnProperty(id)) { continue; }
      if (id.indexOf(':new-') > 0 && st.view === 'pins') {
        (function (nid) { var nm = L.marker(pins[nid], { icon: L.divIcon({ className: 'pin bk', html: '<span>' + esc(tlabel(nid.replace(':new-', ':'))) + '</span>', iconSize: [90, 26], iconAnchor: [45, 13] }), draggable: st.view === 'pins', keyboard: false }).addTo(layers.pins); nm.on('dragend', function (ev) { var q = ev.target.getLatLng(); setTimeout(function () { movePoint(nid, q.lat, q.lng); }, 0); }); })(id);
      }
    }
    if (st.unused) { drawUnused(); }
    $('lgun').hidden = !st.unused;
    for (i = 0; i < marks.length; i++) {
      m = marks[i]; ic = L.divIcon({ className: 'pin mk', html: '<span>' + L2[m.kind] + '</span>', iconSize: [22, 22], iconAnchor: [11, 11] });
      L.marker([m.lat, m.lon], { icon: ic, interactive: false, keyboard: false }).addTo(layers.marks);
    }
    if (st.view === 'pins' && st.tgt) {
      var t = tgtObj(st.tgt), pos = t ? tpos(t) : null;
      if (pos) { var tid = st.tgt, tm = L.marker(pos, { icon: L.divIcon({ className: 'pin bk', html: '<span>' + esc(tname(tid)) + '</span>', iconSize: [120, 26], iconAnchor: [60, 13] }), draggable: true, keyboard: false, zIndexOffset: 1200 }).addTo(layers.tgt); tm.bindTooltip('Drag to move', { direction: 'top', offset: [0, -14] }); tm.on('dragend', function (ev) { var q = ev.target.getLatLng(); setTimeout(function () { movePoint(tid, q.lat, q.lng); }, 0); }); }
    }
    if (st.view === 'pins' && st.pf === 'dup' && !st.tgt && st.pair) {
      var pts2 = [];
      st.pair.split('|').forEach(function (x) { var o = tgtObj(x), q = o ? tpos(o) : null; if (q) { pts2.push(q); L.marker(q, { icon: L.divIcon({ className: 'pin bk', html: '<span>' + esc(tname(x)) + '</span>', iconSize: [120, 26], iconAnchor: [60, pts2.length > 1 ? -2 : 28] }), interactive: false, keyboard: false }).addTo(layers.tgt); L.circleMarker(q, { radius: 6, color: '#1d1812', weight: 2, fillColor: '#c9b4f0', fillOpacity: 1, interactive: false }).addTo(layers.tgt); } });
      if (st.pairFit && pts2.length) { st.pairFit = false; map.fitBounds(L.latLngBounds(pts2), { padding: [90, 90], maxZoom: 19, animate: false }); }
    }
    $('lgsw').hidden = !((st.view === 'route' && st.sel >= 0) || st.view === 'build'); $('lgpast').hidden = !(st.view === 'hist' && st.hd);
    document.body.setAttribute('data-place', (st.view === 'pins' && (st.tgt || st.pf === 'marks' || st.pf === 'new')) || (st.view === 'build' && st.cr) ? '1' : '0'); document.body.setAttribute('data-view', st.view);
    $('ret').hidden = !((st.view === 'pins' && (st.tgt || st.pf === 'marks' || st.pf === 'new')) || (st.view === 'build' && st.cr));
  }
  function tgtObj(id) { var a = targets(), i; for (i = 0; i < a.length; i++) { if (a[i].id === id) { return a[i]; } } return null; }
  function placeAt(lat, lon) {
    if (st.pf === 'new' && st.nn) {
      var nid2 = (st.nk === 'bsk' ? 'bsk:' : 'pad:') + 'new-' + st.nn.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); pins[nid2] = [lat, lon]; pushPin(nid2, 'point', lat, lon);
    } else if (st.pf === 'marks' && !st.tgt) {
      var mm = { id: 'mark:' + st.mk + ':' + Date.now(), kind: st.mk, lat: lat, lon: lon }; marks.push(mm); pushPin(mm.id, mm.kind, lat, lon);
    } else if (st.tgt) {
      pins[st.tgt] = [lat, lon]; pushPin(st.tgt, 'point', lat, lon); if (MG.at[st.tgt]) { mgSet('at', st.tgt, null); saveMG(); } applyPins();
    } else { return; }
    savePinsLocal(); st.placed = true; renderAll();
  }
  function movePoint(id, lat, lon) { pins[id] = [lat, lon]; pushPin(id, 'point', lat, lon); if (MG.at[id]) { mgSet('at', id, null); saveMG(); } applyPins(); savePinsLocal(); histRel = dates.map(function (x) { return grade(seq[x]).rel; }); renderAll(); }
  function delMark(id) { var i; for (i = 0; i < marks.length; i++) { if (marks[i].id === id) { marks.splice(i, 1); } } sb('DELETE', '?id=eq.' + encodeURIComponent(id), null, function () { /* best effort */ }); savePinsLocal(); renderAll(); }
  function marksOn(h) {
    var out = { tree: 0, ob: 0, overlap: 0 }, g = h.geo, i, a, b, m;
    if (!g) { return out; }
    a = ll(g.p); b = ll(g.b);
    for (i = 0; i < marks.length; i++) { m = marks[i]; if (out[m.kind] !== undefined && pd(mxy([m.lat, m.lon]), a, b) < 10) { out[m.kind]++; } }
    return out;
  }
  function pinsHtml() {
    var h = sheetHead('Locations', st.tgt ? true : false, 'List'), i, a, t, pos, d, label;
    if (!st.tgt) { h += '<div class="chips"><button type="button" data-pf="need" aria-pressed="' + (st.pf === 'need') + '">Needs location</button><button type="button" data-pf="all" aria-pressed="' + (st.pf === 'all') + '">All</button><button type="button" data-pf="marks" aria-pressed="' + (st.pf === 'marks') + '">Trees and OB</button><button type="button" data-pf="dup" aria-pressed="' + (st.pf === 'dup') + '">Review ' + (reviewPairs('pad:').length + reviewPairs('bsk:').length) + '</button><button type="button" data-pf="ret" aria-pressed="' + (st.pf === 'ret') + '">Retired ' + targets().filter(function (x) { return x.ret; }).length + '</button><button type="button" data-pf="new" aria-pressed="' + (st.pf === 'new') + '">Add new</button></div>'; }
    if (st.pf === 'dup' && !st.tgt) { return dupHtml(h); }
    if (st.tgt) {
      t = tgtObj(st.tgt); pos = t ? tpos(t) : null;
      h += '<div class="facts"><strong>' + (st.tgt.indexOf('bsk:') === 0 ? 'Basket' : 'Pad') + ' · ' + esc(tname(st.tgt)) + '</strong><span>' + (ppos(st.tgt) ? 'Moved by you' : t && t.need === 2 ? 'No location' : t && t.need === 1 ? 'Approximate' : 'Mapped') + '</span>' + (pos ? '<span>' + pos[0].toFixed(6) + ', ' + pos[1].toFixed(6) + '</span>' : '') + (st.sync ? '<span>' + st.sync + '</span>' : '') + '</div>';
      h += '<div class="tools-bar"><button type="button" class="pri" data-a="place">Place at crosshair</button><button type="button" data-a="here"' + (me ? '' : ' disabled') + '>My location</button><button type="button" data-a="list">List</button></div>';
      if (t) { h += manageHtml(t); }
      if (t) { h += '<div class="sub">Used by</div><div class="list">'; for (i = 0; i < t.holes.length && i < 6; i++) { h += '<div class="row"><span class="l">' + esc(short(t.holes[i])) + '</span><span class="v">P' + H[t.holes[i]].par + '</span><span class="v"></span><span class="v"></span></div>'; } h += '</div>'; }
      return h;
    }
    if (st.pf === 'new') {
      var nid, nl = [];
      h += '<div class="chips"><button type="button" data-nk="pad" aria-pressed="' + (st.nk !== 'bsk') + '">Pad</button><button type="button" data-nk="bsk" aria-pressed="' + (st.nk === 'bsk') + '">Basket</button></div>';
      h += '<div class="tools-bar"><input id="nn" type="text" placeholder="Name" aria-label="Point name" value="' + esc(st.nn || '') + '" autocomplete="off"></div>';
      h += '<div class="tools-bar"><button type="button" class="pri" data-a="place"' + (st.nn ? '' : ' disabled') + '>Place at crosshair</button><button type="button" data-a="here"' + (me && st.nn ? '' : ' disabled') + '>My location</button></div><div class="list">';
      for (nid in pins) { if (pins.hasOwnProperty(nid) && nid.indexOf(':new-') > 0) { nl.push(nid); } }
      for (i = 0; i < nl.length; i++) { h += '<div class="row"><span class="l">' + esc(tlabel(nl[i].replace(':new-', ':'))) + '</span><span class="v">' + pins[nl[i]][0].toFixed(5) + ', ' + pins[nl[i]][1].toFixed(5) + '</span><span class="v"></span><span class="v"></span></div>'; }
      return h + '</div>';
    }
    if (st.pf === 'marks') {
      var ks = [['tree', 'Tree'], ['ob', 'OB'], ['overlap', 'Overlap'], ['note', 'Note']];
      h += '<div class="chips">'; for (i = 0; i < ks.length; i++) { h += '<button type="button" data-mk="' + ks[i][0] + '" aria-pressed="' + (st.mk === ks[i][0]) + '">' + ks[i][1] + '</button>'; } h += '</div>';
      h += '<div class="tools-bar"><button type="button" class="pri" data-a="place">Place at crosshair</button><button type="button" data-a="here"' + (me ? '' : ' disabled') + '>My location</button></div><div class="list">';
      for (i = marks.length - 1; i >= 0 && i > marks.length - 40; i--) { h += '<div class="row"><span class="l">' + marks[i].kind + ' ' + marks[i].lat.toFixed(5) + ', ' + marks[i].lon.toFixed(5) + '</span><span class="v"></span><span class="v"></span><button type="button" class="v" data-md="' + esc(marks[i].id) + '">Delete</button></div>'; }
      return h + '</div>';
    }
    var all0 = targets(), kd = st.tk === 'bsk' ? 'bsk:' : 'pad:', cn = { 'pad:': 0, 'bsk:': 0 }, kk, rs = st.pf === 'ret', need = st.pf === 'need', lq = (st.lq || '').toLowerCase();
    function shown(x) { return rs ? x.ret : !x.ret && (!need || x.need > 0); }
    all0.forEach(function (x) { kk = x.id.slice(0, 4); if (shown(x)) { cn[kk]++; } });
    h += '<div class="chips"><button type="button" data-tk="pad" aria-pressed="' + (kd === 'pad:') + '">Pads ' + cn['pad:'] + '</button><button type="button" data-tk="bsk" aria-pressed="' + (kd === 'bsk:') + '">Baskets ' + cn['bsk:'] + '</button><button type="button" data-a="lsort">' + (st.lsort === 'name' ? 'Sorted: name' : 'Sorted: nearest') + '</button></div>';
    h += '<div class="tools-bar"><input id="lq" type="search" placeholder="Search" aria-label="Search locations" value="' + esc(st.lq || '') + '" autocomplete="off"></div>';
    a = all0.filter(function (x) { return x.id.indexOf(kd) === 0 && shown(x) && (!lq || (tname(x.id) + ' ' + x.id).toLowerCase().indexOf(lq) >= 0); });
    a.forEach(function (x) { var q = tpos(x); x.dist = me && q ? mdist([me.lat, me.lon], q) : null; });
    a.sort(function (x, y) { if (st.lsort !== 'name') { if (x.dist !== null && y.dist !== null) { return x.dist - y.dist; } if (y.need !== x.need) { return y.need - x.need; } } var u = tname(x.id).toLowerCase(), v = tname(y.id).toLowerCase(); return u < v ? -1 : u > v ? 1 : 0; });
    h += '<div class="list">';
    for (i = 0; i < a.length && i < 150; i++) {
      t = a[i]; h += '<button type="button" class="hr nobdg" data-t="' + esc(t.id) + '"><span class="mid"><b>' + esc(tname(t.id)) + '</b><small class="' + (t.need === 2 ? 'pos' : '') + '">' + prov(t) + ' · ' + t.holes.length + (t.holes.length === 1 ? ' hole' : ' holes') + (t.dist !== null ? ' · ' + Math.round(t.dist) + ' m away' : '') + '</small></span><span class="chev" aria-hidden="true">&rsaquo;</span></button>';
    }
    if (!a.length) { h += '<div class="empty">-</div>'; }
    return h + '</div>';
  }
  function prov(t) { return t.need === -1 ? 'Moved by you' : t.need === 2 ? 'No location' : t.need === 1 ? 'Approximate' : 'Mapped'; }
  function refText(id) { var r = refs(id); return tname(id) + ': layout ' + (r.cur.length ? r.cur.join(', ') : 'none') + ' · draft ' + (r.draft.length ? r.draft.join(', ') : 'none') + ' · past rounds ' + r.past; }
  function manageHtml(t) {
    var id = t.id, h = '', r = refs(id), others, o, x, al = Object.keys(MG.m).filter(function (k) { return canon(k) === id; });
    if (!t.ret) {
      h += '<div class="sub">Name</div><div class="tools-bar"><input id="rn" type="text" aria-label="Name" value="' + esc(st.rn === undefined ? tname(id) : st.rn) + '" autocomplete="off"><button type="button" data-a="rename">Rename</button></div>';
      others = targets().filter(function (q) { return q.id !== id && q.id.slice(0, 4) === id.slice(0, 4) && !q.ret; }).sort(function (a, b) { return tname(a.id) < tname(b.id) ? -1 : 1; });
      var here = tpos(t);
      h += '<div class="sub">Merge</div><div class="fld one"><select id="mw" aria-label="Merge with">' + opt('', 'Merge with', !st.mw);
      others.forEach(function (q) { var p = tpos(q); h += opt(q.id, tname(q.id) + (here && p ? ' · ' + Math.round(mdist(here, p) * 3.28084) + ' ft' : ''), st.mw === q.id); });
      h += '</select></div>';
      x = st.mw && st.mw !== id ? tgtObj(st.mw) : null;
      if (x && !x.ret) {
        var kn = st.kn === x.id ? x.id : id, ks = st.ks === x.id ? x.id : st.ks === id ? id : kn;
        h += '<div class="sub">Keep name</div><div class="chips">';
        [id, x.id].forEach(function (z) { h += '<button type="button" data-kn="' + esc(z) + '" aria-pressed="' + (kn === z) + '">' + esc(tname(z)) + '</button>'; });
        h += '</div><div class="sub">Keep spot</div><div class="chips">';
        [t, x].forEach(function (z) { var p = tpos(z); h += '<button type="button" data-ks="' + esc(z.id) + '" aria-pressed="' + (ks === z.id) + '"' + (p ? '' : ' disabled') + '>' + esc(tname(z.id)) + ' · ' + prov(z) + '</button>'; });
        h += '</div><div class="facts"><span>' + esc(refText(id)) + '</span><span>' + esc(refText(x.id)) + '</span></div><div class="tools-bar"><button type="button" class="pri" data-a="mgo">Merge into ' + esc(tname(kn)) + '</button><button type="button" data-a="mx">Cancel</button></div>';
      }
    }
    if (al.length) { h += '<div class="sub">Merged here</div><div class="list">'; al.forEach(function (k) { h += '<div class="row"><span class="l">' + esc(tname(k)) + '</span><span class="v"></span><span class="v"></span><button type="button" class="v" data-um="' + esc(k) + '">Unmerge</button></div>'; }); h += '</div>'; }
    o = r.cur.length || r.draft.length;
    h += '<div class="facts"><span>' + esc(refText(id)) + '</span></div><div class="tools-bar">' + (t.ret ? '<button type="button" class="pri" data-a="restore">Restore</button>' : '<button type="button" data-a="retire"' + (o ? ' disabled' : '') + '>Retire</button>') + '</div>';
    if (o && !t.ret) { h += '<div class="facts"><span class="pos">In use. Replace those holes to retire.</span></div>'; }
    return h;
  }
  var XM = null;
  function conflictTable() {
    var X = [], i, j, gi, gj;
    for (i = 0; i < 18; i++) { X.push([]); }
    for (i = 0; i < 18; i++) {
      for (j = 0; j < 18; j++) {
        gi = H[st.slots[i].id].geo; gj = H[st.slots[j].id].geo;
        X[i][j] = i !== j && gi && gj && (gi.b === gj.b || segX(ll(gi.p), ll(gi.b), ll(gj.p), ll(gj.b))) ? 1 : 0;
      }
    }
    return X;
  }
  function startPlan(n) {
    var i, g, X, S = [], W, best = null, bc = 1e9, idx = [], wrap;
    for (i = 0; i < 18; i++) { g = H[st.slots[i].id].geo; if (!g) { return null; } S.push(walk(GEO.park, g.p)); }
    X = conflictTable(); wrap = walk(H[st.slots[17].id].geo.b, H[st.slots[0].id].geo.p);
    function cost(c) {
      var t, a, b, k = 0, cf = 0, w = 0;
      for (a = 0; a < c.length; a++) { w += S[c[a]] + (c[a] > 0 ? wrap : 0); }
      for (t = 0; t < 18; t++) { for (a = 0; a < c.length; a++) { for (b = a + 1; b < c.length; b++) { cf += X[(c[a] + t) % 18][(c[b] + t) % 18]; } } }
      return { cf: cf, w: w, c: cf * 10 + w };
    }
    function rec(start, c) {
      if (c.length === n) { var r = cost(c); if (r.c < bc) { bc = r.c; best = { starts: c.slice(), cf: r.cf, w: r.w }; } return; }
      for (var k = start; k < 18; k++) { c.push(k); rec(k + 1, c); c.pop(); }
    }
    rec(0, []);
    if (best) { best.S = S; best.wrap = wrap; }
    return best;
  }

  var MG = { m: {}, no: [], nm: {}, at: {}, rt: {}, np: {}, u: {}, t: {} }, MGK = 'hbnf-studio-merge', DDC = null, MF = ['m', 'nm', 'at', 'rt', 'np', 'u'];
  window.addEventListener('scroll', function () { if (window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop) { window.scrollTo(0, 0); document.body.scrollTop = 0; document.documentElement.scrollTop = 0; } }, false);
  function normMG(r) { r = r || {}; return { m: r.m || {}, no: (r.no || []).slice(), nm: r.nm || {}, at: r.at || {}, rt: r.rt || {}, np: r.np || {}, u: r.u || {}, t: r.t || {} }; }
  function mgStr(g) { var o = [], i; function add(f) { Object.keys(g[f]).sort().forEach(function (k) { o.push(f + k + JSON.stringify(g[f][k])); }); } for (i = 0; i < MF.length; i++) { add(MF[i]); } add('t'); return o.join() + g.no.slice().sort().join(); }
  function mergeMG(remote) {
    if (!remote) { return false; }
    var r = normMG(remote), before = mgStr(MG);
    MF.forEach(function (f) {
      var keys = {}, k, a, b;
      for (k in MG[f]) { keys[k] = 1; } for (k in r[f]) { keys[k] = 1; }
      for (k in keys) {
        a = MG.t[f + ':' + k] || 0; b = r.t[f + ':' + k] || 0;
        if (b > a || (b === a && MG[f][k] === undefined)) { if (r[f][k] === undefined) { delete MG[f][k]; } else { MG[f][k] = r[f][k]; } }
      }
    });
    var all = {}; MG.no.concat(r.no).forEach(function (z) { all[z] = 1; });
    for (var z in r.t) { if (z.indexOf('no:') === 0) { all[z.slice(3)] = 1; } }
    MG.no = Object.keys(all).filter(function (p) { var a = MG.t['no:' + p] || 0, b = r.t['no:' + p] || 0, here = MG.no.indexOf(p) >= 0, there = r.no.indexOf(p) >= 0; return b > a ? there : a > b ? here : here || there; });
    for (var t in r.t) { if ((r.t[t] || 0) > (MG.t[t] || 0)) { MG.t[t] = r.t[t]; } }
    breakCycles(); DDC = null;
    return mgStr(MG) !== before;
  }
  function breakCycles() { Object.keys(MG.m).sort().forEach(function (id) { var seen = {}, x = id; while (MG.m[x]) { if (seen[x]) { delete MG.m[x]; return; } seen[x] = 1; x = MG.m[x]; } }); }
  function loadMG() { try { var r = JSON.parse(localStorage.getItem(MGK) || 'null'); if (r) { MG = normMG(r); } } catch (e) { /* none */ } DDC = null; }
  function storeMG() { try { localStorage.setItem(MGK, JSON.stringify(MG)); } catch (e) { /* storage unavailable */ } DDC = null; }
  function saveMG() { storeMG(); save(); }
  function stamp(k) { MG.t[k] = Math.max(Date.now(), (MG.t[k] || 0) + 1); }
  function mgSet(f, k, v) { if (v === null || v === undefined) { delete MG[f][k]; } else { MG[f][k] = v; } stamp(f + ':' + k); }
  function pairKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }
  function setDismiss(a, b, on) {
    var k = pairKey(a, b), i = MG.no.indexOf(k), x = k.split('|'), p, q;
    if (on) { if (i < 0) { MG.no.push(k); } p = tpos(tgtObj(x[0]) || { id: x[0], holes: [] }); q = tpos(tgtObj(x[1]) || { id: x[1], holes: [] }); mgSet('np', k, p && q ? [p, q] : null); }
    else { if (i >= 0) { MG.no.splice(i, 1); } mgSet('np', k, null); }
    stamp('no:' + k); saveMG();
  }
  function ppos(id) { return MG.at[id] || pins[id] || null; }
  function isRet(h) { return !!(MG.rt[canon(h.pad)] || MG.rt[canon(h.bsk)]); }
  function usable(id) { return id && (id.indexOf('pad:') === 0 || id.indexOf('bsk:') === 0) && id.indexOf('unresolved') < 0 && id.indexOf('temp') < 0; }
  function refs(id) {
    var o = { cur: [], draft: [], past: 0 }, i, d = D();
    function uses(hid) { var h = H[hid]; return h && (canon(h.pad) === id || canon(h.bsk) === id); }
    for (i = 0; i < st.slots.length; i++) { if (uses(st.slots[i].id)) { o.cur.push(i + 1); } if (d[i] && uses(d[i].id)) { o.draft.push(i + 1); } }
    dates.forEach(function (x) { if (seq[x].some(function (q) { return uses(q.id); })) { o.past++; } });
    return o;
  }
  function mergeInto(from, into, spot) {
    from = canon(from); into = canon(into);
    if (from === into || from.slice(0, 4) !== into.slice(0, 4) || MG.rt[from] || MG.rt[into]) { return false; }
    var prev = MG.at[into] || null, took = false, t, p;
    if (spot === from) { t = tgtObj(from); p = t ? tpos(t) : null; if (p) { mgSet('at', into, [p[0], p[1]]); took = true; } }
    mgSet('u', from, { into: into, at: took, pat: prev });
    mgSet('m', from, into); applyPins(); saveMG(); return true;
  }
  function unmerge(id) { var u = MG.u[id]; mgSet('m', id, null); if (u && u.at) { mgSet('at', u.into, u.pat); } mgSet('u', id, null); applyPins(); saveMG(); }
  function canon(id) { var n = 0; while (MG.m[id] && n++ < 8) { id = MG.m[id]; } return id; }
  function hkey(h) { return canon(h.pad) + '>' + canon(h.bsk); }
  function isDup(h) {
    var i, b, k;
    if (isRet(h)) { return true; }
    if (!DDC || DDC.n !== pool.length) { DDC = { n: pool.length, b: {} }; for (i = 0; i < pool.length; i++) { k = hkey(pool[i]); b = DDC.b[k]; if (!b || pool[i].n > b.n || (pool[i].n === b.n && !MG.m[pool[i].pad] && MG.m[b.pad])) { DDC.b[k] = pool[i]; } } }
    return DDC.b[hkey(h)] !== h;
  }
  function words(id) { return tname(id).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\b(near|mod|path|temp|by|the)\b/g, ' ').replace(/\s+/g, ' ').trim(); }
  function reviewPairs(kind, dismissed) {
    var ts = targets().filter(function (t) { return t.id.indexOf(kind) === 0 && !t.ret; }), out = [], i, j, a, b, p, q, d, k, same, np, no;
    for (i = 0; i < ts.length; i++) { ts[i].xy = tpos(ts[i]); ts[i].w = words(ts[i].id); }
    for (i = 0; i < ts.length; i++) {
      for (j = i + 1; j < ts.length; j++) {
        a = ts[i]; b = ts[j]; p = a.xy; q = b.xy; d = p && q ? mdist(p, q) : null; same = a.w && a.w === b.w;
        if (!(same || (d !== null && d <= 25))) { continue; }
        if (a.id > b.id) { a = ts[j]; b = ts[i]; }
        k = pairKey(a.id, b.id); np = MG.np[k]; no = MG.no.indexOf(k) >= 0;
        if (no && np && a.xy && b.xy && (mdist(a.xy, np[0]) > 7.5 || mdist(b.xy, np[1]) > 7.5)) { no = false; }
        if (no !== !!dismissed) { continue; }
        out.push({ k: k, a: a, b: b, d: d, band: d === null ? 'Similar name, unmapped' : d <= 7.5 ? 'Close' : d <= 25 ? 'Nearby' : 'Similar name' });
      }
    }
    out.sort(function (x, y) { return (x.d === null ? 1e9 : x.d) - (y.d === null ? 1e9 : y.d) || (x.k < y.k ? -1 : 1); });
    return out;
  }
  function dupHtml(h) {
    var kd = st.tk === 'bsk' ? 'bsk:' : 'pad:', ps = reviewPairs(kd, st.dshow), i, p;
    h += '<div class="chips"><button type="button" data-tk="pad" aria-pressed="' + (kd === 'pad:') + '">Pads ' + reviewPairs('pad:', st.dshow).length + '</button><button type="button" data-tk="bsk" aria-pressed="' + (kd === 'bsk:') + '">Baskets ' + reviewPairs('bsk:', st.dshow).length + '</button><button type="button" data-a="dshow" aria-pressed="' + !!st.dshow + '">Dismissed</button></div>';
    for (i = 0; i < ps.length && i < 60; i++) {
      p = ps[i];
      h += '<div class="card"><div class="ttl"><b>' + esc(tname(p.a.id)) + ' / ' + esc(tname(p.b.id)) + '</b></div><div class="facts"><span>' + p.band + (p.d === null ? '' : ' · ' + Math.round(p.d * 3.28084) + ' ft') + '</span><span>' + prov(p.a) + ' / ' + prov(p.b) + '</span></div>';
      h += '<div class="tools-bar"><button type="button" data-pm="' + esc(p.k) + '" aria-pressed="' + (st.pair === p.k) + '">Map</button>' + (st.dshow ? '<button type="button" data-pu="' + esc(p.k) + '">Review again</button>' : '<button type="button" class="pri" data-pg="' + esc(p.k) + '">Merge</button><button type="button" data-pn="' + esc(p.k) + '">Not the same</button>') + '</div></div>';
    }
    if (!ps.length) { h += '<div class="empty">-</div>'; }
    return h;
  }
  function posKey(id) { return ppos(id) ? 'pin:' + id : (PN[id] || null); }
  function slug(n) { return n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function customs() { try { return JSON.parse(localStorage.getItem(CKEY) || '[]'); } catch (e) { return []; } }
  function mkHole(pad, bsk, par) {
    var id = 'H:' + pad + '>' + bsk, bn = tname(bsk);
    if (H[id]) { return H[id]; }
    H[id] = { id: id, label: tname(pad) + ' to ' + (/^\d+$/.test(bn) ? 'Basket ' : '') + bn, par: par, pad: pad, bsk: bsk, n: 0, avg: undefined, rel: undefined, bird: undefined, bog: 0, occ: [], syn: true };
    return H[id];
  }
  function loadCustoms() {
    var c = customs(), i, h;
    for (i = 0; i < c.length; i++) { h = mkHole(c[i].pad, c[i].bsk, c[i].par); if (pool.indexOf(h) < 0) { pool.push(h); } }
  }
  function keepHole(h) {
    var c = customs(), i;
    if (!h.syn) { return; }
    if (pool.indexOf(h) < 0) { pool.push(h); }
    for (i = 0; i < c.length; i++) { if (c[i].pad === h.pad && c[i].bsk === h.bsk) { return; } }
    c.push({ pad: h.pad, bsk: h.bsk, par: h.par }); try { localStorage.setItem(CKEY, JSON.stringify(c)); } catch (e) { /* storage unavailable */ }
  }
  function D() { var o = [], i; for (i = 0; i < 18; i++) { o.push(st.draft && st.draft[i] && H[st.draft[i].id] ? st.draft[i] : null); } return o; }
  function cnt() { var c = 0, i; for (i = 0; i < 18; i++) { if (st.draft && st.draft[i] && H[st.draft[i].id]) { c++; } } return c; }
  function dc(excl, at, ins) {
    var d = D(), s0 = [], ix = [], i, item, pos = -1;
    for (i = 0; i < 18; i++) {
      item = i === at && ins ? ins : (i === excl ? null : d[i]);
      if (i === at && ins) { pos = s0.length; }
      if (item) { s0.push(item); ix.push(i + 1); }
    }
    return { s: s0, ix: ix, pos: pos };
  }
  function prevKey(i) { var d = D(), j; for (j = i - 1; j >= 0; j--) { if (d[j] && H[d[j].id].geo) { return H[d[j].id].geo.b; } } return GEO.park; }
  function usedB() { var m = {}, d = D(), i; for (i = 0; i < 18; i++) { if (d[i] && i !== st.bi) { m[canon(H[d[i].id].bsk)] = 1; } } return m; }
  function padList() {
    var seen = {}, out = [], i, k, lk = prevKey(st.bi), pid;
    function add(x) { if (!x || seen[x] || MG.m[x] || MG.rt[x] || x.indexOf('unresolved') >= 0 || x.indexOf('temp') >= 0 || x.indexOf('pad:') !== 0) { return; } seen[x] = 1; k = posKey(x); if (k) { out.push({ id: x, w: walk(lk, k) }); } }
    for (i = 0; i < pool.length; i++) { add(canon(pool[i].pad)); }
    for (pid in pins) { if (pins.hasOwnProperty(pid)) { add(pid); } }
    out.sort(function (a, b) { return a.w - b.w; });
    return out;
  }
  function bskList(padId) {
    var seen = {}, ub = usedB(), pair = [], rest = [], i, x, k, pk = posKey(padId), pid, d;
    function add(b) {
      if (!b || seen[b] || MG.m[b] || MG.rt[b] || ub[b] || b.indexOf('unresolved') >= 0 || b.indexOf('temp') >= 0 || b.indexOf('bsk:') !== 0) { return; }
      seen[b] = 1; k = posKey(b); if (!k) { return; }
      d = pk ? mdist(ll2(pk), ll2(k)) * 3.28084 : 0;
      x = { id: b, d: d, played: pool.some(function (q) { return canon(q.pad) === padId && canon(q.bsk) === b; }) };
      (x.played ? pair : rest).push(x);
    }
    for (i = 0; i < pool.length; i++) { add(canon(pool[i].bsk)); }
    for (pid in pins) { if (pins.hasOwnProperty(pid)) { add(pid); } }
    pair.sort(function (a, b) { return a.d - b.d; }); rest.sort(function (a, b) { return a.d - b.d; });
    return { pair: pair, rest: rest };
  }
  function selHole() {
    var b = st.bp, h, id;
    if (!b.pad || !b.bsk) { return null; }
    id = 'H:' + b.pad + '>' + b.bsk; h = H[id];
    if (!h) { var ex = pool.filter(function (q) { return canon(q.pad) === b.pad && canon(q.bsk) === b.bsk; }).sort(function (x, y) { return y.n - x.n; })[0]; if (ex) { h = ex; } }
    if (!h) { h = mkHole(b.pad, b.bsk, b.par); applyPins(); }
    return h;
  }
  function defPar(h) { return h.geo && !h.syn ? h.par : h.geo && h.geo.d * 3.28084 > 350 ? 4 : 3; }
  function flow(id, par) {
    var c = dc(-1, st.bi, { id: id, par: par }), gs = geoStats(c.s), g = H[id].geo, n = c.pos;
    return { i: gs.legs[n], o: n < c.s.length - 1 ? gs.legs[n + 1] : 0, x: (gs.hit[n] || []).length, e: g && st.bi >= 15 ? walk(g.b, GEO.park) : 0 };
  }
  function suggestNext() {
    var d = D(), ub = usedB(), used = {}, out = [], i, p, fl, c, par4 = 0, pv = null, pv2 = null, j;
    for (i = 0; i < 18; i++) { if (d[i] && i !== st.bi) { used[d[i].id] = 1; if (d[i].par >= 4) { par4++; } } }
    for (j = st.bi - 1; j >= 0; j--) { if (d[j]) { if (!pv) { pv = d[j]; } else if (!pv2) { pv2 = d[j]; } } }
    for (i = 0; i < pool.length; i++) {
      p = pool[i]; if (!p.geo || used[p.id] || ub[canon(p.bsk)] || p.syn || isDup(p)) { continue; }
      fl = flow(p.id, p.par);
      c = fl.i + fl.o * 0.7 + 2 * fl.x + (st.bi >= 15 ? fl.e * (st.bi >= 16 ? 1 : 0.4) : 0);
      if (pv && pv2 && pv.par === p.par && pv2.par === p.par) { c += 0.8; }
      if (p.par >= 4 && par4 >= 3) { c += 1.5; }
      if (pv && holeRel(pv) > 0.1 && exp(p, p.par) - p.par > 0.1) { c += 0.6; }
      if (USE[p.id] && USE[p.id].last === 0) { c += 0.5; }
      if (!tested(p)) { c += 0.7; }
      if (pv && pv.par !== p.par) { c -= 0.2; }
      if (!USE[p.id]) { c -= 0.2; }
      out.push({ p: p, c: c, fl: fl, pv: pv });
    }
    out.sort(function (a, b) { return a.c - b.c; });
    out = out.slice(0, 5);
    var minW = 1e9, minE = 1e9, maxB = -1, iw = -1, ie = -1, ib = -1;
    out.forEach(function (o, k) {
      var e = exp(o.p, o.p.par) - o.p.par;
      if (o.fl.i < minW) { minW = o.fl.i; iw = k; } if (e < minE) { minE = e; ie = k; } if (bird(o.p) > maxB) { maxB = bird(o.p); ib = k; }
    });
    out.forEach(function (o, k) {
      o.tags = k === 0 ? ['Best fit'] : [];
      if (k === iw && k !== 0) { o.tags.push('Shortest walk'); } if (k === ie && o.tags.length < 2) { o.tags.push('Easiest'); } if (k === ib && o.tags.length < 2) { o.tags.push('Most birdies'); }
      if (o.pv && o.pv.par !== o.p.par && o.tags.length < 2) { o.tags.push('Par change'); }
      if (!USE[o.p.id] && o.tags.length < 2) { o.tags.push('New hole'); }
    });
    return out;
  }
  function nextBlank(from) { var d = D(), i; for (i = from + 1; i < 18; i++) { if (!d[i]) { return i; } } for (i = 0; i < 18; i++) { if (!d[i]) { return i; } } return from; }
  function selSlot(i) {
    var d = D(), h;
    st.bi = i; st.cr = null; st.hover = null;
    if (d[i]) { h = H[d[i].id]; st.bp = { pad: h.pad, bsk: h.bsk, par: d[i].par }; } else { st.bp = { pad: '', bsk: '', par: 3 }; }
    st.focus = false;
  }
  function addDraft(id, par) {
    var h = H[id], d = D();
    if (!h) { return; }
    keepHole(h); d[st.bi] = { id: id, par: par }; st.draft = d; st.hover = null;
    if (cnt() === 18) {
      snap(); st.slots = d.slice(); st.draft = []; st.base = ''; st.lock = {}; baseGrade = grade(st.slots); st.view = 'route'; st.sel = -1; st.note = null; st.fit = true; renderBase();
    } else { selSlot(nextBlank(st.bi)); }
    save(); renderAll();
  }
  function startBuild() { $('base').value = ''; st.draft = D(); st.view = 'build'; st.sel = -1; st.prev = null; st.hd = null; st.tgt = null; selSlot(st.bi >= 0 && st.bi < 18 ? st.bi : nextBlank(-1)); st.fit = true; setCollapsed(false); renderAll(); }
  function opt(v, t, sel) { return '<option value="' + esc(v) + '"' + (sel ? ' selected' : '') + '>' + esc(t) + '</option>'; }
  function stripHtml() {
    var d = D(), i, h = '<div class="strip" role="group" aria-label="Holes">', cl0, par;
    for (i = 0; i < 18; i++) {
      par = d[i] ? d[i].par : 0;
      h += '<button type="button" class="sc' + (d[i] ? ' on' : '') + '" data-sl="' + i + '" aria-pressed="' + (st.bi === i) + '" aria-label="Hole ' + (i + 1) + (d[i] ? ', par ' + par : ', empty') + '"' + (d[i] ? ' style="background:' + relColor(holeRel(d[i]), tested(H[d[i].id])) + '"' : '') + '><b>' + (i + 1) + '</b>' + (d[i] ? '<small>P' + par + '</small>' : '') + '</button>';
    }
    return h + '</div>';
  }
  function buildHtml() {
    var d = D(), n = cnt(), c = dc(-1, -1, null), g = n ? grade(c.s) : null, h = sheetHead('New layout', false), i, b = st.bp, sh, pl, bl, fl, cur = d[st.bi];
    h += '<div class="ttl"><b>' + n + ' of 18 holes set</b><span><span id="cloud">' + (st.cloud === 'saved' ? 'Saved to cloud' : st.cloud === 'offline' ? 'Offline, saved on this device' : st.cloud === 'saving' ? 'Saving' : '') + '</span></span></div>';
    h += stripHtml();
    if (n) { h += '<div class="cards">' + statCell('Vs par', sg(g.rel, 1), 'holes set', '') + statCell('Walk', f(g.walk, 0) + ' min', 'holes set', '') + statCell('Overlaps', g.cross, 'crossing fairways', g.cross ? 'pos' : '') + statCell('Par', g.par, n + ' holes', '') + '</div>'; }
    h += '<div class="card"><div class="ttl"><b>Hole ' + (st.bi + 1) + (cur ? ': ' + esc(short(cur.id)) : '') + '</b><span>' + (cur ? 'Set' : 'Empty') + '</span></div>';
    if (st.cr) {
      h += '<div class="sub">New ' + (st.cr.k === 'pad' ? 'pad' : 'basket') + '</div><div class="tools-bar"><input id="cn" type="text" placeholder="Name" aria-label="Name" value="' + esc(st.cr.name) + '" autocomplete="off"></div>';
      h += '<div class="tools-bar"><button type="button" class="pri" data-a="crok"' + (st.cr.name ? '' : ' disabled') + '>Confirm crosshair location</button><button type="button" data-a="crme"' + (me && st.cr.name ? '' : ' disabled') + '>My location</button><button type="button" data-a="crx">Cancel</button></div>';
    } else {
      pl = padList();
      h += '<div class="sub">Pad</div><div class="fld"><select id="bpad" aria-label="Pad"><option value="">Choose pad</option>';
      for (i = 0; i < pl.length; i++) { h += opt(pl[i].id, tname(pl[i].id) + ' · ' + f(pl[i].w, 1) + ' min walk', b.pad === pl[i].id); }
      h += '</select><button type="button" data-a="newpad">New pad</button></div>';
      h += '<div class="sub">Basket</div><div class="fld"><select id="bbsk" aria-label="Basket"' + (b.pad ? '' : ' disabled') + '><option value="">Choose basket</option>';
      if (b.pad) {
        bl = bskList(b.pad);
        if (bl.pair.length) { h += '<optgroup label="Played from this pad">'; for (i = 0; i < bl.pair.length; i++) { h += opt(bl.pair[i].id, tname(bl.pair[i].id) + ' · ' + Math.round(bl.pair[i].d / 5) * 5 + ' ft', b.bsk === bl.pair[i].id); } h += '</optgroup>'; }
        h += '<optgroup label="Other baskets by distance">'; for (i = 0; i < bl.rest.length; i++) { h += opt(bl.rest[i].id, tname(bl.rest[i].id) + ' · ' + Math.round(bl.rest[i].d / 5) * 5 + ' ft', b.bsk === bl.rest[i].id); } h += '</optgroup>';
      }
      h += '</select><button type="button" data-a="newbsk">New basket</button></div>';
      sh = selHole();
      if (sh) {
        h += '<div class="sub">Par</div><div class="chips">';
        for (i = 3; i <= 5; i++) { h += '<button type="button" data-bpar="' + i + '" aria-pressed="' + (b.par === i) + '">Par ' + i + '</button>'; }
        h += '</div><div class="list nb">' + metHead();
        fl = sh.geo ? flow(sh.id, b.par) : null;
        h += holeRow(sh.id, b.par, { nb: true, pb: true, extra: sh.syn ? 'New combination · no history' : '' }) + '</div>';
        if (fl) { h += '<div class="facts"><span>Walk in ' + f(fl.i, 1) + ' min</span>' + (fl.o ? '<span>Walk out ' + f(fl.o, 1) + ' min</span>' : '') + '<span class="' + (fl.x ? 'pos' : '') + '">' + fl.x + ' overlap' + (fl.x === 1 ? '' : 's') + '</span></div>'; }
        h += '<div class="tools-bar"><button type="button" class="pri" data-a="dadd">' + (cur ? 'Replace hole ' : 'Set as hole ') + (st.bi + 1) + '</button>' + (cur ? '<button type="button" data-a="drm">Clear hole</button>' : '') + '</div>';
      } else if (cur) { h += '<div class="tools-bar"><button type="button" data-a="drm">Clear hole</button></div>'; }
    }
    h += '</div>';
    var sg0 = st.cr ? [] : suggestNext();
    if (!st.cr) { h += '<div class="card sug"><div class="ttl"><b>Suggested for hole ' + (st.bi + 1) + '</b><span>by flow and variety</span></div><div class="list nb">' + metHead();
    for (i = 0; i < sg0.length; i++) {
      h += holeRow(sg0[i].p.id, sg0[i].p.par, { nb: true, pb: true, attr: 'data-sg="' + esc(sg0[i].p.id) + '"', extra: sg0[i].tags.map(function (t) { return '<span class="tg' + (t === 'Best fit' ? ' top' : '') + '">' + t + '</span>'; }).join('') + 'Walk in ' + f(sg0[i].fl.i, 1) + ' min' + (sg0[i].fl.x ? ' · <span class="ox"><i>X</i>' + sg0[i].fl.x + ' overlap' + (sg0[i].fl.x > 1 ? 's' : '') + '</span>' : '') });
    }
    h += '</div></div>'; }
    if (n) { h += '<div class="tools-bar"><button type="button" data-a="dclr">Start over</button></div>'; }
    return h;
  }
  function startHtml() {
    var h = '<div class="ttl"><b>Starting holes</b><span>by number of cards</span></div><div class="chips">', i, p, k, g;
    for (i = 1; i <= 6; i++) { h += '<button type="button" data-sn="' + i + '" aria-pressed="' + (st.cards === i) + '">' + i + (i === 1 ? ' card' : ' cards') + '</button>'; }
    h += '</div>';
    if (st.cards) {
      p = startPlan(st.cards);
      if (!p) { return h + '<div class="empty">-</div>'; }
      h += '<div class="facts"><span>Overlap conflicts ' + p.cf + '</span><span>Total walk ' + f(p.w, 0) + ' min</span></div><div class="list">';
      for (k = 0; k < p.starts.length; k++) {
        i = p.starts[k]; h += '<div class="row num"><span class="n">' + (k + 1) + '</span><span class="l">Start hole ' + (i + 1) + ' ' + esc(short(st.slots[i].id)) + '</span><span class="v">' + f(p.S[i], 1) + ' min walk</span><span class="v"></span></div>';
      }
      h += '</div>';
      if (st.cards === 1 && p.starts[0] > 0) { h += '<button type="button" class="row" data-a="rot" data-s0="' + p.starts[0] + '"><span class="l">Rotate layout to start at hole ' + (p.starts[0] + 1) + '</span></button>'; }
    }
    if (me) {
      var bi = -1, bd = 1e9; for (i = 0; i < 18; i++) { g = H[st.slots[i].id].geo; if (g) { var dd2 = mdist([me.lat, me.lon], ll2(g.p)); if (dd2 < bd) { bd = dd2; bi = i; } } }
      if (bi >= 0) { h += '<div class="ttl"><b>Nearest hole to you</b></div><button type="button" class="row" data-i="' + bi + '"><span class="l">Hole ' + (bi + 1) + ' ' + esc(short(st.slots[bi].id)) + '</span><span class="v">' + Math.round(bd) + ' m</span><span class="v"></span><span class="v"></span></button>'; }
    }
    return h;
  }

  function buildUse() {
    var i, j, id, seen;
    USE = {};
    for (i = 0; i < dates.length; i++) {
      seen = {};
      for (j = 0; j < 18; j++) {
        id = seq[dates[i]][j].id; if (seen[id]) { continue; } seen[id] = 1;
        USE[id] = USE[id] || { n: 0, last: -1, dates: [] };
        USE[id].n++; USE[id].dates.push(dates[i]); if (USE[id].last < 0) { USE[id].last = i; }
      }
    }
  }
  function usedTxt(id) { var u = USE[id]; return (u ? u.n : 0) + '/' + dates.length; }
  function lastTxt(id) { var u = USE[id]; return u ? String(u.last) : 'New'; }
  function relTxt(id) { var o = H[id]; return tested(o) ? sg(o.rel, 2) : '-'; }

  function lastLbl(id) { var u = USE[id]; if (!u) { return 'New hole'; } return u.last === 0 ? 'Used last round' : 'Last used ' + u.last + (u.last === 1 ? ' round ago' : ' rounds ago'); }
  function ftLbl(h) { return h.geo ? ftOf(h) + ' ft' : 'Unmapped'; }
  function metHead() { return '<div class="mh"><span>Par</span><span>Length</span><span>Used</span><span>Last used</span></div>'; }
  function holeRow(id, par, o) {
    var h = H[id], ok = tested(h), col = relColor(exp(h, par) - par, ok), tag = o.attr ? 'button' : 'div', u = USE[id], ex = o.extra || '';
    var len = h.geo ? (h.geo.pf === 'a' || h.geo.bf === 'a' ? '<em class="est">est </em>' : '') + ftOf(h).replace('approx ', '') + ' ft' : 'Unmapped';
    var last = !u ? '<span class="pos">New</span>' : u.last === 0 ? 'Latest' : u.last + ' ago';
    return '<' + tag + ' type="' + (o.attr ? 'button' : '') + '" class="hr' + (o.nb && !o.pb ? ' nobdg' : '') + '" ' + (o.attr || '') + (o.role ? ' role="listitem"' : '') + '>' + (o.nb && !o.pb ? '' : '<span class="bdg" style="background:' + col + '">' + (o.pb ? 'P' + par : o.n !== undefined ? o.n : '') + '</span>') +
      '<span class="mid"><b>' + esc(short(id)) + '</b><span class="met"><span>' + par + '</span><span>' + len + '</span><span>' + usedTxt(id) + '</span><span>' + last + '</span></span>' + (ex ? '<small>' + ex + '</small>' : '') + '</span>' +
      (ok || !h.geo ? '<span class="rt"><b class="' + (ok ? cl(h.rel) : '') + '">' + (ok ? sg(h.rel, 2) : '-') + '</b><small>' + (ok ? 'avg vs par' : 'no data') + '</small></span>' : '<span class="rt"><b class="' + cl(exp(h, par) - par) + '">' + sg(exp(h, par) - par, 2) + '</b><small>model est</small></span>') + '<span class="chev" aria-hidden="true">' + (o.attr ? '&rsaquo;' : '') + '</span></' + tag + '>';
  }
  function histHtml() {
    var h, i, d, r, lay = enc.layouts || {}, sl;
    if (st.hd) {
      sl = seq[st.hd]; var g = grade(sl), rr = RD[st.hd];
      h = sheetHead(st.hd, true, 'History');
      h += '<div class="sub">' + esc((lay[st.hd] || {}).name || '') + '</div>';
      h += '<div class="cards">' + (rr ? statCell('Team avg', sg(rr.avg_rel, 1), 'to par, actual', '') + statCell('Best team', sg(rr.best_rel, 0), 'to par', '') + statCell('Teams', rr.teams, 'played', '') : statCell('Results', 'None yet', 'not scored', 'pos')) + statCell('Expected', sg(g.rel, 1), 'to par, model', '') + '</div>';
      h += '<div class="tools-bar"><button type="button" class="pri" data-a="loadh">Load into builder</button></div><div class="list">';
      h += metHead(); for (i = 0; i < 18; i++) { h += holeRow(sl[i].id, sl[i].par, { n: i + 1 }); }
      return h + '</div>';
    }
    h = sheetHead('Past layouts', false) + '<div class="list">';
    for (i = 0; i < dates.length; i++) {
      d = dates[i]; r = RD[d];
      h += '<button type="button" class="hr" data-h="' + d + '"><span class="bdg dot" style="background:' + (r ? relColor(r.avg_rel / 18 * 1, true) : '#9a9a9a') + '"></span><span class="mid"><b>' + d + '</b><small>Par ' + g18(seq[d]) + ' · ' + (r ? r.teams + ' teams · best ' + sg(r.best_rel, 0) : 'Not scored') + '</small></span><span class="rt"><b class="' + (r ? cl(r.avg_rel) : '') + '">' + (r ? sg(r.avg_rel, 1) : '-') + '</b><small>' + (r ? 'team avg' : '') + '</small></span><span class="chev" aria-hidden="true">&rsaquo;</span></button>';
    }
    return h + '</div>';
  }
  function g18(sl) { var t = 0, i; for (i = 0; i < sl.length; i++) { t += sl[i].par; } return t; }
  function sheetHead(title, back, backLabel) {
    return '<div class="ph">' + (back ? '<button type="button" class="bk" data-a="back" aria-label="Back">&lsaquo; ' + (backLabel || 'Layout') + '</button>' : '') + '<h2>' + esc(title) + '</h2></div>';
  }
  function statCell(label, val, sub, cls) { return '<div class="cell"><small>' + label + '</small><strong class="' + (cls || '') + '">' + val + '</strong><small class="sb ' + (cls || '') + '">' + (sub || '') + '</small></div>'; }
  function dd(x, y) { return Math.abs(x - y) < 0.05 ? null : x - y; }
  function dsub(d, unit) { return d === null ? 'same as start' : sg(d, 1) + (unit || '') + ' vs start'; }
  function scoreHtml(g, b) {
    var n = histRel.length + 1, h = '<div class="cards">' + statCell('Vs par', sg(g.rel, 1), dsub(dd(g.rel, b.rel)), cl(dd(g.rel, b.rel) || 0)) + statCell('Walk', f(g.walk, 0) + ' min', dsub(dd(g.walk, b.walk), ' min'), '') +
      statCell('Overlaps', g.cross, 'crossing fairways', g.cross ? 'pos' : '') + statCell('Difficulty', rank(g.rel) + ' of ' + n, '1 = easiest layout', '') + '</div>';
    if (st.more) {
      h += '<div class="cards">' + statCell('Expected score', f(g.exp, 1), 'team strokes', '') + statCell('Birdie chances', f(g.bird, 1), 'per round', '') + statCell('Front 9', sg(g.front, 1), 'to par', '') + statCell('Back 9', sg(g.back, 1), 'to par', '') +
        statCell('Hard holes', g.hard, '15%+ bogeys', '') + statCell('Par', g.par, 'total', '') + statCell('Untested', g.untested, 'few rounds played', g.untested ? 'pos' : '') + statCell('Throw', Math.round(g.ft / 10) * 10, 'feet total', '') + '</div>';
    }
    return h + '<button type="button" class="more" data-a="more" aria-expanded="' + st.more + '">' + (st.more ? 'Fewer stats' : 'More stats') + '</button>';
  }
  function routeHtml() {
    var g = grade(st.slots), b = baseGrade || g, cg = geoStats(st.slots), h = '', i, s;
    if (st.note) { h += '<div class="note"><span>' + esc(st.note.t) + '</span><strong class="' + cl(st.note.d) + '">' + sg(st.note.d, 1) + ' to par</strong><button type="button" data-a="undo">Undo</button></div>'; }
    h += '<div class="tools-bar"><button type="button" class="pri" data-a="newl">' + (cnt() ? 'Continue new layout ' + cnt() + '/18' : 'New layout') + '</button></div>';
    h += '<div class="ttl"><b>Your layout</b><span>18 holes · Par ' + g.par + '</span></div>' + scoreHtml(g, b) + '<div class="list" role="list">' + metHead();
    for (i = 0; i < 18; i++) {
      s = st.slots[i];
      h += holeRow(s.id, s.par, { n: i + 1, attr: 'data-i="' + i + '" aria-expanded="' + (st.sel === i) + '"', role: true, warn: !!cg.hit[i], extra: (cg.hit[i] ? '<span class="ox"><i>X</i>Overlaps hole ' + cg.hit[i].join(', ') + '</span>' : '') + (st.lock[i] ? (cg.hit[i] ? ' · ' : '') + 'Locked' : '') + (isRet(H[s.id]) ? ' · <span class="pos">Retired location</span>' : '') });
      if (st.sel === i) { h += '<div class="inl" role="group" aria-label="Hole ' + (i + 1) + '">' + inlineHtml() + '</div>'; }
    }
    return h + '</div>';
  }
  function pairHole(pad, bsk, par) {
    var cur = H[st.slots[st.sel].id], ex, id = 'H:' + pad + '>' + bsk, h;
    if (canon(cur.pad) === pad && canon(cur.bsk) === bsk) { return cur; }
    ex = pool.filter(function (q) { return canon(q.pad) === pad && canon(q.bsk) === bsk; }).sort(function (x, y) { return y.n - x.n; })[0];
    if (ex) { return ex; }
    h = H[id]; if (!h) { h = mkHole(pad, bsk, par); applyPins(); }
    return h;
  }
  function preview() { if (st.sel < 0 || !st.ep) { return null; } var cur = st.slots[st.sel], h = pairHole(st.ep.pad, st.ep.bsk, cur.par); return h.id === cur.id ? null : h; }
  function endSel(kind, val, label, domId) {
    var here = tpos(tgtObj(kind === 'pad:' ? st.ep.bsk : st.ep.pad) || { id: '', holes: [] }), a, h;
    a = targets().filter(function (t) { return t.id.indexOf(kind) === 0 && (!t.ret || t.id === val); }).map(function (t) { var p = tpos(t); return { id: t.id, d: here && p ? mdist(here, p) * 3.28084 : null }; });
    a.sort(function (x, y) { return (x.d === null ? 1e9 : x.d) - (y.d === null ? 1e9 : y.d) || (x.id < y.id ? -1 : 1); });
    h = '<label class="end"><span>' + label + '</span><select id="' + domId + '">';
    a.forEach(function (x) { h += opt(x.id, tname(x.id) + (x.d === null ? '' : ' · ' + Math.round(x.d) + ' ft'), x.id === val); });
    return h + '</select></label>';
  }
  function previewHtml(ph) {
    var cur = st.slots[st.sel], tr = st.slots.slice(), a = grade(st.slots), b, i, dp = [], db = [], flags = [], o;
    tr[st.sel] = { id: ph.id, par: cur.par }; b = grade(tr);
    for (i = 0; i < 18; i++) { if (i !== st.sel) { o = H[st.slots[i].id]; if (canon(o.pad) === st.ep.pad) { dp.push(i + 1); } if (canon(o.bsk) === st.ep.bsk) { db.push(i + 1); } } }
    if (!ph.occ.length) { flags.push('Unplayed pairing, playability unconfirmed'); }
    if (!tested(ph)) { flags.push('Estimated stats'); }
    if (!ph.geo) { flags.push('Unmapped'); } else if (ph.geo.pf === 'a' || ph.geo.bf === 'a') { flags.push('Approximate position'); }
    if (db.length) { flags.push('Basket also on hole ' + db.join(', ')); }
    if (dp.length) { flags.push('Pad also on hole ' + dp.join(', ')); }
    if (isRet(ph)) { flags.push('Retired location'); }
    var h = '<div class="ttl"><b>' + esc(short(ph.id)) + '</b></div><div class="facts">' + flags.map(function (x) { return '<span class="pos">' + x + '</span>'; }).join('') + '</div><div class="cards c3">';
    h += statCell('Length', ph.geo ? ftOf(ph) + ' ft' : '-', '', '') + statCell('To par', sg(exp(ph, cur.par) - cur.par, 2), tested(ph) ? 'hole' : 'estimate', '') + statCell('Difficulty', sg(b.rel - a.rel, 2), 'round change', cl(b.rel - a.rel)) +
      statCell('Walk', ph.geo ? sg(b.walk - a.walk, 1) + ' min' : '-', 'round change', '') + statCell('Overlaps', ph.geo ? String(b.cross) : '-', ph.geo ? sg(b.cross - a.cross, 0) + ' change' : '', b.cross > a.cross ? 'pos' : '') + statCell('Par', String(cur.par), 'unchanged', '');
    return h + '</div><div class="tools-bar"><button type="button" class="pri" data-a="iapply"' + (isRet(ph) ? ' disabled' : '') + '>Apply</button><button type="button" data-a="icancel">Cancel</button></div>';
  }
  function applyPair() { var h = preview(); if (!h) { return; } snap(); keepHole(h); st.slots[st.sel] = { id: h.id, par: st.slots[st.sel].par }; st.hover = null; st.ep = null; save(); st.focus = true; renderAll(); }
  function inlineHtml() {
    var cur = st.slots[st.sel], ch = H[cur.id], cgs = geoStats(st.slots), x = cgs.hit[st.sel], i, h = '', m = marksOn(ch), key = st.sel + '|' + cur.id + '|' + canon(ch.pad) + '|' + canon(ch.bsk), ph;
    if (!st.ep || st.epKey !== key) { st.ep = { pad: canon(ch.pad), bsk: canon(ch.bsk) }; st.epKey = key; }
    h += '<div class="ends">' + endSel('pad:', st.ep.pad, 'Pad', 'ipad') + endSel('bsk:', st.ep.bsk, 'Basket', 'ibsk') + '</div>';
    ph = preview(); if (ph) { h += previewHtml(ph); }
    h += '<div class="tools-bar"><button type="button" data-a="undo"' + (hist.length ? '' : ' disabled') + '>Undo</button><button type="button" data-a="xp" aria-expanded="' + !!st.xp + '">Par, order, replace</button></div>';
    h += '<div class="cards c3">' + statCell('Length', ftOf(ch) + ' ft', ch.geo ? '' : 'not mapped', '') + statCell('Walk in', f(cgs.legs[st.sel], 1) + ' min', 'from previous hole', '') + statCell('Avg vs par', tested(ch) ? sg(ch.rel, 2) : '-', 'below 0 = easier', tested(ch) ? cl(ch.rel) : '') +
      statCell('Used', usedTxt(cur.id), 'rounds', '') + statCell('Last used', USE[cur.id] ? USE[cur.id].dates[0] : 'New hole', USE[cur.id] ? (USE[cur.id].last === 0 ? 'latest round' : USE[cur.id].last + ' rounds ago') : 'never played', USE[cur.id] ? '' : 'pos') +
      statCell('Overlaps', x ? x.join(', ') : 'None', 'crossing holes', x ? 'pos' : '') + '</div>';
    if (!st.xp) { return h; }
    if (m.tree || m.ob || m.overlap) { h += '<div class="facts">' + (m.tree ? '<span class="pos">Trees on line ' + m.tree + '</span>' : '') + (m.ob ? '<span class="pos">OB on line ' + m.ob + '</span>' : '') + (m.overlap ? '<span class="pos">Marked overlaps ' + m.overlap + '</span>' : '') + '</div>'; }
    if (ch.geo) { var pa = ll2(ch.geo.p), ba = ll2(ch.geo.b); h += '<div class="facts"><span>Pad ' + pa[0].toFixed(5) + ', ' + pa[1].toFixed(5) + ' (' + (pins[ch.pad] ? 'set' : ch.geo.pf === 'a' ? 'approx' : 'mapped') + ')</span><span>Basket ' + ba[0].toFixed(5) + ', ' + ba[1].toFixed(5) + ' (' + (pins[ch.bsk] ? 'set' : ch.geo.bf === 'a' ? 'approx' : 'mapped') + ')</span></div>'; }
    h += '<div class="sub">Par</div><div class="chips">';
    for (i = 3; i <= 5; i++) { h += '<button type="button" data-par="' + i + '" aria-pressed="' + (cur.par === i) + '">Par ' + i + '</button>'; }
    h += '</div><div class="tools-bar"><button type="button" data-a="up"' + (st.sel === 0 ? ' disabled' : '') + '>Move earlier</button><button type="button" data-a="down"' + (st.sel === 17 ? ' disabled' : '') + '>Move later</button><button type="button" data-a="lock" aria-pressed="' + !!st.lock[st.sel] + '">' + (st.lock[st.sel] ? 'Locked' : 'Lock hole') + '</button></div>';
    h += '<div class="ttl"><b>Replace hole ' + (st.sel + 1) + ' with</b><span>' + (st.all ? 'All holes' : 'Tested holes') + '</span></div>';
    h += '<div class="tools-bar"><input id="q" type="search" placeholder="Search holes" aria-label="Search holes" value="' + esc(st.q) + '" autocomplete="off"></div>';
    h += '<div class="chips"><button type="button" data-s="fit" aria-pressed="' + (st.sort === 'fit') + '">Best fit</button><button type="button" data-s="easy" aria-pressed="' + (st.sort === 'easy') + '">Easiest first</button><button type="button" data-s="hard" aria-pressed="' + (st.sort === 'hard') + '">Hardest first</button><button type="button" data-s="bird" aria-pressed="' + (st.sort === 'bird') + '">Most birdies</button><button type="button" data-a="all" aria-pressed="' + st.all + '">Include untested</button></div>';
    var list = pool.filter(function (p) { return !isRet(p) && (st.all || tested(p)) && !inLayout(p.id, st.sel) && p.id !== cur.id && (!st.q || p.label.toLowerCase().indexOf(st.q.toLowerCase()) >= 0); });
    var FT = {}, k0;
    list.forEach(function (p) {
      var tr = st.slots.slice(), gs; tr[st.sel] = { id: p.id, par: p.par };
      if (!p.geo) { FT[p.id] = null; return; }
      gs = geoStats(tr); FT[p.id] = { i: gs.legs[st.sel], o: st.sel < 17 ? gs.legs[st.sel + 1] : 0, x: (gs.hit[st.sel] || []).length };
      FT[p.id].c = FT[p.id].i + FT[p.id].o + 2 * FT[p.id].x + (tested(p) ? 0 : 0.5);
    });
    list.sort(function (a, b) {
      if (st.sort === 'fit') { if (!FT[a.id] || !FT[b.id]) { return (FT[a.id] ? 0 : 1) - (FT[b.id] ? 0 : 1); } return FT[a.id].c - FT[b.id].c; }
      if (st.sort === 'bird') { return (b.bird || 0) - (a.bird || 0); }
      var u = exp(a, a.par) - a.par, w = exp(b, b.par) - b.par; return st.sort === 'hard' ? w - u : u - w;
    });
    h += '<div class="list nb">' + metHead();
    for (i = 0; i < list.length && i < 80; i++) {
      var p = list[i], dl = exp(p, p.par) - exp(ch, cur.par);
      h += holeRow(p.id, p.par, { nb: true, attr: 'data-pick="' + esc(p.id) + '"', extra: (FT[p.id] ? 'Walk in ' + f(FT[p.id].i, 1) + ' · out ' + f(FT[p.id].o, 1) + ' min' + (FT[p.id].x ? ' · <span class="ox"><i>X</i>' + FT[p.id].x + ' overlap' + (FT[p.id].x > 1 ? 's' : '') + '</span>' : '') + ' · ' : 'No location · ') + '<span class="' + cl(dl) + '">' + sg(dl, 2) + ' vs current</span>' });
    }
    if (!list.length) { h += '<div class="empty">-</div>'; }
    return h + '</div>';
  }
  function autoHtml() {
    var h = sheetHead('Build a layout', false), i, lk = [];
    for (i = 0; i < 18; i++) { if (st.lock[i]) { lk.push(i + 1); } }
    h += '<div class="sub">' + (lk.length ? 'Locked holes stay: ' + lk.join(', ') : 'Rebuilds all 18 holes') + '</div><div class="list">';
    for (i = 0; i < GOALS.length; i++) { h += '<button type="button" class="hr" data-ag="' + GOALS[i][0] + '"' + (st.busy ? ' disabled' : '') + '><span class="bdg dot" style="background:#c9b4f0"></span><span class="mid"><b>' + (st.busy === GOALS[i][0] ? 'Building...' : GOALS[i][1]) + '</b><small>' + GOALS[i][2] + '</small></span><span class="chev" aria-hidden="true">&rsaquo;</span></button>'; }
    h += '<button type="button" class="hr" data-a="order"><span class="bdg dot" style="background:#7fb2ff"></span><span class="mid"><b>Reorder for shortest walk</b><small>Same 18 holes, new order</small></span><span class="chev" aria-hidden="true">&rsaquo;</span></button></div>';
    return h + startHtml();
  }
  function renderSheet() {
    var h = st.view === 'build' ? buildHtml() : st.view === 'auto' ? autoHtml() : st.view === 'pins' ? pinsHtml() : st.view === 'hist' ? histHtml() : routeHtml();
    var vk = st.view + '|' + st.tgt + '|' + st.hd + '|' + st.pf + '|' + st.tk + '|' + cnt() + '|' + st.bi + '|' + (st.cr ? st.cr.k : '');
    $('sheet').innerHTML = h;
    if (vk !== st.vk) { st.vk = vk; $('sheet').scrollTop = 0; }
    $('layoutTab').setAttribute('aria-pressed', st.view === 'route' || st.view === 'build'); $('auto').setAttribute('aria-pressed', st.view === 'auto'); $('pinsBtn').setAttribute('aria-pressed', st.view === 'pins'); $('histBtn').setAttribute('aria-pressed', st.view === 'hist');
    if (st.focusL) { var lq = $('lq'); if (lq) { lq.focus(); lq.setSelectionRange(lq.value.length, lq.value.length); } st.focusL = false; }
    if (st.focusQ) { var q = $('q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } st.focusQ = false; }
  }
  function renderBase() {
    var h = '<option value="">New blank layout</option>', i;
    for (i = 0; i < dates.length; i++) { h += '<option value="' + dates[i] + '"' + (dates[i] === st.base ? ' selected' : '') + '>From ' + dates[i] + '</option>'; }
    $('base').innerHTML = h;
  }
  function renderAll() { renderSheet(); drawAll(); drawMap(); drawPins(); $('undo').disabled = !hist.length; }
  function pick(i) { st.sel = st.sel === i ? -1 : i; st.view = 'route'; st.ep = null; st.xp = false; st.hover = null; st.focus = st.sel >= 0; setCollapsed(false); renderAll();   showInline(); }
  function showInline() { var sh = $('sheet'), r = sh.querySelector('[aria-expanded="true"][data-i]'), a, b, p; if (!r) { return; } a = sh.getBoundingClientRect(); b = r.getBoundingClientRect(); p = r.nextElementSibling.getBoundingClientRect(); if (b.top < a.top || p.top + 110 > a.bottom) { sh.scrollTop += b.top - a.top - 4; } }
  function replaceWith(id) { snap(); st.slots[st.sel] = { id: id, par: H[id].par }; st.hover = null; save(); st.focus = true; renderAll(); }
  function runAuto(goal) {
    st.busy = goal; renderSheet();
    setTimeout(function () {
      var before = grade(st.slots).rel, r = buildLayout(goal), lab = goal, k;
      for (k = 0; k < GOALS.length; k++) { if (GOALS[k][0] === goal) { lab = GOALS[k][1]; } }
      st.busy = null;
      if (r) { snap(); st.slots = r.slice(); st.note = { t: 'Auto: ' + lab, d: grade(r).rel - before }; st.view = 'route'; st.sel = -1; st.fit = true; save(); }
      renderAll();
    }, 40);
  }
  function applyOrder() { var r = bestOrder(); if (!r) { return; } snap(); st.lock = {}; st.slots = r.perm.map(function (k) { return st.slots[k]; }); st.sel = -1; st.view = 'route'; save(); renderAll(); }
  function move(d) { var j = st.sel + d; if (j < 0 || j > 17) { return; } snap(); var t = st.slots[st.sel], lt = st.lock[st.sel]; st.slots[st.sel] = st.slots[j]; st.slots[j] = t; st.lock[st.sel] = st.lock[j]; st.lock[j] = lt; st.sel = j; save(); renderAll(); }
  function back() { if (st.view === 'hist' && st.hd) { st.hd = null; st.prev = null; st.fit = true; renderAll(); return; } if (st.view === 'pins' && st.tgt) { st.tgt = null; renderAll(); return; } st.hd = null; st.view = 'route'; st.sel = -1; st.tgt = null; st.prev = null; st.pgoal = null; st.hover = null; st.fit = true; renderAll(); }
  function copyText() {
    var t = st.slots.map(function (s, i) { return (i + 1) + '. ' + guideText(s.id, s.par); }).join('\n');
    var done = function () { $('copy').textContent = 'Copied'; setTimeout(function () { $('copy').textContent = 'Copy'; }, 1200); };
    try { navigator.clipboard.writeText(t).then(done, function () { fallback(t, done); }); } catch (e) { fallback(t, done); }
  }
  function fallback(t, done) {
    var a = document.createElement('textarea'); a.value = t; a.style.position = 'fixed'; a.style.opacity = '0'; document.body.appendChild(a); a.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
    document.body.removeChild(a);
  }
  function init() {
    $('base').addEventListener('change', function () { if (this.value) { loadBase(this.value); } else { startBuild(); return; } st.fit = true; renderAll(); });
    $('undo').addEventListener('click', undo);
    $('reset').addEventListener('click', function () { var h0 = JSON.stringify(st.slots); loadBase(st.base || dates[0]); hist = [h0]; renderBase(); st.fit = true; renderAll(); });
    $('copy').addEventListener('click', copyText);
    $('layoutTab').addEventListener('click', function () { st.view = 'route'; st.sel = -1; st.prev = null; st.hd = null; st.tgt = null; st.hover = null; setCollapsed(false); st.fit = true; renderAll(); });
    $('auto').addEventListener('click', function () { st.view = 'auto'; st.sel = -1; st.prev = null; st.pgoal = null; setCollapsed(false); renderAll(); });
    $('pinsBtn').addEventListener('click', function () { st.view = 'pins'; st.sel = -1; st.prev = null; st.tgt = null; setCollapsed(false); renderAll(); });
    $('histBtn').addEventListener('click', function () { st.view = 'hist'; st.hd = null; st.sel = -1; st.prev = null; st.tgt = null; setCollapsed(false); renderAll(); });
    $('loc').addEventListener('click', function () { locate(true); });
    $('unused').addEventListener('click', function () { st.unused = !st.unused; this.setAttribute('aria-pressed', st.unused ? 'true' : 'false'); drawPins(); }); $('fit').addEventListener('click', function () { st.fit = true; drawMap(); });
    $('grip').addEventListener('click', function () { setCollapsed(document.body.getAttribute('data-sheet') !== 'min'); });
    $('sheet').addEventListener('input', function (e) { if (e.target.id === 'cn') { st.cr.name = e.target.value; var cb0 = $('sheet').querySelector('[data-a=crok]'), cm0 = $('sheet').querySelector('[data-a=crme]'); if (cb0) { cb0.disabled = !st.cr.name; } if (cm0) { cm0.disabled = !(me && st.cr.name); } return; }
      if (e.target.id === 'nn') { st.nn = e.target.value; var pb = $('sheet').querySelector('[data-a=place]'), hb = $('sheet').querySelector('[data-a=here]'); if (pb) { pb.disabled = !st.nn; } if (hb) { hb.disabled = !(me && st.nn); } return; }
      if (e.target.id === 'rn') { st.rn = e.target.value; return; }
      if (e.target.id === 'lq') { st.lq = e.target.value; st.focusL = true; renderSheet(); return; }
      if (e.target.id === 'q') { st.q = e.target.value; st.focusQ = true; renderSheet(); } });
    $('sheet').addEventListener('change', function (e) {
      var t = e.target, h0;
      if (t.id === 'ipad' || t.id === 'ibsk') { st.ep[t.id === 'ipad' ? 'pad' : 'bsk'] = t.value; h0 = preview(); st.hover = h0 ? h0.id : null; renderAll(); return; }
      if (t.id === 'mw') { st.mw = t.value; st.kn = st.ks = null; renderSheet(); return; }
      if (t.id === 'bpad') { st.bp.pad = t.value; st.bp.bsk = ''; renderAll(); return; }
      if (t.id === 'bbsk') { st.bp.bsk = t.value; h0 = selHole(); if (h0) { st.bp.par = defPar(h0); } renderAll(); }
    });
    $('sheet').addEventListener('mouseover', function (e) {
      var t = e.target; while (t && t !== this && !(t.getAttribute && (t.getAttribute('data-pick') || t.getAttribute('data-sg')))) { t = t.parentNode; }
      var id = t && t.getAttribute ? (t.getAttribute('data-pick') || t.getAttribute('data-sg')) : null; if (id !== st.hover) { st.hover = id; drawMap(); }
    });
    $('sheet').addEventListener('click', function (e) {
      var t = e.target; while (t && t !== this && t.tagName !== 'BUTTON') { t = t.parentNode; }
      if (!t || t.tagName !== 'BUTTON' || t.disabled) { return; }
      var hv = t.getAttribute('data-h'); if (hv) { st.hd = hv; st.prev = seq[hv].map(function (q) { return { id: q.id, par: q.par }; }); st.fit = true; renderAll(); return; }
      var tg = t.getAttribute('data-t'), pfv = t.getAttribute('data-pf'), mkv = t.getAttribute('data-mk'), mdv = t.getAttribute('data-md'), snv = t.getAttribute('data-sn');
      if (tg) { st.rn = undefined; st.mw = st.kn = st.ks = null; }
      if (tg) { st.tgt = tg; st.pf = st.pf === 'marks' ? 'need' : st.pf; var tt0 = tgtObj(tg), pp0 = tt0 ? tpos(tt0) : null; if (pp0 && map) { map.setView(pp0, 19, { animate: false }); } renderAll(); return; }
      var sgv = t.getAttribute('data-sg'), bpv = t.getAttribute('data-bpar'), slv = t.getAttribute('data-sl'), aa = t.getAttribute('data-a');
      if (slv !== null) { selSlot(parseInt(slv, 10)); st.fit = false; renderAll(); return; }
      if (sgv) { addDraft(sgv, H[sgv].par); return; }
      if (bpv) { st.bp.par = parseInt(bpv, 10); if (D()[st.bi] && selHole() && D()[st.bi].id === selHole().id) { st.draft = D(); st.draft[st.bi].par = st.bp.par; save(); renderAll(); } else { renderSheet(); } return; }
      var kn0 = t.getAttribute('data-kn'), ks0 = t.getAttribute('data-ks'), um = t.getAttribute('data-um'), pm = t.getAttribute('data-pm'), pg = t.getAttribute('data-pg'), pn = t.getAttribute('data-pn'), pu = t.getAttribute('data-pu');
      if (kn0) { st.kn = kn0; renderSheet(); return; }
      if (ks0) { st.ks = ks0; renderSheet(); return; }
      if (um) { unmerge(um); renderAll(); return; }
      if (pm) { st.pair = pm; st.pairFit = true; renderAll(); return; }
      if (pn || pu) { var pr = (pn || pu).split('|'); st.pair = null; setDismiss(pr[0], pr[1], !!pn); renderAll(); return; }
      if (pg) { var pr2 = pg.split('|'); st.tgt = pr2[0]; st.mw = pr2[1]; st.kn = st.ks = null; st.rn = undefined; renderAll(); return; }
      if (aa === 'dshow') { st.dshow = !st.dshow; st.pair = null; renderAll(); return; }
      if (aa === 'lsort') { st.lsort = st.lsort === 'name' ? 'near' : 'name'; renderSheet(); return; }
      if (aa === 'mx') { st.mw = null; renderSheet(); return; }
      if (aa === 'mgo' && st.tgt && st.mw) { var into = st.kn === st.mw ? st.mw : st.tgt, from = into === st.tgt ? st.mw : st.tgt; if (mergeInto(from, into, st.ks || into)) { st.tgt = into; st.mw = st.kn = st.ks = null; st.rn = undefined; } renderAll(); return; }
      if (aa === 'rename' && st.tgt) { var nv = String(st.rn === undefined ? tname(st.tgt) : st.rn).replace(/^\s+|\s+$/g, '').slice(0, 40); if (nv) { mgSet('nm', st.tgt, nv); st.rn = undefined; saveMG(); } renderAll(); return; }
      if (aa === 'retire' && st.tgt) { var rr = refs(st.tgt); if (!rr.cur.length && !rr.draft.length) { mgSet('rt', st.tgt, 1); saveMG(); } renderAll(); return; }
      if (aa === 'restore' && st.tgt) { mgSet('rt', st.tgt, null); saveMG(); renderAll(); return; }
      if (aa === 'iapply') { applyPair(); return; }
      if (aa === 'icancel') { st.ep = null; st.hover = null; renderAll(); return; }
      if (aa === 'xp') { st.xp = !st.xp; renderAll(); return; }
      if (aa === 'newl') { startBuild(); return; }
      if (aa === 'drm') { st.draft = D(); st.draft[st.bi] = null; st.bp = { pad: '', bsk: '', par: 3 }; save(); renderAll(); return; }
      if (aa === 'dclr') { st.draft = []; selSlot(0); save(); renderAll(); return; }
      if (aa === 'dadd') { var sh0 = selHole(); if (sh0) { addDraft(sh0.id, st.bp.par); } return; }
      if (aa === 'newpad' || aa === 'newbsk') { st.cr = { k: aa === 'newpad' ? 'pad' : 'bsk', name: '' }; renderAll(); return; }
      if (aa === 'crx') { st.cr = null; renderAll(); return; }
      if (aa === 'crok' || aa === 'crme') {
        var cc = aa === 'crme' ? (me ? { lat: me.lat, lng: me.lon } : null) : map.getCenter();
        if (cc && st.cr && st.cr.name) {
          var nid = (st.cr.k === 'pad' ? 'pad:' : 'bsk:') + 'new-' + slug(st.cr.name);
          pins[nid] = [cc.lat, cc.lng]; pushPin(nid, 'point', cc.lat, cc.lng); applyPins(); savePinsLocal();
          st.bp[st.cr.k === 'pad' ? 'pad' : 'bsk'] = nid; if (st.cr.k === 'pad') { st.bp.bsk = ''; } st.cr = null; renderAll();
        }
        return;
      }
      var tkv = t.getAttribute('data-tk'); if (tkv) { st.tk = tkv; renderSheet(); return; }
      var nkv = t.getAttribute('data-nk'); if (nkv) { st.nk = nkv; renderSheet(); return; }
      if (pfv) { st.pf = pfv; st.tgt = null; renderAll(); return; }
      if (mkv) { st.mk = mkv; renderSheet(); return; }
      if (mdv) { delMark(mdv); return; }
      if (snv) { st.cards = parseInt(snv, 10); renderSheet(); return; }
      var a = t.getAttribute('data-a'), s = t.getAttribute('data-s'), pk = t.getAttribute('data-pick'), ag = t.getAttribute('data-ag'), di = t.getAttribute('data-i');
      if (t.getAttribute('data-par')) { /* handled below */ }
      if (di !== null) { pick(parseInt(di, 10)); }
      else if (pk) { st.hover = pk; replaceWith(pk); }
      else if (ag) { runAuto(ag); }
      else if (t.getAttribute('data-par')) { var np = parseInt(t.getAttribute('data-par'), 10); if (st.slots[st.sel].par !== np) { snap(); st.slots[st.sel] = { id: st.slots[st.sel].id, par: np }; save(); renderAll(); } }
      else if (a === 'lock') { if (st.lock[st.sel]) { delete st.lock[st.sel]; } else { st.lock[st.sel] = true; } save(); renderSheet(); }
      else if (a === 'undo') { undo(); }
      else if (s) { st.sort = s; renderSheet(); }
      else if (a === 'back') { back(); } else if (a === 'up') { move(-1); } else if (a === 'down') { move(1); }
      else if (a === 'all') { st.all = !st.all; renderSheet(); } else if (a === 'more') { st.more = !st.more; renderSheet(); }
      else if (a === 'order') { applyOrder(); }
      else if (a === 'loadh') { if (st.hd) { loadBase(st.hd); st.view = 'route'; st.hd = null; st.prev = null; renderBase(); st.fit = true; renderAll(); } }
      else if (a === 'place') { var c0 = map.getCenter(); placeAt(c0.lat, c0.lng); }
      else if (a === 'here') { if (me) { placeAt(me.lat, me.lon); } }
      else if (a === 'list') { st.tgt = null; renderAll(); }
      else if (a === 'rot') { var s0 = parseInt(t.getAttribute('data-s0'), 10); snap(); st.lock = {}; st.slots = st.slots.slice(s0).concat(st.slots.slice(0, s0)); st.cards = 0; save(); renderAll(); }
      else if (a === 'apply') { if (st.prev) { snap(); st.slots = st.prev.slice(); st.prev = null; st.pgoal = null; st.view = 'route'; save(); renderAll(); } }
      else if (a === 'discard') { st.prev = null; st.pgoal = null; renderAll(); }
    });
    get('/hbnf-holes/hole_encyclopedia.json', function (d) {
      if (!d) { return; }
      enc = d; prep();
      get('/hbnf-holes/studio/rounds.json', function (rj) { if (rj) { RD = rj.rounds || {}; } });
      get('/hbnf-holes/studio/geo.json', function (gj) {
        if (gj) { GEO = gj; var q; for (q = 0; q < gj.tkeys.length; q++) { TI[gj.tkeys[q]] = q; } for (q in gj.holes) { if (gj.holes.hasOwnProperty(q) && H[q]) { H[q].geo = gj.holes[q]; } } }
        start();
      });
    });
  }
  function start() {
    loadMG(); loadCustoms();
    histRel = dates.map(function (x) { return grade(seq[x]).rel; });
    var saved = load();
    if (saved) { st.base = saved.base; st.slots = saved.slots; st.lock = saved.lock || {}; st.draft = (saved.draft || []).map(function (x) { return x && H[x.id] ? x : null; }); st.ts = saved.ts || 0; baseGrade = st.base && seq[st.base] ? grade(seq[st.base]) : grade(st.slots); }
    else { loadBase(dates[0]); st.ts = 0; }
    buildUse(); loadPinsLocal(); applyPins(); renderBase(); initMap(); renderAll(); cloudPull(); document.addEventListener('visibilitychange', function () { if (!document.hidden) { cloudPull(); } }); pullPins(function () { applyPins(); histRel = dates.map(function (x) { return grade(seq[x]).rel; }); renderAll(); });
  }
  init();
})();
