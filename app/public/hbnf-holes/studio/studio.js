(function () {
  'use strict';
  var bldCache0 = null, GEO = null, TI = {}, KEY = 'hbnf-studio-v2', MIN_N = 4, K = 6, PRIOR = { 3: -0.4, 4: 0.3 }, BPRIOR = 25, hist = [], histRel = [];
  var $ = function (id) { return document.getElementById(id); };
  var enc = null, H = {}, pool = [], seq = {}, dates = [];
  var st = { base: null, slots: [], sel: -1, view: 'route', sort: 'easy', all: false, q: '', goal: 'easier', more: false, prev: null, pgoal: null, hover: null };
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
  var map = null, L = window.L, layers = { all: null, route: null, ghost: null, hov: null }, MAPOK = false;
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
    drawLayout(layers.route, st.slots, {});
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
    layers.all = L.layerGroup().addTo(map); layers.route = L.layerGroup().addTo(map); layers.ghost = L.layerGroup().addTo(map); layers.hov = L.layerGroup().addTo(map);
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
    h += '<div class="list" role="list">';
    for (i = 0; i < 18; i++) {
      s = st.slots[i]; o = H[s.id];
      h += '<button type="button" class="slot' + (cg.hit[i] ? ' warn' : '') + '" role="listitem" data-i="' + i + '"><span class="n">' + (i + 1) + '</span><span class="l">' + esc(short(s.id)) + '</span><span class="p">P' + s.par + '</span><span class="v">' + ftOf(o) + '</span><span class="r ' + (tested(o) ? cl(o.rel) : '') + '">' + (tested(o) ? sg(o.rel, 1) : '-') + '</span></button>';
    }
    return h + '</div>';
  }
  function swapHtml() {
    var cur = st.slots[st.sel], ch = H[cur.id], cgs = geoStats(st.slots), x = cgs.hit[st.sel], i, h = sheetHead('Hole ' + (st.sel + 1) + ' ' + short(cur.id), true);
    var g0 = grade(st.slots), b0 = baseGrade || g0;
    h += '<div class="cards">' + statCell('To par', sg(g0.rel, 1), dd(g0.rel, b0.rel)) + statCell('Walk min', f(g0.walk, 0), dd(g0.walk, b0.walk)) + statCell('Cross', g0.cross, dd(g0.cross, b0.cross)) + statCell('Rank', rank(g0.rel) + '/' + (histRel.length + 1), null) + '</div>';
    h += '<div class="facts"><span>P' + cur.par + '</span><span>' + ftOf(ch) + ' ft</span><span>Walk in ' + f(cgs.legs[st.sel], 1) + ' min</span><span class="' + cl(holeRel(cur)) + '">' + sg(holeRel(cur), 2) + '</span>' + (x ? '<span class="pos">Crosses ' + x.join(', ') + '</span>' : '') + '</div>';
    h += '<div class="tools-bar"><button type="button" data-a="up"' + (st.sel === 0 ? ' disabled' : '') + '>Earlier</button><button type="button" data-a="down"' + (st.sel === 17 ? ' disabled' : '') + '>Later</button></div>';
    h += '<div class="tools-bar"><input id="q" type="search" placeholder="Search" aria-label="Search holes" value="' + esc(st.q) + '" autocomplete="off">' +
      '<button type="button" data-s="easy" aria-pressed="' + (st.sort === 'easy') + '">Easy</button><button type="button" data-s="hard" aria-pressed="' + (st.sort === 'hard') + '">Hard</button><button type="button" data-s="bird" aria-pressed="' + (st.sort === 'bird') + '">Birdie</button><button type="button" data-a="all" aria-pressed="' + st.all + '">All</button></div>';
    h += '<div class="sub">Replace with</div>';
    var list = pool.filter(function (p) { return (st.all || tested(p)) && !inLayout(p.id, st.sel) && p.id !== cur.id && (!st.q || p.label.toLowerCase().indexOf(st.q.toLowerCase()) >= 0); });
    list.sort(function (a, b) {
      if (st.sort === 'bird') { return (b.bird || 0) - (a.bird || 0); }
      var u = exp(a, a.par) - a.par, w = exp(b, b.par) - b.par; return st.sort === 'hard' ? w - u : u - w;
    });
    h += '<div class="list">';
    for (i = 0; i < list.length && i < 80; i++) {
      var p = list[i], dl = exp(p, p.par) - exp(ch, cur.par);
      h += '<button type="button" class="row" data-pick="' + esc(p.id) + '"><span class="l">' + esc(short(p.id)) + '</span><span class="v">P' + p.par + '</span><span class="v">' + ftOf(p) + '</span><span class="v ' + cl(dl) + '">' + sg(dl, 2) + '</span></button>';
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
    return h;
  }
  function renderSheet() {
    var h = st.view === 'swap' && st.sel >= 0 ? swapHtml() : st.view === 'auto' ? autoHtml() : routeHtml();
    $('sheet').innerHTML = h;
    var a = $('auto'); a.setAttribute('aria-pressed', st.view === 'auto');
    if (st.focusQ) { var q = $('q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } st.focusQ = false; }
  }
  function renderBase() {
    var h = '<option value="">Blank</option>', i;
    for (i = 0; i < dates.length; i++) { h += '<option value="' + dates[i] + '"' + (dates[i] === st.base ? ' selected' : '') + '>' + dates[i] + '</option>'; }
    $('base').innerHTML = h;
  }
  function renderAll() { renderSheet(); drawAll(); drawMap(); $('undo').disabled = !hist.length; }
  function pick(i) { st.sel = i; st.view = 'swap'; st.hover = null; st.focus = true; setCollapsed(false); renderAll(); }
  function replaceWith(id) { snap(); st.slots[st.sel] = { id: id, par: H[id].par }; st.hover = null; save(); st.focus = true; renderAll(); }
  function applyOrder() { var r = bestOrder(); if (!r) { return; } snap(); st.slots = r.perm.map(function (k) { return st.slots[k]; }); st.sel = -1; st.view = 'route'; save(); renderAll(); }
  function move(d) { var j = st.sel + d; if (j < 0 || j > 17) { return; } snap(); var t = st.slots[st.sel]; st.slots[st.sel] = st.slots[j]; st.slots[j] = t; st.sel = j; save(); renderAll(); }
  function back() { st.view = 'route'; st.sel = -1; st.prev = null; st.pgoal = null; st.hover = null; st.fit = true; renderAll(); }
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
    $('grip').addEventListener('click', function () { setCollapsed(document.body.getAttribute('data-sheet') !== 'min'); });
    $('sheet').addEventListener('input', function (e) { if (e.target.id === 'q') { st.q = e.target.value; st.focusQ = true; renderSheet(); } });
    $('sheet').addEventListener('mouseover', function (e) {
      var t = e.target; while (t && t !== this && !(t.getAttribute && t.getAttribute('data-pick'))) { t = t.parentNode; }
      var id = t && t.getAttribute ? t.getAttribute('data-pick') : null; if (id !== st.hover) { st.hover = id; drawMap(); }
    });
    $('sheet').addEventListener('click', function (e) {
      var t = e.target; while (t && t !== this && t.tagName !== 'BUTTON') { t = t.parentNode; }
      if (!t || t.tagName !== 'BUTTON' || t.disabled) { return; }
      var a = t.getAttribute('data-a'), s = t.getAttribute('data-s'), pk = t.getAttribute('data-pick'), ag = t.getAttribute('data-ag'), di = t.getAttribute('data-i');
      if (di !== null) { pick(parseInt(di, 10)); }
      else if (pk) { st.hover = pk; replaceWith(pk); }
      else if (ag) { st.pgoal = ag; st.prev = buildLayout(ag); st.fit = true; renderAll(); }
      else if (s) { st.sort = s; renderSheet(); }
      else if (a === 'back') { back(); } else if (a === 'up') { move(-1); } else if (a === 'down') { move(1); }
      else if (a === 'all') { st.all = !st.all; renderSheet(); } else if (a === 'more') { st.more = !st.more; renderSheet(); }
      else if (a === 'order') { applyOrder(); }
      else if (a === 'apply') { if (st.prev) { snap(); st.slots = st.prev.slice(); st.prev = null; st.pgoal = null; st.view = 'route'; save(); renderAll(); } }
      else if (a === 'discard') { st.prev = null; st.pgoal = null; renderAll(); }
    });
    get('/hbnf-holes/hole_encyclopedia.json', function (d) {
      if (!d) { return; }
      enc = d; prep();
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
    renderBase(); initMap(); renderAll();
  }
  init();
})();
