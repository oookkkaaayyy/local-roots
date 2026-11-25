(function () {
  'use strict';
  var GEO = null, TI = {}, KEY = 'hbnf-studio-v1', MIN_N = 4, K = 6, PRIOR = { 3: -0.4, 4: 0.3 }, BPRIOR = 25, hist = [], histRel = [];
  var $ = function (id) { return document.getElementById(id); };
  var enc = null, H = {}, pool = [], seq = {}, dates = [];
  var st = { base: null, slots: [], sel: 0, tab: 'swap', sort: 'easy', all: false, q: '', goal: 'easier' };
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
  function loadBase(d) {
    st.base = d;
    st.slots = seq[d].map(function (s) { return { id: s.id, par: s.par }; });
    baseGrade = grade(st.slots);
    st.sel = 0; hist = []; save();
  }
  function renderBase() {
    var h = '<option value="">Blank</option>', i;
    for (i = 0; i < dates.length; i++) { h += '<option value="' + dates[i] + '"' + (dates[i] === st.base ? ' selected' : '') + '>' + dates[i] + '</option>'; }
    $('base').innerHTML = h;
  }
  function renderSlots() {
    var h = '', i, s, o, cg = geoStats(st.slots);
    for (i = 0; i < 18; i++) {
      s = st.slots[i]; o = H[s.id];
      h += '<button type="button" class="slot' + (cg.hit[i] ? ' warn' : '') + '" role="listitem" data-i="' + i + '"' + (i === st.sel ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' +
        '<span class="n">' + (i + 1) + '</span><span class="l">' + esc(o.label.replace(/\s*\(.*\)\s*$/, '')) + '</span><span class="p">P' + s.par + '</span>' +
        '<span class="r ' + (tested(o) ? cl(o.rel) : '') + '">' + (tested(o) ? sg(o.rel, 1) : '-') + '</span></button>';
    }
    $('slots').innerHTML = h;
  }
  function renderCards() {
    var g = grade(st.slots), b = baseGrade || g;
    function c(label, val, delta, inv) { return '<div class="cell"><small>' + label + '</small><strong>' + val + '</strong>' + (delta !== null ? '<em class="' + cl(delta, inv) + '">' + sg(delta, 1) + '</em>' : '') + '</div>'; }
    function d(x, y) { return Math.abs(x - y) < 0.05 ? null : x - y; }
    $('cards').innerHTML =
      c('Score', f(g.exp, 1), d(g.exp, b.exp)) + c('To par', sg(g.rel, 1), d(g.rel, b.rel)) + c('Birdies', f(g.bird, 1), d(g.bird, b.bird), true) +
      c('Par', g.par, d(g.par, b.par)) + c('Front', sg(g.front, 1), d(g.front, b.front)) + c('Back', sg(g.back, 1), d(g.back, b.back)) +
      c('Hard', g.hard, d(g.hard, b.hard)) + c('Spread', f(g.sd, 2), d(g.sd, b.sd)) + c('Rank', rank(g.rel) + '/' + (histRel.length + 1), null) +
      (GEO ? c('Walk min', f(g.walk, 0), d(g.walk, b.walk)) + c('Throw ft', Math.round(g.ft / 10) * 10, null) + c('Cross', g.cross, d(g.cross, b.cross)) : '');
  }
  function ftOf(p) { return p.geo ? Math.round(p.geo.d * 3.28084 / 5) * 5 : '-'; }
  function rank(rel) { var r = 1, i; for (i = 0; i < histRel.length; i++) { if (histRel[i] < rel) { r++; } } return r; }
  function snap() { hist.push(JSON.stringify(st.slots)); if (hist.length > 50) { hist.shift(); } }
  function undo() { if (hist.length) { st.slots = JSON.parse(hist.pop()); save(); renderAll(); } }
  function inLayout(id, except) { for (var i = 0; i < 18; i++) { if (i !== except && st.slots[i].id === id) { return true; } } return false; }
  function renderTools() {
    var h = '', i, cur = st.slots[st.sel], ch = H[cur.id];
    $('tSwap').setAttribute('aria-selected', st.tab === 'swap'); $('tSug').setAttribute('aria-selected', st.tab === 'sug'); $('tOrd').setAttribute('aria-selected', st.tab === 'ord');
    if (st.tab === 'swap') {
      h += '<div class="tools-bar"><button type="button" data-a="up"' + (st.sel === 0 ? ' disabled' : '') + '>Up</button><button type="button" data-a="down"' + (st.sel === 17 ? ' disabled' : '') + '>Down</button>' +
        '<input id="q" type="search" placeholder="Search" aria-label="Search holes" value="' + esc(st.q) + '" autocomplete="off">' +
        '<button type="button" data-s="easy" aria-pressed="' + (st.sort === 'easy') + '">Easy</button><button type="button" data-s="hard" aria-pressed="' + (st.sort === 'hard') + '">Hard</button><button type="button" data-s="bird" aria-pressed="' + (st.sort === 'bird') + '">Birdie</button>' +
        '<button type="button" data-a="all" aria-pressed="' + st.all + '">All</button></div>';
      var list = pool.filter(function (p) { return (st.all || tested(p)) && (!st.q || p.label.toLowerCase().indexOf(st.q.toLowerCase()) >= 0); });
      list.sort(function (a, b) {
        if (st.sort === 'bird') { return (b.bird || 0) - (a.bird || 0); }
        var x = exp(a, a.par) - a.par, y = exp(b, b.par) - b.par;
        return st.sort === 'hard' ? y - x : x - y;
      });
      var cgs = geoStats(st.slots), x = cgs.hit[st.sel];
      h += '<p class="sub">Slot ' + (st.sel + 1) + ' ' + esc(ch.label.replace(/\s*\(.*\)\s*$/, '')) + (ch.geo ? ' | ' + ftOf(ch) + ' ft | walk in ' + f(cgs.legs[st.sel], 1) + ' min' + (x ? ' | crosses ' + x.join(', ') : '') : '') + '</p>';
      for (i = 0; i < list.length && i < 120; i++) {
        var p = list[i], used = inLayout(p.id, st.sel), dl = exp(p, p.par) - exp(ch, cur.par);
        h += '<button type="button" class="row" data-pick="' + esc(p.id) + '"' + (used ? ' disabled' : '') + '><span class="l">' + esc(p.label.replace(/\s*\(.*\)\s*$/, '')) + '</span><span class="v">P' + p.par + '</span><span class="v">' + ftOf(p) + '</span><span class="v">' + f(exp(p, p.par), 2) + '</span><span class="v ' + cl(dl) + '">' + sg(dl, 2) + '</span></button>';
      }
      if (!list.length) { h += '<div class="empty">-</div>'; }
    } else if (st.tab === 'ord') {
      h += orderHtml();
    } else {
      h += '<div class="tools-bar">';
      for (i = 0; i < GOALS.length; i++) { h += '<button type="button" data-g="' + GOALS[i][0] + '" aria-pressed="' + (st.goal === GOALS[i][0]) + '">' + GOALS[i][1] + '</button>'; }
      h += '</div>';
      var sug = suggest(st.goal);
      for (i = 0; i < sug.length; i++) {
        var s = sug[i];
        h += '<button type="button" class="row" data-apply="' + s.i + '|' + esc(s.to) + '"><span class="l">' + (s.i + 1) + ': ' + esc(H[st.slots[s.i].id].label.replace(/\s*\(.*\)\s*$/, '')) + ' > ' + esc(H[s.to].label.replace(/\s*\(.*\)\s*$/, '')) + '</span><span class="v">P' + H[s.to].par + '</span><span class="v">' + ftOf(H[s.to]) + '</span><span class="v">' + f(exp(H[s.to], H[s.to].par), 2) + '</span><span class="v neg">' + sg(s.gain, 2) + '</span></button>';
      }
      if (!sug.length) { h += '<div class="empty">-</div>'; }
    }
    $('toolBody').innerHTML = h;
    if (st.tab === 'swap' && st.focusQ) { var q = $('q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } st.focusQ = false; }
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
  function orderHtml() {
    if (!GEO) { return '<div class="empty">-</div>'; }
    var r = bestOrder(), cur = geoStats(st.slots), h = '', i;
    if (!r) { return '<div class="empty">-</div>'; }
    ordCache = r;
    var ns = r.perm.map(function (k) { return st.slots[k]; }), ng = geoStats(ns);
    h += '<button type="button" class="row" data-a="order"><span class="l">Apply order</span><span class="v">Walk min</span><span class="v">' + f(cur.walk, 1) + '</span><span class="v neg">' + f(ng.walk, 1) + '</span><span class="v ' + (ng.cross > cur.cross ? 'pos' : '') + '">Cross ' + ng.cross + '</span></button>';
    for (i = 0; i < 18; i++) { h += '<div class="row" aria-hidden="false"><span class="l">' + (i + 1) + ' ' + esc(H[ns[i].id].label.replace(/\s*\(.*\)\s*$/, '')) + '</span><span class="v">P' + ns[i].par + '</span><span class="v">' + ftOf(H[ns[i].id]) + '</span><span class="v">' + f(ng.legs[i], 1) + '</span><span class="v"></span></div>'; }
    return h;
  }
  function applyOrder() { if (!ordCache) { return; } snap(); st.slots = ordCache.perm.map(function (k) { return st.slots[k]; }); st.sel = 0; save(); renderAll(); }
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
  function renderAll() { renderSlots(); renderCards(); renderTools(); }
  function setView(v) {
    document.body.setAttribute('data-view', v);
    var b = document.querySelectorAll('.mnav button'), i;
    for (i = 0; i < b.length; i++) { b[i].setAttribute('aria-pressed', b[i].getAttribute('data-v') === v); }
  }
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
  function move(d) {
    var j = st.sel + d; if (j < 0 || j > 17) { return; }
    snap(); var t = st.slots[st.sel]; st.slots[st.sel] = st.slots[j]; st.slots[j] = t; st.sel = j; save(); renderAll();
  }
  function init() {
    $('base').addEventListener('change', function () {
      if (this.value) { loadBase(this.value); } else { st.base = ''; baseGrade = grade(st.slots); save(); }
      renderAll();
    });
    $('undo').addEventListener('click', undo);
    $('reset').addEventListener('click', function () { var h0 = JSON.stringify(st.slots); loadBase(st.base || dates[0]); hist = [h0]; renderBase(); renderAll(); });
    $('copy').addEventListener('click', copyText);
    $('slots').addEventListener('click', function (e) {
      var t = e.target; while (t && t !== this && !(t.getAttribute && t.getAttribute('data-i'))) { t = t.parentNode; }
      if (t && t.getAttribute && t.getAttribute('data-i')) { st.sel = parseInt(t.getAttribute('data-i'), 10); st.tab = 'swap'; renderAll(); if (window.innerWidth <= 760) { setView('tools'); } }
    });
    $('tSwap').addEventListener('click', function () { st.tab = 'swap'; renderTools(); });
    $('tSug').addEventListener('click', function () { st.tab = 'sug'; renderTools(); });
    $('tOrd').addEventListener('click', function () { st.tab = 'ord'; renderTools(); });
    var mb = document.querySelectorAll('.mnav button'), i;
    for (i = 0; i < mb.length; i++) { mb[i].addEventListener('click', function () { setView(this.getAttribute('data-v')); }); }
    $('toolBody').addEventListener('input', function (e) { if (e.target.id === 'q') { st.q = e.target.value; st.focusQ = true; renderTools(); } });
    $('toolBody').addEventListener('click', function (e) {
      var t = e.target; while (t && t !== this && t.tagName !== 'BUTTON') { t = t.parentNode; }
      if (!t || t.tagName !== 'BUTTON' || t.disabled) { return; }
      var a = t.getAttribute('data-a'), s = t.getAttribute('data-s'), g = t.getAttribute('data-g'), pk = t.getAttribute('data-pick'), ap = t.getAttribute('data-apply');
      if (a === 'up') { move(-1); } else if (a === 'down') { move(1); } else if (a === 'all') { st.all = !st.all; renderTools(); }
      else if (s) { st.sort = s; renderTools(); } else if (g) { st.goal = g; renderTools(); }
      else if (a === 'order') { applyOrder(); } else if (pk) { snap(); st.slots[st.sel] = { id: pk, par: H[pk].par }; save(); renderAll(); }
      else if (ap) { snap(); var p = ap.split('|'); st.slots[parseInt(p[0], 10)] = { id: p[1], par: H[p[1]].par }; st.sel = parseInt(p[0], 10); save(); renderAll(); }
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
    renderBase(); renderAll();
  }
  init();
})();
