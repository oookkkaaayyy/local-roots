(function(){
 'use strict';
 var S=window.HBNFSeason,ids=['live','trophy','awards','season'];
 function $(i){return document.getElementById(i)}
 function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
 function select(v,focus){
  if(ids.indexOf(v)<0)v='live';
  ids.forEach(function(id){var c=id===v,t=$('tab-'+id);t.setAttribute('aria-selected',c?'true':'false');t.tabIndex=c?0:-1;$('pane-'+id).hidden=!c;if(c&&focus)t.focus()});
 }
 function hv(){var h=location.hash.replace('#','');return ids.indexOf(h)>=0?h:'live'}
 ids.forEach(function(id){var t=$('tab-'+id);
  t.addEventListener('click',function(){location.hash=id;select(id,false)});
  t.addEventListener('keydown',function(e){if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();var n=ids[(ids.indexOf(id)+(e.key==='ArrowRight'?1:ids.length-1))%ids.length];location.hash=n;select(n,true)}});
 });
 window.addEventListener('hashchange',function(){select(hv(),false)});
 select(hv(),false);
 function pos(r){return r.pos==null?'-':(r.tie?'T':'')+r.pos}
 function liveRows(g){
  var wk=(g.weeks||{})[g.activeWeek]||{},ps=(wk.players||[]).filter(function(p){return!p.removed});
  var rows=ps.map(function(p){var h=S.played(p).length,s=S.total(p);return{p:p,h:h,s:s,rel:S.weekRel(wk,p).rel,key:String(S.weekRel(wk,p).rel)}}).filter(function(r){return r.h>0});
  rows.sort(function(a,b){return a.rel-b.rel||b.h-a.h});S.rank(rows);
  return{wk:wk,rows:rows,teams:ps.length};
 }
 function renderLive(g,updated){
  var l=liveRows(g),rows=l.rows;
  $('liveWeek').textContent=g.activeWeek||'';
  var done=rows.length&&rows.every(function(r){return r.h>=18});
  $('mRound').textContent=l.wk.scoresLocked?'Final':rows.length?(done?'Complete':'Live'):'Waiting';
  $('mRound').className=rows.length&&!l.wk.scoresLocked?'ok':'';
  $('mTeams').textContent=String(l.teams);
  var age=Math.max(0,Math.round((Date.now()-Date.parse(updated))/1000));
  $('mAge').textContent=Math.floor(age/60)+':'+String(age%60).padStart(2,'0');
  $('mAge').className=age>300?'warn':'ok';
  $('liveBody').innerHTML=rows.map(function(r){return'<tr><td class="pos">'+(r.tie?'T':'')+r.pos+'</td><td>'+esc(r.p.name)+'</td><td class="n">'+r.h+'/18</td><td class="n">'+r.s+'</td><td class="n">'+S.fmt(r.rel)+'</td></tr>'}).join('')||'<tr><td colspan="5">-</td></tr>';
 }
 function renderTrophy(b){
  $('trophyRounds').textContent=b.dates.length+' rounds | min '+b.min;
  $('trophyBody').innerHTML=b.rows.map(function(r){
   return'<tr class="'+(r.q?'':'dim')+'"><td class="pos">'+pos(r)+'</td><td>'+esc(r.n)+'</td><td class="n">'+r.r+'</td><td class="n">'+S.fmt1(r.avg)+'</td><td class="n">'+S.fmt(r.rel)+'</td><td class="n">'+S.fmt(r.live)+'</td></tr>'}).join('')||'<tr><td colspan="6">-</td></tr>';
 }
 function renderAwards(b,g){
  $('awardsBody').innerHTML=S.awards(b,g).map(function(a){return'<tr><td>'+esc(a.label)+'</td><td>'+a.names.map(esc).join(', ')+'</td><td class="n">'+esc(a.val)+'</td></tr>'}).join('')||'<tr><td colspan="3">-</td></tr>';
 }
 function renderSeason(g){
  $('seasonTitle').textContent='2026 Stats';
  $('seasonBody').innerHTML=S.glowWins(g).map(function(r){return'<tr><td class="pos">'+(r.tie?'T':'')+r.pos+'</td><td>'+esc(r.n)+'</td><td class="n">'+r.w+'</td></tr>'}).join('')||'<tr><td colspan="3">-</td></tr>';
 }
 function load(){
  fetch(S.BASE+'/rest/v1/league_state?select=state_json,updated_at&id=eq.1',{headers:{apikey:S.KEY,Authorization:'Bearer '+S.KEY},cache:'no-store'})
   .then(function(r){if(!r.ok)throw new Error(r.status);return r.json()})
   .then(function(a){if(!a||!a[0])throw new Error('empty');var g=a[0].state_json.glow||{},b=S.build(g);renderLive(g,a[0].updated_at);renderTrophy(b);renderAwards(b,g);renderSeason(g)})
   .catch(function(){$('mAge').textContent='Offline';$('mAge').className='warn'});
 }
 load();setInterval(load,20000);
})();
