import { useCallback, useEffect, useState } from 'react';
import { callFunction } from '../lib/supabase';

type Auth = Parameters<typeof callFunction>[2];
type Item = {id:string;created_at:string;file_name:string;plastic:string;base_hex:string;status:string;has_stencil:boolean;preview_url:string|null;layers:Array<{type:string;dyes:string[]}>};
type Detail = {item:{id:string;created_at:string;file_name:string;plastic:string;base_hex:string;recipe:string;status:string;has_stencil:boolean;files:Record<string,boolean>};urls:Record<string,string>;view:Record<string,string>};
const STATUS:Array<[string,string]> = [['new','New'],['making','Making'],['done','Done']];
const FILE_LABELS:Array<[string,string,boolean]> = [['stencil_svg','Cricut SVG',true],['preview','Preview',false],['stencil_png','Stencil PNG',false],['photo','Photo',false],['design','Design file',false]];
const EXT:Record<string,string> = {stencil_svg:'_CRICUT.svg',preview:'.png',stencil_png:'_stencil.png',photo:'_photo.jpg',design:'_design.json'};

const crcTable = (()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(data:Uint8Array){let c=0xffffffff;for(let i=0;i<data.length;i++)c=crcTable[(c^data[i])&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function zipStore(files:Array<{name:string;data:Uint8Array}>){
  const enc=new TextEncoder(),parts:Uint8Array[]=[],central:Uint8Array[]=[];let offset=0;
  for(const f of files){
    const name=enc.encode(f.name),crc=crc32(f.data),size=f.data.length;
    const head=new DataView(new ArrayBuffer(30));head.setUint32(0,0x04034b50,true);head.setUint16(4,20,true);head.setUint16(6,0x0800,true);head.setUint32(14,crc,true);head.setUint32(18,size,true);head.setUint32(22,size,true);head.setUint16(26,name.length,true);
    parts.push(new Uint8Array(head.buffer),name,f.data);
    const cen=new DataView(new ArrayBuffer(46));cen.setUint32(0,0x02014b50,true);cen.setUint16(4,20,true);cen.setUint16(6,20,true);cen.setUint16(8,0x0800,true);cen.setUint32(16,crc,true);cen.setUint32(20,size,true);cen.setUint32(24,size,true);cen.setUint16(28,name.length,true);cen.setUint32(42,offset,true);
    central.push(new Uint8Array(cen.buffer),name);offset+=30+name.length+size;
  }
  const cs=central.reduce((s,p)=>s+p.length,0),end=new DataView(new ArrayBuffer(22));end.setUint32(0,0x06054b50,true);end.setUint16(8,files.length,true);end.setUint16(10,files.length,true);end.setUint32(12,cs,true);end.setUint32(16,offset,true);
  return new Blob([...parts,...central,new Uint8Array(end.buffer)] as BlobPart[],{type:'application/zip'});
}
function saveBlob(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),4000);}
const when=(iso:string)=>new Date(iso).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});

export function DyeDesignsPanel({auth}:{auth:Auth}){
  const [status,setStatus]=useState('new');
  const [items,setItems]=useState<Item[]|null>(null);
  const [error,setError]=useState('');
  const [open,setOpen]=useState<Detail|null>(null);
  const [busy,setBusy]=useState(false);
  const load=useCallback(async()=>{
    try{const r=await callFunction<{items:Item[]}>('du-dye-admin',{action:'list',status},auth);setItems(r.items);setError('');}
    catch(e){setError(e instanceof Error?e.message:'Failed');}
  },[status,auth]);
  useEffect(()=>{setItems(null);void load();},[load]);
  const show=async(id:string)=>{try{setOpen(await callFunction<Detail>('du-dye-admin',{action:'get',id},auth));}catch(e){setError(e instanceof Error?e.message:'Failed');}};
  const setItemStatus=async(id:string,next:string)=>{
    await callFunction('du-dye-admin',{action:'status',id,status:next},auth);
    setOpen(o=>o&&o.item.id===id?{...o,item:{...o.item,status:next}}:o);void load();
  };
  const zipAll=async(d:Detail)=>{
    setBusy(true);
    try{
      const files:Array<{name:string;data:Uint8Array}>=[{name:`${d.item.file_name}_recipe.txt`,data:new TextEncoder().encode(d.item.recipe)}];
      for(const [key] of FILE_LABELS){const u=d.urls[key];if(!u)continue;const res=await fetch(u);files.push({name:d.item.file_name+EXT[key],data:new Uint8Array(await res.arrayBuffer())});}
      saveBlob(zipStore(files),`${d.item.file_name}.zip`);
    }finally{setBusy(false);}
  };
  const copy=(t:string)=>{void navigator.clipboard?.writeText(t);};
  return <section className="dd" aria-label="Dye designs">
    <div className="dd-bar">{STATUS.map(([v,l])=><button type="button" key={v} className={status===v?'active':''} onClick={()=>setStatus(v)}>{l}</button>)}<button type="button" className="dd-ref" onClick={()=>void load()}>Refresh</button></div>
    {error?<div className="notice error"><strong>{error}</strong></div>:null}
    {items===null?<div className="empty-state">Loading…</div>:items.length===0?<div className="empty-state">Empty</div>:
      <div className="dd-grid">{items.map(it=><button type="button" className="dd-card" key={it.id} onClick={()=>void show(it.id)}>
        <div className="dd-img">{it.preview_url?<img src={it.preview_url} alt="" loading="lazy"/>:<span style={{background:it.base_hex}}/>}{it.has_stencil?<i>Stencil</i>:null}</div>
        <div className="dd-meta"><b>{when(it.created_at)}</b><span>{it.plastic}</span><div className="dd-chips"><em style={{background:it.base_hex}}/>{it.layers.map((l,i)=><u key={i}>{l.type==='full'?'Base':l.type}</u>)}</div></div>
      </button>)}</div>}
    {open?<div className="dd-modal" role="dialog" aria-modal="true" onClick={e=>{if(e.target===e.currentTarget)setOpen(null);}}><div className="dd-sheet">
      <div className="dd-head"><b>{when(open.item.created_at)} · {open.item.plastic}</b><button type="button" onClick={()=>setOpen(null)}>Close</button></div>
      <div className="dd-body">
        <div className="dd-imgs">{open.view.preview?<img src={open.view.preview} alt=""/>:null}{open.view.stencil_png?<img className="st" src={open.view.stencil_png} alt=""/>:null}</div>
        <div className="dd-side">
          <div className="dd-seg">{STATUS.map(([v,l])=><button type="button" key={v} className={open.item.status===v?'active':''} onClick={()=>void setItemStatus(open.item.id,v)}>{l}</button>)}</div>
          <div className="dd-dl">{FILE_LABELS.filter(([k])=>open.urls[k]).map(([k,l,primary])=><a key={k} className={primary?'primary':''} href={open.urls[k]} download>{l}</a>)}
            <button type="button" onClick={()=>saveBlob(new Blob([open.item.recipe],{type:'text/plain'}),`${open.item.file_name}_recipe.txt`)}>Recipe</button>
            <button type="button" disabled={busy} onClick={()=>void zipAll(open)}>{busy?'…':'All files'}</button></div>
          <pre className="dd-rec">{open.item.recipe}</pre>
          <button type="button" onClick={()=>copy(open.item.recipe)}>Copy recipe</button>
        </div>
      </div>
    </div></div>:null}
  </section>;
}
