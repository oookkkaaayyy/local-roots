import { useCallback, useEffect, useState } from 'react';
import { functionsBase, publicKey } from '../lib/supabase';

type Bucket={n:number;usd:number};
type Tally={day:Bucket;week:Bucket;month:Bucket;visitors:Bucket;cap_usd:number};
type Row={id:number;at:string;who:string;ok:boolean;kb:number;usd:number};
type Log={tally:Tally;rows:Row[]};

const usd=(v:number)=>'$'+v.toFixed(2);
const when=(iso:string)=>new Date(iso).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});

export function DuSpendPanel({deviceToken}:{deviceToken:string|null}){
  const [log,setLog]=useState<Log|null>(null),[error,setError]=useState('');
  const load=useCallback(async()=>{
    if(!deviceToken){setError('Pair this device to view spend.');return;}
    try{
      const r=await fetch(`${functionsBase}/du-stencil-gen`,{method:'POST',headers:{apikey:publicKey,'x-peek':'log','x-du-device-token':deviceToken}});
      const j=await r.json().catch(()=>({}));
      if(!r.ok||!j.tally)throw new Error(j.error==='forbidden'?'This device is not authorized.':'Could not load spend.');
      setLog(j as Log);setError('');
    }catch(e){setError(e instanceof Error?e.message:'Failed');}
  },[deviceToken]);
  useEffect(()=>{void load();},[load]);
  const saveCsv=()=>{
    if(!log)return;
    const csv=['id,time,who,ok,kb,cost_usd',...log.rows.map(r=>[r.id,r.at,r.who,r.ok,r.kb,r.usd.toFixed(4)].join(','))].join('\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'})),a=document.createElement('a');
    a.href=url;a.download='stencil-spend.csv';document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),4000);
  };
  const t=log?.tally;
  return <section className="admin-card du-spend" aria-label="Stencil generation spend">
    {error?<div className="notice error"><strong>{error}</strong></div>:null}
    {!t?<div className="empty-state">Loading…</div>:<>
      <div className="admin-metrics">
        <div><strong>{t.day.n} · {usd(t.day.usd)}</strong><span>admin today</span></div>
        <div><strong>{t.week.n} · {usd(t.week.usd)}</strong><span>admin 7 days</span></div>
        <div><strong>{t.month.n} · {usd(t.month.usd)}</strong><span>admin month</span></div>
        <div><strong>{t.visitors.n} · {usd(t.visitors.usd)}</strong><span>visitors month, cap {usd(t.cap_usd)}</span></div>
      </div>
      <div className="button-row"><button className="button ghost" type="button" onClick={()=>void load()}>Refresh</button><button className="button ghost" type="button" onClick={saveCsv}>Download CSV</button></div>
      <div className="du-spend-scroll"><table className="du-spend-table">
        <thead><tr><th scope="col">Time</th><th scope="col">Who</th><th scope="col">Result</th><th scope="col">KB</th><th scope="col">Cost</th></tr></thead>
        <tbody>{log!.rows.map(r=><tr key={r.id}><td>{when(r.at)}</td><td>{r.who}</td><td>{r.ok?'OK':'Failed'}</td><td>{r.kb}</td><td>{usd(r.usd)}</td></tr>)}</tbody>
      </table></div>
    </>}
  </section>;
}
