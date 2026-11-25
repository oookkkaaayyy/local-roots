(function () {
  'use strict';
  var KEY = 'hbnf-studio-v1', MIN_N = 4;
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
    for (i = 0; i < enc.holes.length; i++) {
      h = H[enc.holes[i].hole_id];
      if (h.id.indexOf('unresolved') < 0 && h.id.indexOf('temp') < 0) { pool.push(h); }
    }
  }
  function tested(h) { return h.n >= MIN_N; }
  function exp(h, par) { return tested(h) ? h.avg : par - 0.5; }
  function grade(slots) {
    var g = { exp: 0, par: 0, bird: 0, front: 0, back: 0, hard: 0, untested: 0, par4: 0, rels: [] }, i, h, r;
    for (i = 0; i < slots.length; i++) {
      h = H[slots[i].id]; r = exp(h, slots[i].par) - slots[i].par;
      g.exp += exp(h, slots[i].par); g.par += slots[i].par; g.rels.push(r);
      if (i < 9) { g.front += r; } else { g.back += r; }
      if (tested(h)) { g.bird += (h.bird || 0) / 100; if (h.bog >= 15) { g.hard++; } } else { g.untested++; }
      if (slots[i].par >= 4) { g.par4++; }
    }
    g.rel = g.exp - g.par;
    var m = g.rels.reduce(function (a, b) { return a + b; }, 0) / g.rels.length;
    g.sd = Math.sqrt(g.rels.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / g.rels.length);
    return g;
  }
  function objective(goal, g) {
    if (goal === 'easier') { return -g.exp; }
    if (goal === 'harder') { return g.exp; }
    if (goal === 'birdies') { return g.bird; }
    if (goal === 'faster') { return -(g.exp + 0.5 * g.par4); }
    return -(g.sd + 0.5 * Math.abs(g.front - g.back));
  }
  var GOALS = [['easier', 'Easier'], ['harder', 'Harder'], ['birdies', 'Birdies'], ['faster', 'Faster'], ['balance', 'Balance']];
  function guideText(id, par) {
    var h = H[id], t = h.occ.length ? h.occ[h.occ.length - 1].source_text : h.label;
    t = t.replace(/→/g, 'to').replace(/★/g, '').replace(/\(par[^)]*\)/ig, '').replace(/\s+/g, ' ').trim();
    return par !== 3 ? t + ' (par ' + par + ')' : t;
  }
  function loadBase(d) {
    st.base = d;
    st.slots = seq[d].map(function (s) { return { id: s.id, par: s.par }; });
    baseGrade = grade(st.slots);
    st.sel = 0; save();
  }
  function renderBase() {
    var h = '<option value="">Blank</option>', i;
    for (i = 0; i < dates.length; i++) { h += '<option value="' + dates[i] + '"' + (dates[i] === st.base ? ' selected' : '') + '>' + dates[i] + '</option>'; }
    $('base').innerHTML = h;
  }
  function renderSlots() {
    var h = '', i, s, o;
    for (i = 0; i < 18; i++) {
      s = st.slots[i]; o = H[s.id];
      h += '<button type="button" class="slot" role="listitem" data-i="' + i + '"' + (i === st.sel ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' +
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
      c('Hard', g.hard, d(g.hard, b.hard)) + c('Untested', g.untested, d(g.untested, b.untested)) +
      c('Spread', f(g.sd, 2), d(g.sd, b.sd)) + c('Par 4+', g.par4, d(g.par4, b.par4));
  }
  function inLayout(id, except) { for (var i = 0; i < 18; i++) { if (i !== except && st.slots[i].id === id) { return true; } } return false; }
  function renderTools() {
    var h = '', i, cur = st.slots[st.sel], ch = H[cur.id];
    $('tSwap').setAttribute('aria-selected', st.tab === 'swap'); $('tSug').setAttribute('aria-selected', st.tab === 'sug');
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
      h += '<p class="sub">Slot ' + (st.sel + 1) + ' ' + esc(ch.label.replace(/\s*\(.*\)\s*$/, '')) + '</p>';
      for (i = 0; i < list.length && i < 120; i++) {
        var p = list[i], used = inLayout(p.id, st.sel), dl = exp(p, p.par) - exp(ch, cur.par);
        h += '<button type="button" class="row" data-pick="' + esc(p.id) + '"' + (used ? ' disabled' : '') + '><span class="l">' + esc(p.label.replace(/\s*\(.*\)\s*$/, '')) + '</span><span class="v">P' + p.par + '</span><span class="v">' + (tested(p) ? f(p.avg, 2) : '-') + '</span><span class="v ' + cl(dl) + '">' + sg(dl, 2) + '</span></button>';
      }
      if (!list.length) { h += '<div class="empty">-</div>'; }
    } else {
      h += '<div class="tools-bar">';
      for (i = 0; i < GOALS.length; i++) { h += '<button type="button" data-g="' + GOALS[i][0] + '" aria-pressed="' + (st.goal === GOALS[i][0]) + '">' + GOALS[i][1] + '</button>'; }
      h += '</div>';
      var sug = suggest(st.goal);
      for (i = 0; i < sug.length; i++) {
        var s = sug[i];
        h += '<button type="button" class="row" data-apply="' + s.i + '|' + esc(s.to) + '"><span class="l">' + (s.i + 1) + ': ' + esc(H[st.slots[s.i].id].label.replace(/\s*\(.*\)\s*$/, '')) + ' > ' + esc(H[s.to].label.replace(/\s*\(.*\)\s*$/, '')) + '</span><span class="v">P' + H[s.to].par + '</span><span class="v">' + f(H[s.to].avg, 2) + '</span><span class="v neg">' + sg(s.gain, 2) + '</span></button>';
      }
      if (!sug.length) { h += '<div class="empty">-</div>'; }
    }
    $('toolBody').innerHTML = h;
    if (st.tab === 'swap' && st.focusQ) { var q = $('q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } st.focusQ = false; }
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
    var seen = {}, res = [];
    for (i = 0; i < out.length && res.length < 10; i++) { if (!seen[out[i].i]) { seen[out[i].i] = 1; res.push(out[i]); } }
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
    var t = st.slots[st.sel]; st.slots[st.sel] = st.slots[j]; st.slots[j] = t; st.sel = j; save(); renderAll();
  }
  function init() {
    $('base').addEventListener('change', function () {
      if (this.value) { loadBase(this.value); } else { st.base = ''; baseGrade = grade(st.slots); save(); }
      renderAll();
    });
    $('reset').addEventListener('click', function () { loadBase(st.base || dates[0]); renderBase(); renderAll(); });
    $('copy').addEventListener('click', copyText);
    $('slots').addEventListener('click', function (e) {
      var t = e.target; while (t && t !== this && !(t.getAttribute && t.getAttribute('data-i'))) { t = t.parentNode; }
      if (t && t.getAttribute && t.getAttribute('data-i')) { st.sel = parseInt(t.getAttribute('data-i'), 10); st.tab = 'swap'; renderAll(); if (window.innerWidth <= 760) { setView('tools'); } }
    });
    $('tSwap').addEventListener('click', function () { st.tab = 'swap'; renderTools(); });
    $('tSug').addEventListener('click', function () { st.tab = 'sug'; renderTools(); });
    var mb = document.querySelectorAll('.mnav button'), i;
    for (i = 0; i < mb.length; i++) { mb[i].addEventListener('click', function () { setView(this.getAttribute('data-v')); }); }
    $('toolBody').addEventListener('input', function (e) { if (e.target.id === 'q') { st.q = e.target.value; st.focusQ = true; renderTools(); } });
    $('toolBody').addEventListener('click', function (e) {
      var t = e.target; while (t && t !== this && t.tagName !== 'BUTTON') { t = t.parentNode; }
      if (!t || t.tagName !== 'BUTTON' || t.disabled) { return; }
      var a = t.getAttribute('data-a'), s = t.getAttribute('data-s'), g = t.getAttribute('data-g'), pk = t.getAttribute('data-pick'), ap = t.getAttribute('data-apply');
      if (a === 'up') { move(-1); } else if (a === 'down') { move(1); } else if (a === 'all') { st.all = !st.all; renderTools(); }
      else if (s) { st.sort = s; renderTools(); } else if (g) { st.goal = g; renderTools(); }
      else if (pk) { st.slots[st.sel] = { id: pk, par: H[pk].par }; save(); renderAll(); }
      else if (ap) { var p = ap.split('|'); st.slots[parseInt(p[0], 10)] = { id: p[1], par: H[p[1]].par }; st.sel = parseInt(p[0], 10); save(); renderAll(); }
    });
    get('/hbnf-holes/hole_encyclopedia.json', function (d) {
      if (!d) { return; }
      enc = d; prep();
      var saved = load();
      if (saved) { st.base = saved.base; st.slots = saved.slots; baseGrade = st.base && seq[st.base] ? grade(seq[st.base]) : grade(st.slots); }
      else { loadBase(dates[0]); }
      renderBase(); renderAll();
    });
  }
  init();
})();
