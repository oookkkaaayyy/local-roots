(function () {
  'use strict';
  var pub = null, enc = null, rows = [], sortKey = 'n', sortDir = -1, played = true, sel = null;
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); }
  function f(v, d) { return v === null || v === undefined ? '-' : Number(v).toFixed(d); }
  function sgn(v) { return v === null || v === undefined ? '-' : (v > 0 ? '+' : '') + Number(v).toFixed(2); }
  function cls(v) { return v === null || v === undefined ? '' : (v < 0 ? 'neg' : (v > 0 ? 'pos' : '')); }
  function get(url, cb) {
    var x = new XMLHttpRequest();
    x.open('GET', url, true);
    x.onload = function () { if (x.status === 200) { try { cb(JSON.parse(x.responseText)); } catch (e) { cb(null); } } else { cb(null); } };
    x.onerror = function () { cb(null); };
    x.send();
  }
  function toRow(a, cols) { var o = {}; for (var i = 0; i < cols.length; i++) { o[cols[i]] = a[i]; } return o; }
  function visible() {
    var q = $('q').value.toLowerCase();
    var out = rows.filter(function (r) { return (!played || r.n > 0) && (!q || r.label.toLowerCase().indexOf(q) >= 0); });
    out.sort(function (a, b) {
      var x = a[sortKey], y = b[sortKey];
      if (x === null || x === undefined) { return 1; }
      if (y === null || y === undefined) { return -1; }
      if (typeof x === 'string') { return sortDir * x.localeCompare(y); }
      return sortDir * (x - y);
    });
    return out;
  }
  function render() {
    var list = visible(), h = '';
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      h += '<tr tabindex="0" data-id="' + esc(r.id) + '"' + (sel === r.id ? ' aria-selected="true"' : '') + '>' +
        '<td class="l">' + esc(r.label) + '</td><td class="n">' + r.par + (r.parq ? '?' : '') + '</td><td class="n">' + r.n + '</td>' +
        '<td class="n">' + f(r.avg, 2) + '</td><td class="n ' + cls(r.rel) + '">' + sgn(r.rel) + '</td>' +
        '<td class="n">' + f(r.birdie, 0) + '</td><td class="n col-bog">' + f(r.bogey, 0) + '</td><td class="n">' + (r.rank === null ? '-' : r.rank) + '</td></tr>';
    }
    $('rows').innerHTML = h;
  }
  function detail(id) {
    sel = id; render();
    var show = function () {
      var hole = null, i;
      for (i = 0; i < enc.holes.length; i++) { if (enc.holes[i].hole_id === id) { hole = enc.holes[i]; break; } }
      if (!hole) { return; }
      var s = hole.stats, g = '';
      var cells = [['Avg', f(s.avg_strokes, 2)], ['To par', sgn(s.avg_rel_par)], ['SD', f(s.sd, 2)], ['Birdie %', f(s.birdie_pct, 0)], ['Par %', f(s.par_pct, 0)], ['Bogey %', f(s.bogey_pct, 0)], ['2+ over %', f(s.double_plus_pct, 0)], ['Aces', s.aces], ['Rank', s.difficulty_rank === null ? '-' : s.difficulty_rank + '/' + s.difficulty_of], ['Team holes', s.team_holes], ['Rounds', s.rounds_scored], ['Skill r', f(s.discrimination_item_rest_r, 2)]];
      for (i = 0; i < cells.length; i++) { g += '<div class="cell"><small>' + cells[i][0] + '</small><strong>' + cells[i][1] + '</strong></div>'; }
      var occ = '<table aria-label="Rounds"><thead><tr><th>Date</th><th class="n">Hole</th><th class="n">Par</th><th class="n">Avg</th></tr></thead><tbody>';
      for (i = 0; i < hole.occurrences.length; i++) { var o = hole.occurrences[i]; occ += '<tr><td>' + esc(o.event_date) + '</td><td class="n">' + o.layout_hole + '</td><td class="n">' + o.par + '</td><td class="n">' + (o.scored ? f(o.avg, 2) : '-') + '</td></tr>'; }
      occ += '</tbody></table>';
      var pl = '', names = [], k, bp = s.by_player_avg_rel_par_team_based;
      for (k in bp) { if (bp.hasOwnProperty(k)) { names.push(k); } }
      names.sort(function (a, b) { return bp[a].avg - bp[b].avg; });
      if (names.length) { pl = '<h3>Players</h3><table aria-label="Players"><thead><tr><th>Player</th><th class="n">N</th><th class="n">To par</th></tr></thead><tbody>'; for (i = 0; i < names.length; i++) { pl += '<tr><td>' + esc(names[i]) + '</td><td class="n">' + bp[names[i]].n + '</td><td class="n ' + cls(bp[names[i]].avg) + '">' + sgn(bp[names[i]].avg) + '</td></tr>'; } pl += '</tbody></table>'; }
      $('detail').innerHTML = '<h2>' + esc(hole.label) + '</h2><p class="sub">Par ' + hole.par + '</p><div class="grid">' + g + '</div><h3>Rounds</h3>' + occ + pl;
      $('empty').hidden = true; $('detail').hidden = false;
    };
    if (enc) { show(); } else { get('/hbnf-holes/hole_encyclopedia.json', function (d) { if (d) { enc = d; show(); } }); }
  }
  function init() {
    $('q').addEventListener('input', render);
    $('fPlayed').addEventListener('click', function () { played = true; $('fPlayed').setAttribute('aria-pressed', 'true'); $('fAll').setAttribute('aria-pressed', 'false'); render(); });
    $('fAll').addEventListener('click', function () { played = false; $('fAll').setAttribute('aria-pressed', 'true'); $('fPlayed').setAttribute('aria-pressed', 'false'); render(); });
    var ths = document.querySelectorAll('th[data-k]'), i;
    for (i = 0; i < ths.length; i++) {
      ths[i].addEventListener('click', function () { var k = this.getAttribute('data-k'); if (k === sortKey) { sortDir = -sortDir; } else { sortKey = k; sortDir = k === 'label' || k === 'rank' ? 1 : -1; } render(); });
    }
    $('rows').addEventListener('click', function (e) { var t = e.target; while (t && t.tagName !== 'TR') { t = t.parentNode; } if (t && t.getAttribute('data-id')) { detail(t.getAttribute('data-id')); } });
    $('rows').addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { var t = e.target; if (t && t.getAttribute && t.getAttribute('data-id')) { e.preventDefault(); detail(t.getAttribute('data-id')); } } });
    get('/hbnf-holes/hole_log_public.json', function (d) {
      if (!d) { return; }
      pub = d; rows = [];
      for (var j = 0; j < d.holes.length; j++) { rows.push(toRow(d.holes[j], d.cols)); }
      render();
      var first = visible()[0]; if (first) { detail(first.id); }
    });
  }
  init();
})();
