(function(root){
 'use strict';
 var BASE='https://phcpbvuqibyarpfrftgx.supabase.co',KEY='sb_publishable_jc_iBS62kG9OeUNVJalpZQ_-BR9ikSC';
 var SEASON='2026';
 function played(p){return(p.scores||[]).filter(function(s){return s!==''&&s!=null&&!isNaN(Number(s))})}
 function total(p){return played(p).reduce(function(a,s){return a+Number(s)},0)}
 function members(p){
  var list=(p.partner1||p.partner2)?[p.partner1,p.partner2]:String(p.name||'').split(/\s*(?:\/|&|\band\b)\s*/i);
  return list.map(function(s){return String(s||'').trim()}).filter(Boolean);
 }
 function alias(g,n){var a=g.playerAliases||{};n=String(n||'').trim();return a[n]||a[n.toLowerCase()]||n}
 function isTest(n){return /^test player/i.test(n)}
 function weekRel(w,p){
  var hp=((w.scorecardText||{}).holePars)||{},rel=0,h=0;
  (p.scores||[]).forEach(function(s,i){if(s===''||s==null||isNaN(Number(s)))return;var pr=Number(hp[i+1]);if(!pr||isNaN(pr))pr=3;rel+=Number(s)-pr;h++});
  return{rel:rel,h:h};
 }
 function fmt(n){return n===null||n===undefined||isNaN(n)?'-':(n>0?'+'+n:n<0?'-'+Math.abs(n):'E')}
 function fmt1(n){if(n===null||isNaN(n))return '-';var v=Math.round(n*10)/10;return v>0?'+'+v.toFixed(1):v<0?'-'+Math.abs(v).toFixed(1):'E'}
 function rank(rows){var last=null,pos=0;rows.forEach(function(r,i){if(last===null||r.key!==last){pos=i+1;last=r.key}r.pos=pos;r.tie=rows.filter(function(x){return x.key===r.key}).length>1});return rows}
 // Season Jan 1 to Dec 31. Each dated round credits both partners with the team to-par.
 // Trophy: lowest average to par per round among players with rounds >= one third of the season rounds.
 function build(g){
  var hist=g.trophyHistory||{},weeks=g.weeks||{},del=g.deletedWeeks||{},rounds=[],live=null;
  Object.keys(hist).forEach(function(d){if(d.indexOf(SEASON)!==0||del[d])return;
   (hist[d]||[]).forEach(function(t){rounds.push({d:d,rel:Number(t.rel),raw:Number(t.raw),names:(t.partners||[]).map(function(n){return alias(g,n)})})})});
  Object.keys(weeks).forEach(function(d){
   if(d.indexOf(SEASON)!==0||hist[d]||del[d])return;
   var w=weeks[d],ps=(w.players||[]).filter(function(p){return!p.removed&&played(p).length>0});
   var isLive=d===g.activeWeek&&!w.scoresLocked;
   ps.forEach(function(p){var r=weekRel(w,p);
    var names=members(p).map(function(n){return alias(g,n)}).filter(function(n){return!isTest(n)});
    if(!names.length)return;
    if(isLive){if(!live)live={};names.forEach(function(n){live[n]=r.rel});if(r.h<18)return}
    else if(r.h<18)return;
    rounds.push({d:d,rel:r.rel,raw:total(p),names:names,prov:isLive});
   });
  });
  var tp={};
  rounds.forEach(function(r){r.names.forEach(function(n){if(isTest(n))return;var t=tp[n]||(tp[n]={n:n,r:0,rel:0});t.r++;t.rel+=r.rel})});
  var dates={};rounds.forEach(function(r){dates[r.d]=1});
  var nDates=Object.keys(dates).length,min=Math.max(1,Math.ceil(nDates/3));
  var rows=Object.keys(tp).map(function(n){var t=tp[n];t.avg=t.rel/t.r;t.q=t.r>=min;return t});
  rows.sort(function(a,b){return(b.q-a.q)||a.avg-b.avg||b.r-a.r||a.n.localeCompare(b.n)});
  var qual=rows.filter(function(r){return r.q});
  qual.forEach(function(r){r.key=String(Math.round(r.avg*1000))});rank(qual);
  rows.forEach(function(r){if(!r.q){r.pos=null;r.tie=false}r.live=live&&live[r.n]!==undefined?live[r.n]:null});
  return{rows:rows,rounds:rounds,dates:Object.keys(dates).sort(),min:min,live:live};
 }
 function awards(b,g){
  var out=[],rows=b.rows,q=rows.filter(function(r){return r.q});
  function add(label,names,val){if(names.length)out.push({label:label,names:names,val:String(val)})}
  if(q.length){
   var a0=q[0].avg;add('Trophy',q.filter(function(r){return r.avg===a0}).map(function(r){return r.n}),fmt1(a0));
   var rest=q.filter(function(r){return r.avg>a0});
   if(rest.length){var a1=rest[0].avg;add('Runner-up',rest.filter(function(r){return r.avg===a1}).map(function(r){return r.n}),fmt1(a1))}
  }
  if(rows.length){var mx=Math.max.apply(null,rows.map(function(r){return r.r}));add('Most rounds',rows.filter(function(r){return r.r===mx}).map(function(r){return r.n}).sort(),mx)}
  var wins={},byDate={};
  b.rounds.forEach(function(r){if(r.prov)return;var c=byDate[r.d];if(c===undefined||r.rel<c)byDate[r.d]=r.rel});
  b.rounds.forEach(function(r){if(!r.prov&&byDate[r.d]===r.rel)r.names.forEach(function(n){wins[n]=(wins[n]||0)+1})});
  var wm=0;Object.keys(wins).forEach(function(n){if(wins[n]>wm)wm=wins[n]});
  add('Round wins',Object.keys(wins).filter(function(n){return wins[n]===wm}).sort(),wm);
  var br=null;b.rounds.forEach(function(r){if(!r.prov&&(br===null||r.rel<br.rel))br=r});
  if(br)add('Best round',[br.names.join(' / ')],fmt(br.rel)+' '+br.d);
  var aces={};
  Object.keys(g.weeks||{}).forEach(function(d){var w=g.weeks[d];if(d.indexOf(SEASON)!==0||!w||(g.deletedWeeks||{})[d])return;
   var l=[];if(w.aceWinner)l.push(w.aceWinner);if(Array.isArray(w.aceWinners))w.aceWinners.forEach(function(x){l.push(typeof x==='string'?x:(x&&x.name)||'')});
   l.filter(Boolean).forEach(function(n){n=alias(g,n);aces[n]=(aces[n]||0)+1})});
  var am=0;Object.keys(aces).forEach(function(n){if(aces[n]>am)am=aces[n]});
  add('Aces',Object.keys(aces).filter(function(n){return aces[n]===am}).sort(),am);
  return out;
 }
 function glowWins(g){
  var wins={};
  Object.keys(g.weeks||{}).forEach(function(k){var w=g.weeks[k];if(!w||!w.scoresLocked||k.indexOf(SEASON)!==0)return;
   var ps=(w.players||[]).filter(function(p){return!p.removed&&played(p).length>=18});
   if(!ps.length)return;var best=Math.min.apply(null,ps.map(total));
   ps.filter(function(p){return total(p)===best}).forEach(function(p){members(p).forEach(function(n){n=alias(g,n);wins[n]=(wins[n]||0)+1})});
  });
  var rows=Object.keys(wins).map(function(n){return{n:n,w:wins[n],key:String(wins[n])}}).sort(function(a,b){return b.w-a.w||a.n.localeCompare(b.n)});
  return rank(rows);
 }
 // Finals: top 8 qualified by season average to par (all tied at 8th), one round on the first Tuesday after New Year.
 function finalsDate(year){var d=new Date(Date.UTC(Number(year)+1,0,2));while(d.getUTCDay()!==2)d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)}
 function finals(b){
  var q=b.rows.filter(function(r){return r.q});
  var cut=q.length>8?q[7].avg:null;
  var field=q.filter(function(r,i){return i<8||(cut!==null&&r.avg===cut)});
  return{date:finalsDate(SEASON),field:field};
 }
 var api={finals:finals,finalsDate:finalsDate,build:build,awards:awards,glowWins:glowWins,fmt:fmt,fmt1:fmt1,rank:rank,played:played,total:total,weekRel:weekRel,BASE:BASE,KEY:KEY};
 if(typeof module!=='undefined'&&module.exports){module.exports=api;return}
 root.HBNFSeason=api;
})(typeof window!=='undefined'?window:globalThis);
