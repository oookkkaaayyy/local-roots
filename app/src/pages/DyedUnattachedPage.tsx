import { useEffect, useMemo, useRef, useState } from 'react';
import { Shell, Mast } from '../components/Shell';
import { supabase } from '../lib/supabase';

const GALLERY_SPRITE = 'https://wtymjxscneufjlkkywyg.supabase.co/storage/v1/object/public/du-gallery/gallery-v2.avif';

type GalleryItem = {
  id:string;
  caption:string|null;
  source_photo_path:string|null;
  stencil_path:string|null;
  finished_disc_path:string|null;
  sort_order:number;
  legacy_roles_confirmed:boolean;
};

type GalleryMedia={label:string;path:string};

function galleryDisplayMedia(item:GalleryItem){
  if(item.legacy_roles_confirmed===false){
    const paths=[item.source_photo_path,item.stencil_path,item.finished_disc_path]
      .filter((path):path is string=>Boolean(path)&&Boolean(parseLegacyPath(path!)))
      .sort((a,b)=>(parseLegacyPath(a)?.side==='left'?-1:1)-(parseLegacyPath(b)?.side==='left'?-1:1));
    if(paths.length)return paths.slice(0,2).map((path,index)=>({label:`Gallery image ${index+1}`,path}));
  }
  const source=item.source_photo_path?{label:'Reference photo',path:item.source_photo_path}:null;
  const stencil=item.stencil_path?{label:'Stencil artwork',path:item.stencil_path}:null;
  const finished=item.finished_disc_path?{label:'Finished disc',path:item.finished_disc_path}:null;
  if(source&&finished)return [source,finished];
  return [source,stencil,finished].filter((media):media is GalleryMedia=>Boolean(media)).slice(0,2);
}

function parseLegacyPath(path:string){
  const match=path.match(/^legacy:(\d+):(left|right)$/);
  if(!match)return null;
  const row=Number(match[1]);
  if(!Number.isInteger(row)||row<0||row>16)return null;
  return {row,side:match[2] as 'left'|'right'};
}

function GalleryMediaView({media}:{media:GalleryMedia}){
  const legacy=parseLegacyPath(media.path);
  if(legacy){
    return <div className="dug-media" role="img" aria-label={media.label} style={{backgroundImage:`url(${GALLERY_SPRITE})`,backgroundSize:'200% 1800%',backgroundPosition:`${legacy.side==='left'?'0%':'100%'} ${legacy.row*(100/17)}%`}}/>;
  }
  const url=supabase.storage.from('du-gallery').getPublicUrl(media.path).data.publicUrl;
  return <div className="dug-media"><img src={url} alt={media.label} loading="lazy"/></div>;
}

export function DyedUnattachedPage() {
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [galleryPaused, setGalleryPaused] = useState(false);
  const [galleryItems,setGalleryItems]=useState<GalleryItem[]>([]);
  const [galleryLoaded,setGalleryLoaded]=useState(false);
  const touchStartX = useRef<number | null>(null);
  const gallerySlides=useMemo(()=>{
    const valid=galleryItems.filter(item=>galleryDisplayMedia(item).length>=1);
    const slides:Array<GalleryItem[]>=[];
    for(let index=0;index<valid.length;index+=1)slides.push(valid.slice(index,index+1));
    return slides;
  },[galleryItems]);
  const gallerySlideCount=Math.max(1,gallerySlides.length);

  const previousSlide = () => setGalleryIndex(index => (index - 1 + gallerySlideCount) % gallerySlideCount);
  const nextSlide = () => setGalleryIndex(index => (index + 1) % gallerySlideCount);

  useEffect(() => {
    if (galleryPaused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(nextSlide, 4800);
    return () => window.clearInterval(timer);
  }, [galleryPaused,gallerySlideCount]);

  useEffect(()=>{
    let alive=true;
    supabase.from('gallery_items')
      .select('id,caption,source_photo_path,stencil_path,finished_disc_path,sort_order,legacy_roles_confirmed')
      .eq('is_published',true)
      .order('sort_order',{ascending:true})
      .order('created_at',{ascending:false})
      .limit(24)
      .then(({data,error})=>{
        if(!alive)return;
        if(!error)setGalleryItems((data||[]).filter(item=>galleryDisplayMedia(item as GalleryItem).length>=1) as GalleryItem[]);
        setGalleryLoaded(true);
      });
    return()=>{alive=false;};
  },[]);
  useEffect(()=>{if(galleryIndex>=gallerySlideCount)setGalleryIndex(0);},[galleryIndex,gallerySlideCount]);

  return <Shell mast={<Mast title={<span className="du-wordmark"><img src="/brand/dyed-unattached-logo.png" alt="Dyed & Unattached" width="955" height="233" /></span>} aside={<div className="lr-actions"><a className="lr-btn lr-btn-primary" href="/dyed-and-unattached/stencil">Make a stencil</a><a className="lr-btn lr-btn-ghost" href="/dyed-and-unattached/dye-studio">Design a disc</a></div>} />}><main className="lr-wrap du-stage">
    <div id="gallery" />
    <section className="dug" aria-label="Dyed & Unattached portfolio examples" onMouseEnter={() => setGalleryPaused(true)} onMouseLeave={() => setGalleryPaused(false)} onFocus={() => setGalleryPaused(true)} onBlur={() => setGalleryPaused(false)}>
      <div className="dug-frame" onTouchStart={event => { touchStartX.current = event.touches[0]?.clientX ?? null; setGalleryPaused(true); }} onTouchEnd={event => { const start = touchStartX.current; const end = event.changedTouches[0]?.clientX; touchStartX.current = null; setGalleryPaused(false); if (start == null || end == null) return; const delta = end - start; if (Math.abs(delta) > 45) { if (delta < 0) nextSlide(); else previousSlide(); } }}>
        <div className="dug-track" style={{ transform: `translateX(-${galleryIndex * 100}%)` }}>
          {galleryLoaded&&gallerySlides.length?gallerySlides.map((items,index)=><div key={items.map(item=>item.id).join(':')} className="dug-slide" aria-label={`Portfolio example ${index+1}`} aria-hidden={index!==galleryIndex}>
            {items.map(item=>{const media=galleryDisplayMedia(item);return <div className={`dug-row${media.length===1?' dug-row-single':''}`} key={item.id}>{media.map(entry=><GalleryMediaView key={entry.label} media={entry}/>)}</div>;})}
          </div>):<div className="dug-slide dug-loading" aria-label="Portfolio loading"><div className="dug-row"><div className="dug-media"/><div className="dug-media"/></div></div>}
        </div>
        <div className="dug-controls" aria-label="Gallery controls">
          <button type="button" onClick={previousSlide} aria-label="Previous examples" disabled={gallerySlideCount<=1}>‹</button>
          <span className="dug-count" aria-live="polite">{String(galleryIndex + 1).padStart(2, '0')} / {String(gallerySlideCount).padStart(2, '0')}</span>
          <button type="button" onClick={nextSlide} aria-label="Next examples" disabled={gallerySlideCount<=1}>›</button>
        </div>
      </div>
    </section>
  </main></Shell>;
}
