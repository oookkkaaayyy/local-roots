(function () {
  'use strict';
  var bldCache0 = null, GEO = null, TI = {}, KEY = 'hbnf-studio-v2', MIN_N = 4, K = 6, PRIOR = { 3: -0.4, 4: 0.3 }, BPRIOR = 25, hist = [], histRel = [];
  var $ = function (id) { return document.getElementById(id); };
  var enc = null, H = {}, pool = [], seq = {}, dates = [];
  var st = { base: null, slots: [], sel: -1, view: 'route', sort: 'easy', all: false, q: '', goal: 'easier', more: false, tgt: null, pf: 'need', mk: 'tree', cards: 0, prev: null, pgoal: null, hover: null };
  var baseGrade = null;
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
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ base: st.base, slots: st.slots })); } catch (e) { /* storage unavailable */ } }
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
  function dupBsk(slots) { var m = {}, d = 0, i; for (i = 0; i < slots.length; i++) { var b = H[slots[i].id].bsk; if (m[b]) { d++; } m[b] = 1; } return d; }
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
  var GOALS = [['easier', 'Easier'], ['harder', 'Harder'], ['birdies', 'Birdies'], ['faster', 'Faster'], ['balance', 'Balance'], ['walk', 'Walk'], ['safe', 'Safer']];
  function guideText(id, par) {
    var h = H[id], t = h.occ.length ? h.occ[h.occ.length - 1].source_text : h.label;
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
    var cand = pool.filter(function (p) { return p.n >= 8 && p.par && (!GEO || p.geo); }), cur = st.slots.slice(), cg = grade(cur),
        cs = objective(goal, cg) - penalty(cg), best = cur.slice(), bs = cs, it, T, i, j, p, tr, tg, ts, used, k, N = 30000, seed = 11;
    function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
    if (!cand.length) { return null; }
    for (it = 0; it < N; it++) {
      T = 0.6 * (1 - it / N) + 0.005; tr = cur.slice();
      if (rnd() < 0.7) {
        i = Math.floor(rnd() * 18); p = cand[Math.floor(rnd() * cand.length)]; used = false;
        for (k = 0; k < 18; k++) { if (tr[k].id === p.id) { used = true; } }
        if (used) { continue; }
        tr[i] = { id: p.id, par: p.par };
      } else {
        i = Math.floor(rnd() * 18); j = Math.floor(rnd() * 18); if (i === j) { continue; }
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
        if (p.n < 12 || inLayout(p.id, i)) { continue; }
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
  function short(id) { return H[id].label.replace(/\s*\(.*\)\s*$/, ''); }
  function ftOf(p) { return p.geo ? (p.geo.pf === 'a' || p.geo.bf === 'a' ? '~' : '') + Math.round(p.geo.d * 3.28084 / 5) * 5 : '-'; }
  function rank(rel) { var r = 1, i; for (i = 0; i < histRel.length; i++) { if (histRel[i] < rel) { r++; } } return r; }
  function snap() { hist.push(JSON.stringify(st.slots)); if (hist.length > 50) { hist.shift(); } }
  function undo() { if (hist.length) { st.slots = JSON.parse(hist.pop()); save(); renderAll(); } }
  function inLayout(id, except) { for (var i = 0; i < 18; i++) { if (i !== except && st.slots[i].id === id) { return true; } } return false; }
  function loadBase(d) { st.base = d; st.slots = seq[d].map(function (s) { return { id: s.id, par: s.par }; }); baseGrade = grade(st.slots); st.sel = -1; st.view = 'route'; st.prev = null; hist = []; save(); }
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
          if (segX(b1, c1, d1, e1)) {
            var den = (c1[0] - b1[0]) * (e1[1] - d1[1]) - (c1[1] - b1[1]) * (e1[0] - d1[0]), tt = ((d1[0] - b1[0]) * (e1[1] - d1[1]) - (d1[1] - b1[1]) * (e1[0] - d1[0])) / den, px = b1[0] + tt * (c1[0] - b1[0]), py = b1[1] + tt * (c1[1] - b1[1]);
            L.marker([py / 111320, px / (111320 * Math.cos(33.698 * Math.PI / 180))], { icon: L.divIcon({ className: 'pin mk', html: '<span>X</span>', iconSize: [22, 22], iconAnchor: [11, 11] }), interactive: false, keyboard: false }).addTo(group);
          }
        }
      }
    }
    for (i = 0; i < slots.length; i++) {
      h = H[slots[i].id]; if (!h.geo) { continue; }
      p = ll2(h.geo.p); b = ll2(h.geo.b);
      var col = o.ghost ? '#c9b4f0' : relColor(holeRel(slots[i]), tested(h)), sel = !o.ghost && i === st.sel, bad = !o.ghost && cg.hit[i];
      L.polyline([ll2(prevB), p], { color: o.ghost ? '#c9b4f0' : '#d9cebb', weight: 2, opacity: 0.6, dashArray: '2 6', interactive: false }).addTo(group);
      var ln = L.polyline([p, b], { color: bad ? '#ff4d4d' : col, weight: sel ? 8 : 5, opacity: o.ghost ? 0.9 : 0.95, dashArray: o.ghost ? '8 6' : null, lineCap: 'round' }).addTo(group);
      if (!o.ghost) { (function (k) { ln.on('click', function () { pick(k); }); })(i); }
      L.circleMarker(b, { radius: 4, color: '#1d1812', weight: 1, fillColor: col, fillOpacity: 1, interactive: false }).addTo(group);
      var ic = L.divIcon({ className: 'pin' + (sel ? ' sel' : '') + (o.ghost ? ' gh' : ''), html: '<span style="background:' + col + '">' + (i + 1) + '</span>', iconSize: [28, 28], iconAnchor: [14, 14] });
      var m = L.marker(p, { icon: ic, keyboard: false, zIndexOffset: sel ? 1000 : 0 }).addTo(group);
      if (!o.ghost) { (function (k) { m.on('click', function () { pick(k); }); })(i); }
      prevB = h.geo.b;
    }
  }
  function drawMap() {
    if (!map) { return; }
    drawLayout(layers.route, st.view === 'hist' && st.hd ? [] : st.slots, {});
    layers.ghost.clearLayers();
    if (st.prev) { drawLayout(layers.ghost, st.prev, { ghost: true }); }
    layers.hov.clearLayers();
    if (st.hover && st.sel >= 0 && H[st.hover].geo) {
      var g = H[st.hover].geo;
      L.polyline([ll2(g.p), ll2(g.b)], { color: '#c9b4f0', weight: 7, opacity: 0.95, dashArray: '8 6', interactive: false }).addTo(layers.hov);
      L.circleMarker(ll2(g.p), { radius: 7, color: '#c9b4f0', weight: 3, fillColor: '#1d1812', fillOpacity: 1, interactive: false }).addTo(layers.hov);
    }
    var fit = st.sel >= 0 && H[st.slots[st.sel].id].geo ? [ll2(H[st.slots[st.sel].id].geo.p), ll2(H[st.slots[st.sel].id].geo.b)] : null;
    if (st.fit) { st.fit = false; var pts = [], i; for (i = 0; i < 18; i++) { if (H[st.slots[i].id].geo) { pts.push(ll2(H[st.slots[i].id].geo.p), ll2(H[st.slots[i].id].geo.b)); } } if (pts.length) { map.invalidateSize(); map.fitBounds(L.latLngBounds(pts), { padding: [30, 30], animate: false }); } }
    else if (fit && st.focus) { st.focus = false; map.invalidateSize(); map.fitBounds(L.latLngBounds(fit), { padding: [90, 90], maxZoom: 18, animate: false }); }
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
    if (st.view !== 'swap') { return; }
    var i, p, g, c = st.sel >= 0 && H[st.slots[st.sel].id].geo ? H[st.slots[st.sel].id].geo : null, a, d;
    a = c ? [ll(c.p), ll(c.b)] : null;
    for (i = 0; i < pool.length; i++) {
      p = pool[i]; g = p.geo; if (!g || inLayout(p.id, st.sel) || p.n < MIN_N) { continue; }
      if (a) { d = Math.min(dist2(ll(g.p), a[0]), dist2(ll(g.p), a[1]), dist2(ll(g.b), a[0]), dist2(ll(g.b), a[1])); if (d > 120) { continue; } }
      (function (pp) {
        var ln = L.polyline([ll2(pp.geo.p), ll2(pp.geo.b)], { color: '#d9cebb', weight: 2, opacity: 0.28 }).addTo(layers.all);
        ln.on('mouseover', function () { st.hover = pp.id; drawMap(); }).on('click', function () { replaceWith(pp.id); });
      })(p);
    }
  }

  function mxy(a) { return [a[1] * 111320 * Math.cos(33.698 * Math.PI / 180), a[0] * 111320]; }
  function mdist(a, b) { var u = mxy(a), v = mxy(b); return Math.sqrt(Math.pow(u[0] - v[0], 2) + Math.pow(u[1] - v[1], 2)); }
  function tlabel(id) { return (id.indexOf('pad:') === 0 ? 'Pad ' : id.indexOf('bsk:') === 0 ? 'Basket ' : '') + id.replace(/^(pad|bsk):/, '').replace(/-/g, ' '); }
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
    var q, h, m = GEO.meta.model, pp, bp, g, d, idn = {}, idf = {};
    for (q in H) {
      if (!H.hasOwnProperty(q)) { continue; }
      h = H[q];
      if (h.geo0 === undefined) { h.geo0 = h.geo ? JSON.parse(JSON.stringify(h.geo)) : null; }
      if (h.geo0) {
        if (!idn[h.pad] || (idf[h.pad] === 'a' && h.geo0.pf === 'v')) { idn[h.pad] = h.geo0.p; idf[h.pad] = h.geo0.pf; }
        if (!idn[h.bsk] || (idf[h.bsk] === 'a' && h.geo0.bf === 'v')) { idn[h.bsk] = h.geo0.b; idf[h.bsk] = h.geo0.bf; }
      }
    }
    for (q in H) {
      if (!H.hasOwnProperty(q)) { continue; }
      h = H[q];
      h.geo = h.geo0 ? JSON.parse(JSON.stringify(h.geo0)) : null;
      pp = pins[h.pad]; bp = pins[h.bsk];
      if (!pp && !bp && h.geo) { continue; }
      if (!h.geo && !((pp || idn[h.pad]) && (bp || idn[h.bsk]))) { continue; }
      if (pp) { GEO.nodes['pin:' + h.pad] = [pp[0], pp[1], 0, 0]; }
      if (bp) { GEO.nodes['pin:' + h.bsk] = [bp[0], bp[1], 0, 0]; }
      if (!h.geo) {
        h.geo = { p: pp ? 'pin:' + h.pad : idn[h.pad], b: bp ? 'pin:' + h.bsk : idn[h.bsk], pf: pp ? 'v' : idf[h.pad] || 'a', bf: bp ? 'v' : idf[h.bsk] || 'a', n: h.n, par: h.par, d: 0, pred: 0, up: 0.5 };
      } else {
        if (pp) { h.geo.p = 'pin:' + h.pad; h.geo.pf = 'v'; }
        if (bp) { h.geo.b = 'pin:' + h.bsk; h.geo.bf = 'v'; }
      }
      g = h.geo; d = mdist(ll2(g.p), ll2(g.b)); g.d = d;
      g.pred = Math.round((m.c0 + m.per100m * d / 100 + (g.par >= 4 ? m.par4 : 0)) * 100) / 100;
    }
  }
  function targets() {
    var m = {}, i, h, ids, k, id, t;
    for (i = 0; i < pool.length; i++) {
      h = pool[i]; ids = [[h.pad, h.geo0 ? h.geo0.pf : null], [h.bsk, h.geo0 ? h.geo0.bf : null]];
      for (k = 0; k < 2; k++) {
        id = ids[k][0]; if (!id || id.indexOf('unresolved') >= 0 || id.indexOf('temp') >= 0) { continue; }
        t = m[id] = m[id] || { id: id, holes: [], need: 2, ok: false, ap: false };
        t.holes.push(h.id);
        if (h.geo0) { if (ids[k][1] === 'a') { t.ap = true; } else { t.ok = true; } }
      }
    }
    var out = [];
    for (id in m) { if (m.hasOwnProperty(id)) { t = m[id]; t.need = t.ok ? 0 : t.ap ? 1 : 2; if (pins[id]) { t.need = -1; } out.push(t); } }
    return out;
  }
  function tpos(t) {
    if (pins[t.id]) { return pins[t.id]; }
    var i, h, g;
    for (i = 0; i < t.holes.length; i++) { h = H[t.holes[i]]; g = h.geo; if (g) { return ll2(h.pad === t.id ? g.p : g.b); } }
    return null;
  }
  function locate(follow) {
    if (!navigator.geolocation) { st.gps = 'No GPS'; renderSheet(); return; }
    st.follow = follow !== false;
    if (watchId !== null) { if (me && map && st.follow) { map.setView([me.lat, me.lon], Math.max(map.getZoom(), 18), { animate: false }); } return; }
    watchId = navigator.geolocation.watchPosition(function (p) {
      var first = !me; me = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy };
      st.gps = '';
      drawMe();
      if (first && st.follow && map) { map.setView([me.lat, me.lon], 18, { animate: false }); }
      if (st.view === 'pins' || st.view === 'auto') { renderSheet(); }
      $('loc').setAttribute('aria-pressed', 'true');
    }, function () { st.gps = 'No GPS'; watchId = null; $('loc').setAttribute('aria-pressed', 'false'); if (st.view === 'pins') { renderSheet(); } }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 });
  }
  function drawMe() {
    if (!map || !me) { return; }
    layers.me.clearLayers();
    L.circle([me.lat, me.lon], { radius: me.acc, color: '#7fb2ff', weight: 1, fillColor: '#7fb2ff', fillOpacity: 0.12, interactive: false }).addTo(layers.me);
    L.circleMarker([me.lat, me.lon], { radius: 7, color: '#1d1812', weight: 2, fillColor: '#7fb2ff', fillOpacity: 1, interactive: false }).addTo(layers.me);
  }
  function drawPins() {
    if (!map) { return; }
    layers.pins.clearLayers(); layers.marks.clearLayers(); layers.tgt.clearLayers();
    var id, i, m, ic, L2 = { tree: 'T', ob: 'OB', overlap: 'X', note: 'N' };
    for (id in pins) { if (pins.hasOwnProperty(id)) { L.circleMarker(pins[id], { radius: 5, color: '#1d1812', weight: 1, fillColor: '#c9b4f0', fillOpacity: 1, interactive: false }).addTo(layers.pins); } }
    for (i = 0; i < marks.length; i++) {
      m = marks[i]; ic = L.divIcon({ className: 'pin mk', html: '<span>' + L2[m.kind] + '</span>', iconSize: [22, 22], iconAnchor: [11, 11] });
      L.marker([m.lat, m.lon], { icon: ic, interactive: false, keyboard: false }).addTo(layers.marks);
    }
    if (st.view === 'pins' && st.tgt) {
      var t = tgtObj(st.tgt), pos = t ? tpos(t) : null;
      if (pos) { L.circle(pos, { radius: 6, color: '#c9b4f0', weight: 3, fillOpacity: 0, dashArray: '4 4', interactive: false }).addTo(layers.tgt); }
    }
    $('ret').hidden = !(st.view === 'pins' && (st.tgt || st.pf === 'marks'));
  }
  function tgtObj(id) { var a = targets(), i; for (i = 0; i < a.length; i++) { if (a[i].id === id) { return a[i]; } } return null; }
  function placeAt(lat, lon) {
    if (st.pf === 'marks' && !st.tgt) {
      var mm = { id: 'mark:' + st.mk + ':' + Date.now(), kind: st.mk, lat: lat, lon: lon }; marks.push(mm); pushPin(mm.id, mm.kind, lat, lon);
    } else if (st.tgt) {
      pins[st.tgt] = [lat, lon]; pushPin(st.tgt, 'point', lat, lon); applyPins();
    } else { return; }
    savePinsLocal(); st.placed = true; renderAll();
  }
  function delMark(id) { var i; for (i = 0; i < marks.length; i++) { if (marks[i].id === id) { marks.splice(i, 1); } } sb('DELETE', '?id=eq.' + encodeURIComponent(id), null, function () { /* best effort */ }); savePinsLocal(); renderAll(); }
  function marksOn(h) {
    var out = { tree: 0, ob: 0, overlap: 0 }, g = h.geo, i, a, b, m;
    if (!g) { return out; }
    a = ll(g.p); b = ll(g.b);
    for (i = 0; i < marks.length; i++) { m = marks[i]; if (out[m.kind] !== undefined && pd(mxy([m.lat, m.lon]), a, b) < 10) { out[m.kind]++; } }
    return out;
  }
  function pinsHtml() {
    var h = sheetHead('Pins', true), i, a, t, pos, d, label;
    h += '<div class="chips"><button type="button" data-pf="need" aria-pressed="' + (st.pf === 'need') + '">Missing</button><button type="button" data-pf="all" aria-pressed="' + (st.pf === 'all') + '">All</button><button type="button" data-pf="marks" aria-pressed="' + (st.pf === 'marks') + '">Marks</button></div>';
    if (st.tgt) {
      t = tgtObj(st.tgt); pos = t ? tpos(t) : null;
      h += '<div class="facts"><strong>' + esc(tlabel(st.tgt)) + '</strong><span>' + (pins[st.tgt] ? 'Set' : t && t.need === 2 ? 'Missing' : t && t.need === 1 ? 'Approx' : 'Mapped') + '</span>' + (pos ? '<span>' + pos[0].toFixed(6) + ', ' + pos[1].toFixed(6) + '</span>' : '') + (st.sync ? '<span>' + st.sync + '</span>' : '') + '</div>';
      h += '<div class="tools-bar"><button type="button" class="pri" data-a="place">Place at crosshair</button><button type="button" data-a="here"' + (me ? '' : ' disabled') + '>My location</button><button type="button" data-a="list">List</button></div>';
      if (t) { h += '<div class="sub">Used by</div><div class="list">'; for (i = 0; i < t.holes.length && i < 6; i++) { h += '<div class="row"><span class="l">' + esc(short(t.holes[i])) + '</span><span class="v">P' + H[t.holes[i]].par + '</span><span class="v"></span><span class="v"></span></div>'; } h += '</div>'; }
      return h;
    }
    if (st.pf === 'marks') {
      var ks = [['tree', 'Tree'], ['ob', 'OB'], ['overlap', 'Overlap'], ['note', 'Note']];
      h += '<div class="chips">'; for (i = 0; i < ks.length; i++) { h += '<button type="button" data-mk="' + ks[i][0] + '" aria-pressed="' + (st.mk === ks[i][0]) + '">' + ks[i][1] + '</button>'; } h += '</div>';
      h += '<div class="tools-bar"><button type="button" class="pri" data-a="place">Place at crosshair</button><button type="button" data-a="here"' + (me ? '' : ' disabled') + '>My location</button></div><div class="list">';
      for (i = marks.length - 1; i >= 0 && i > marks.length - 40; i--) { h += '<div class="row"><span class="l">' + marks[i].kind + ' ' + marks[i].lat.toFixed(5) + ', ' + marks[i].lon.toFixed(5) + '</span><span class="v"></span><span class="v"></span><button type="button" class="v" data-md="' + esc(marks[i].id) + '">Delete</button></div>'; }
      return h + '</div>';
    }
    a = targets().filter(function (x) { return st.pf === 'all' || x.need > 0; });
    a.forEach(function (x) { var q = tpos(x); x.dist = me && q ? mdist([me.lat, me.lon], q) : null; });
    a.sort(function (x, y) { if (x.dist !== null && y.dist !== null) { return x.dist - y.dist; } return y.need - x.need || (x.id < y.id ? -1 : 1); });
    h += '<div class="list">';
    for (i = 0; i < a.length && i < 120; i++) {
      t = a[i]; h += '<button type="button" class="row" data-t="' + esc(t.id) + '"><span class="l">' + esc(tlabel(t.id)) + '</span><span class="v">' + (t.need === -1 ? 'Set' : t.need === 2 ? 'Missing' : t.need === 1 ? 'Approx' : 'Mapped') + '</span><span class="v">' + (t.dist !== null ? Math.round(t.dist) + ' m' : '') + '</span><span class="v">' + t.holes.length + '</span></button>';
    }
    if (!a.length) { h += '<div class="empty">-</div>'; }
    return h + '</div>';
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
  function startHtml() {
    var h = '<div class="sub">Starts</div><div class="chips">', i, p, k, g;
    for (i = 1; i <= 6; i++) { h += '<button type="button" data-sn="' + i + '" aria-pressed="' + (st.cards === i) + '">' + i + (i === 1 ? ' card' : ' cards') + '</button>'; }
    h += '</div>';
    if (st.cards) {
      p = startPlan(st.cards);
      if (!p) { return h + '<div class="empty">-</div>'; }
      h += '<div class="facts"><span>Conflicts ' + p.cf + '</span><span>Walk ' + f(p.w, 0) + ' min</span></div><div class="list">';
      for (k = 0; k < p.starts.length; k++) {
        i = p.starts[k]; h += '<div class="row num"><span class="n">' + (k + 1) + '</span><span class="l">Start hole ' + (i + 1) + ' ' + esc(short(st.slots[i].id)) + '</span><span class="v">' + f(p.S[i], 1) + ' min</span><span class="v"></span></div>';
      }
      h += '</div>';
      if (st.cards === 1 && p.starts[0] > 0) { h += '<button type="button" class="row" data-a="rot" data-s0="' + p.starts[0] + '"><span class="l">Rotate layout to start at hole ' + (p.starts[0] + 1) + '</span></button>'; }
    }
    if (me) {
      var bi = -1, bd = 1e9; for (i = 0; i < 18; i++) { g = H[st.slots[i].id].geo; if (g) { var dd2 = mdist([me.lat, me.lon], ll2(g.p)); if (dd2 < bd) { bd = dd2; bi = i; } } }
      if (bi >= 0) { h += '<div class="sub">Nearest to me</div><button type="button" class="row" data-i="' + bi + '"><span class="l">Hole ' + (bi + 1) + ' ' + esc(short(st.slots[bi].id)) + '</span><span class="v">' + Math.round(bd) + ' m</span><span class="v"></span><span class="v"></span></button>'; }
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
  function histHtml() {
    var h, i, d, r, lay = enc.layouts || {};
    if (st.hd) {
      var sl = seq[st.hd], g = grade(sl), rr = RD[st.hd];
      h = sheetHead(st.hd, true);
      h += '<div class="facts"><span>' + esc((lay[st.hd] || {}).name || '') + '</span></div>';
      h += '<div class="cards">' + statCell('Team', rr ? sg(rr.avg_rel, 1) : '-', null) + statCell('Best', rr ? sg(rr.best_rel, 0) : '-', null) + statCell('Teams', rr ? rr.teams : '-', null) + statCell('Expect', sg(g.rel, 1), null) + '</div>';
      h += '<div class="tools-bar"><button type="button" class="pri" data-a="loadh">Load</button></div>';
      h += '<div class="hd"><span></span><span>Hole</span><span>Par</span><span>Used</span><span>Ago</span><span>To par</span></div><div class="list">';
      for (i = 0; i < 18; i++) { h += '<div class="slot"><span class="n">' + (i + 1) + '</span><span class="l">' + esc(short(sl[i].id)) + '</span><span class="p">P' + sl[i].par + '</span><span class="v">' + usedTxt(sl[i].id) + '</span><span class="v">' + lastTxt(sl[i].id) + '</span><span class="r ' + (tested(H[sl[i].id]) ? cl(H[sl[i].id].rel) : '') + '">' + relTxt(sl[i].id) + '</span></div>'; }
      return h + '</div>';
    }
    h = sheetHead('History', true) + '<div class="hd hl"><span>Date</span><span>Par</span><span>Team</span><span>Best</span><span>Teams</span></div><div class="list">';
    for (i = 0; i < dates.length; i++) {
      d = dates[i]; r = RD[d];
      h += '<button type="button" class="row hl" data-h="' + d + '"><span class="l">' + d + '</span><span class="v">' + g18(seq[d]) + '</span><span class="v ' + (r ? cl(r.avg_rel) : '') + '">' + (r ? sg(r.avg_rel, 1) : '-') + '</span><span class="v">' + (r ? sg(r.best_rel, 0) : '-') + '</span><span class="v">' + (r ? r.teams : '-') + '</span></button>';
    }
    return h + '</div>';
  }
  function g18(sl) { var t = 0, i; for (i = 0; i < sl.length; i++) { t += sl[i].par; } return t; }
  function sheetHead(title, back) {
    return '<div class="ph">' + (back ? '<button type="button" class="bk" data-a="back" aria-label="Back">&lsaquo; Back</button>' : '') + '<h2>' + esc(title) + '</h2></div>';
  }
  function statCell(label, val, delta, inv) { return '<div class="cell"><small>' + label + '</small><strong>' + val + '</strong>' + (delta !== null ? '<em class="' + cl(delta, inv) + '">' + sg(delta, 1) + '</em>' : '') + '</div>'; }
  function dd(x, y) { return Math.abs(x - y) < 0.05 ? null : x - y; }
  function scoreHtml(g, b) {
    var h = '<div class="cards">' + statCell('To par', sg(g.rel, 1), dd(g.rel, b.rel)) + statCell('Walk min', f(g.walk, 0), dd(g.walk, b.walk)) + statCell('Cross', g.cross, dd(g.cross, b.cross)) + statCell('Rank', rank(g.rel) + '/' + (histRel.length + 1), null) + '</div>';
    if (st.more) {
      h += '<div class="cards">' + statCell('Score', f(g.exp, 1), dd(g.exp, b.exp)) + statCell('Birdies', f(g.bird, 1), dd(g.bird, b.bird), true) + statCell('Front', sg(g.front, 1), dd(g.front, b.front)) + statCell('Back', sg(g.back, 1), dd(g.back, b.back)) +
        statCell('Hard', g.hard, dd(g.hard, b.hard)) + statCell('Spread', f(g.sd, 2), dd(g.sd, b.sd)) + statCell('Par', g.par, dd(g.par, b.par)) + statCell('Throw ft', Math.round(g.ft / 10) * 10, null) + '</div>';
    }
    return h + '<button type="button" class="more" data-a="more" aria-expanded="' + st.more + '">' + (st.more ? 'Less' : 'More') + '</button>';
  }
  function routeHtml() {
    var g = grade(st.slots), b = baseGrade || g, cg = geoStats(st.slots), h = scoreHtml(g, b), i, s, o;
    h += '<div class="hd"><span></span><span>Hole</span><span>Par</span><span>Used</span><span>Ago</span><span>To par</span></div><div class="list" role="list">';
    for (i = 0; i < 18; i++) {
      s = st.slots[i]; o = H[s.id];
      h += '<button type="button" class="slot' + (cg.hit[i] ? ' warn' : '') + '" role="listitem" data-i="' + i + '"><span class="n">' + (i + 1) + '</span><span class="l">' + esc(short(s.id)) + '</span><span class="p">P' + s.par + '</span><span class="v">' + usedTxt(s.id) + '</span><span class="v' + (USE[s.id] ? '' : ' pos') + '">' + lastTxt(s.id) + '</span><span class="r ' + (tested(o) ? cl(o.rel) : '') + '">' + relTxt(s.id) + '</span></button>';
    }
    return h + '</div>';
  }
  function swapHtml() {
    var cur = st.slots[st.sel], ch = H[cur.id], cgs = geoStats(st.slots), x = cgs.hit[st.sel], i, h = sheetHead('Hole ' + (st.sel + 1) + ' ' + short(cur.id), true);
    var g0 = grade(st.slots), b0 = baseGrade || g0;
    h += '<div class="cards">' + statCell('To par', sg(g0.rel, 1), dd(g0.rel, b0.rel)) + statCell('Walk min', f(g0.walk, 0), dd(g0.walk, b0.walk)) + statCell('Cross', g0.cross, dd(g0.cross, b0.cross)) + statCell('Rank', rank(g0.rel) + '/' + (histRel.length + 1), null) + '</div>';
    h += '<div class="facts"><span>P' + cur.par + '</span><span>' + ftOf(ch) + ' ft</span><span>Walk in ' + f(cgs.legs[st.sel], 1) + ' min</span><span class="' + cl(holeRel(cur)) + '">' + sg(holeRel(cur), 2) + '</span><span>Used ' + usedTxt(cur.id) + '</span><span class="' + (USE[cur.id] ? '' : 'pos') + '">' + (USE[cur.id] ? 'Last ' + USE[cur.id].dates[0] : 'New') + '</span>' + (x ? '<span class="pos">Crosses ' + x.join(', ') + '</span>' : '') + (function () { var m = marksOn(ch), r = ''; if (m.tree) { r += '<span class="pos">Trees ' + m.tree + '</span>'; } if (m.ob) { r += '<span class="pos">OB ' + m.ob + '</span>'; } if (m.overlap) { r += '<span class="pos">Overlap ' + m.overlap + '</span>'; } return r; })() + '</div>';
    h += '<div class="tools-bar"><button type="button" data-a="up"' + (st.sel === 0 ? ' disabled' : '') + '>Earlier</button><button type="button" data-a="down"' + (st.sel === 17 ? ' disabled' : '') + '>Later</button></div>';
    h += '<div class="tools-bar"><input id="q" type="search" placeholder="Search" aria-label="Search holes" value="' + esc(st.q) + '" autocomplete="off">' +
      '<button type="button" data-s="easy" aria-pressed="' + (st.sort === 'easy') + '">Easy</button><button type="button" data-s="hard" aria-pressed="' + (st.sort === 'hard') + '">Hard</button><button type="button" data-s="bird" aria-pressed="' + (st.sort === 'bird') + '">Birdie</button><button type="button" data-a="all" aria-pressed="' + st.all + '">All</button></div>';
    h += '<div class="hd pk"><span>Replace with</span><span>Par</span><span>Used</span><span>Ago</span><span>To par</span><span>Change</span></div>';
    var list = pool.filter(function (p) { return (st.all || tested(p)) && !inLayout(p.id, st.sel) && p.id !== cur.id && (!st.q || p.label.toLowerCase().indexOf(st.q.toLowerCase()) >= 0); });
    list.sort(function (a, b) {
      if (st.sort === 'bird') { return (b.bird || 0) - (a.bird || 0); }
      var u = exp(a, a.par) - a.par, w = exp(b, b.par) - b.par; return st.sort === 'hard' ? w - u : u - w;
    });
    h += '<div class="list">';
    for (i = 0; i < list.length && i < 80; i++) {
      var p = list[i], dl = exp(p, p.par) - exp(ch, cur.par);
      h += '<button type="button" class="row pk" data-pick="' + esc(p.id) + '"><span class="l">' + esc(short(p.id)) + '</span><span class="v">P' + p.par + '</span><span class="v">' + usedTxt(p.id) + '</span><span class="v' + (USE[p.id] ? '' : ' pos') + '">' + lastTxt(p.id) + '</span><span class="v ' + cl(p.rel) + '">' + relTxt(p.id) + '</span><span class="v ' + cl(dl) + '">' + sg(dl, 2) + '</span></button>';
    }
    if (!list.length) { h += '<div class="empty">-</div>'; }
    return h + '</div>';
  }
  function autoHtml() {
    var h = sheetHead('Auto', st.prev ? false : true), i;
    h += '<div class="chips">';
    for (i = 0; i < GOALS.length; i++) { h += '<button type="button" data-ag="' + GOALS[i][0] + '" aria-pressed="' + (st.pgoal === GOALS[i][0]) + '">' + GOALS[i][1] + '</button>'; }
    h += '</div>';
    if (st.prev) {
      var g = grade(st.prev), b = grade(st.slots), cnt = 0;
      for (i = 0; i < 18; i++) { if (st.prev[i].id !== st.slots[i].id) { cnt++; } }
      h += '<div class="cards">' + statCell('To par', sg(g.rel, 1), dd(g.rel, b.rel)) + statCell('Walk min', f(g.walk, 0), dd(g.walk, b.walk)) + statCell('Cross', g.cross, dd(g.cross, b.cross)) + statCell('Changed', cnt, null) + '</div>';
      h += '<div class="tools-bar"><button type="button" class="pri" data-a="apply">Apply</button><button type="button" data-a="discard">Discard</button></div><div class="list">';
      for (i = 0; i < 18; i++) {
        var ch = st.prev[i].id !== st.slots[i].id;
        h += '<div class="row num' + (ch ? ' chg' : '') + '"><span class="n">' + (i + 1) + '</span><span class="l">' + esc(short(st.prev[i].id)) + '</span><span class="v">P' + st.prev[i].par + '</span><span class="v">' + ftOf(H[st.prev[i].id]) + '</span></div>';
      }
      h += '</div>';
    } else if (st.pgoal) { h += '<div class="empty">-</div>'; }
    h += '<div class="sub">Reorder only</div><button type="button" class="row" data-a="order"><span class="l">Shortest walk, same holes</span></button>';
    return h + startHtml();
  }
  function renderSheet() {
    var h = st.view === 'swap' && st.sel >= 0 ? swapHtml() : st.view === 'auto' ? autoHtml() : st.view === 'pins' ? pinsHtml() : st.view === 'hist' ? histHtml() : routeHtml();
    $('sheet').innerHTML = h;
    $('auto').setAttribute('aria-pressed', st.view === 'auto'); $('pinsBtn').setAttribute('aria-pressed', st.view === 'pins'); $('histBtn').setAttribute('aria-pressed', st.view === 'hist');
    if (st.focusQ) { var q = $('q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } st.focusQ = false; }
  }
  function renderBase() {
    var h = '<option value="">Blank</option>', i;
    for (i = 0; i < dates.length; i++) { h += '<option value="' + dates[i] + '"' + (dates[i] === st.base ? ' selected' : '') + '>' + dates[i] + '</option>'; }
    $('base').innerHTML = h;
  }
  function renderAll() { renderSheet(); drawAll(); drawMap(); drawPins(); $('undo').disabled = !hist.length; }
  function pick(i) { st.sel = i; st.view = 'swap'; st.hover = null; st.focus = true; setCollapsed(false); renderAll(); }
  function replaceWith(id) { snap(); st.slots[st.sel] = { id: id, par: H[id].par }; st.hover = null; save(); st.focus = true; renderAll(); }
  function applyOrder() { var r = bestOrder(); if (!r) { return; } snap(); st.slots = r.perm.map(function (k) { return st.slots[k]; }); st.sel = -1; st.view = 'route'; save(); renderAll(); }
  function move(d) { var j = st.sel + d; if (j < 0 || j > 17) { return; } snap(); var t = st.slots[st.sel]; st.slots[st.sel] = st.slots[j]; st.slots[j] = t; st.sel = j; save(); renderAll(); }
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
    $('base').addEventListener('change', function () { if (this.value) { loadBase(this.value); } else { st.base = ''; baseGrade = grade(st.slots); save(); } st.fit = true; renderAll(); });
    $('undo').addEventListener('click', undo);
    $('reset').addEventListener('click', function () { var h0 = JSON.stringify(st.slots); loadBase(st.base || dates[0]); hist = [h0]; renderBase(); st.fit = true; renderAll(); });
    $('copy').addEventListener('click', copyText);
    $('auto').addEventListener('click', function () { if (st.view === 'auto') { back(); } else { st.view = 'auto'; st.sel = -1; st.prev = null; st.pgoal = null; setCollapsed(false); renderAll(); } });
    $('pinsBtn').addEventListener('click', function () { if (st.view === 'pins') { back(); } else { st.view = 'pins'; st.sel = -1; st.prev = null; st.tgt = null; setCollapsed(false); renderAll(); } });
    $('histBtn').addEventListener('click', function () { if (st.view === 'hist') { st.hd = null; st.prev = null; back(); } else { st.view = 'hist'; st.hd = null; st.sel = -1; st.prev = null; st.tgt = null; setCollapsed(false); renderAll(); } });
    $('loc').addEventListener('click', function () { locate(true); });
    $('fit').addEventListener('click', function () { st.fit = true; drawMap(); });
    $('grip').addEventListener('click', function () { setCollapsed(document.body.getAttribute('data-sheet') !== 'min'); });
    $('sheet').addEventListener('input', function (e) { if (e.target.id === 'q') { st.q = e.target.value; st.focusQ = true; renderSheet(); } });
    $('sheet').addEventListener('mouseover', function (e) {
      var t = e.target; while (t && t !== this && !(t.getAttribute && t.getAttribute('data-pick'))) { t = t.parentNode; }
      var id = t && t.getAttribute ? t.getAttribute('data-pick') : null; if (id !== st.hover) { st.hover = id; drawMap(); }
    });
    $('sheet').addEventListener('click', function (e) {
      var t = e.target; while (t && t !== this && t.tagName !== 'BUTTON') { t = t.parentNode; }
      if (!t || t.tagName !== 'BUTTON' || t.disabled) { return; }
      var hv = t.getAttribute('data-h'); if (hv) { st.hd = hv; st.prev = seq[hv].map(function (q) { return { id: q.id, par: q.par }; }); st.fit = true; renderAll(); return; }
      var tg = t.getAttribute('data-t'), pfv = t.getAttribute('data-pf'), mkv = t.getAttribute('data-mk'), mdv = t.getAttribute('data-md'), snv = t.getAttribute('data-sn');
      if (tg) { st.tgt = tg; st.pf = st.pf === 'marks' ? 'need' : st.pf; var tt0 = tgtObj(tg), pp0 = tt0 ? tpos(tt0) : null; if (pp0 && map) { map.setView(pp0, 19, { animate: false }); } renderAll(); return; }
      if (pfv) { st.pf = pfv; st.tgt = null; renderAll(); return; }
      if (mkv) { st.mk = mkv; renderSheet(); return; }
      if (mdv) { delMark(mdv); return; }
      if (snv) { st.cards = parseInt(snv, 10); renderSheet(); return; }
      var a = t.getAttribute('data-a'), s = t.getAttribute('data-s'), pk = t.getAttribute('data-pick'), ag = t.getAttribute('data-ag'), di = t.getAttribute('data-i');
      if (di !== null) { pick(parseInt(di, 10)); }
      else if (pk) { st.hover = pk; replaceWith(pk); }
      else if (ag) { st.pgoal = ag; st.prev = buildLayout(ag); st.fit = true; renderAll(); }
      else if (s) { st.sort = s; renderSheet(); }
      else if (a === 'back') { back(); } else if (a === 'up') { move(-1); } else if (a === 'down') { move(1); }
      else if (a === 'all') { st.all = !st.all; renderSheet(); } else if (a === 'more') { st.more = !st.more; renderSheet(); }
      else if (a === 'order') { applyOrder(); }
      else if (a === 'loadh') { if (st.hd) { loadBase(st.hd); st.view = 'route'; st.hd = null; st.prev = null; renderBase(); st.fit = true; renderAll(); } }
      else if (a === 'place') { var c0 = map.getCenter(); placeAt(c0.lat, c0.lng); }
      else if (a === 'here') { if (me) { placeAt(me.lat, me.lon); } }
      else if (a === 'list') { st.tgt = null; renderAll(); }
      else if (a === 'rot') { var s0 = parseInt(t.getAttribute('data-s0'), 10); snap(); st.slots = st.slots.slice(s0).concat(st.slots.slice(0, s0)); st.cards = 0; save(); renderAll(); }
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
    histRel = dates.map(function (x) { return grade(seq[x]).rel; });
    var saved = load();
    if (saved) { st.base = saved.base; st.slots = saved.slots; baseGrade = st.base && seq[st.base] ? grade(seq[st.base]) : grade(st.slots); }
    else { loadBase(dates[0]); }
    buildUse(); loadPinsLocal(); applyPins(); renderBase(); initMap(); renderAll(); pullPins(function () { applyPins(); histRel = dates.map(function (x) { return grade(seq[x]).rel; }); renderAll(); });
  }
  init();
})();
