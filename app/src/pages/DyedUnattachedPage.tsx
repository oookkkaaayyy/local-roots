import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Shell } from '../components/Shell';
import { ImageDropField } from '../components/ImageDropField';
import { supabase } from '../lib/supabase';

const SUBMIT_INTAKE_URL = 'https://wtymjxscneufjlkkywyg.supabase.co/functions/v1/submit-intake';
const GALLERY_SPRITE = 'https://wtymjxscneufjlkkywyg.supabase.co/storage/v1/object/public/du-gallery/gallery-v2.avif';

type SubmitState = 'idle' | 'preparing' | 'sending' | 'sent' | 'error';
type GalleryItem = {
  id:string;
  caption:string|null;
  source_photo_path:string|null;
  stencil_path:string|null;
  finished_disc_path:string|null;
  sort_order:number;
};

function compressImageFile(file: File, maxSide = 1600, quality = 0.84): Promise<string | null> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => {
      if (typeof reader.result !== 'string') return resolve(null);
      const original = reader.result;
      const image = new Image();
      image.onerror = () => resolve(original);
      image.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) return resolve(original);
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      image.src = original;
    };
    reader.readAsDataURL(file);
  });
}

function enoughPhoneDigits(value: string) {
  return value.replace(/\D/g, '').length >= 7;
}

type GalleryMedia={label:string;path:string};

function galleryPair(item:GalleryItem){
  const source=item.source_photo_path?{label:'Reference photo',path:item.source_photo_path}:null;
  const stencil=item.stencil_path?{label:'Stencil artwork',path:item.stencil_path}:null;
  const finished=item.finished_disc_path?{label:'Finished disc',path:item.finished_disc_path}:null;
  if(source&&finished)return [source,finished];
  if(source&&stencil)return [source,stencil];
  if(stencil&&finished)return [stencil,finished];
  return [] as GalleryMedia[];
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
    return <div className="du-gallery-media du-gallery-media-legacy" role="img" aria-label={media.label} style={{backgroundImage:`url(${GALLERY_SPRITE})`,backgroundSize:'200% 1800%',backgroundPosition:`${legacy.side==='left'?'0%':'100%'} ${legacy.row*(100/17)}%`}}/>;
  }
  const url=supabase.storage.from('du-gallery').getPublicUrl(media.path).data.publicUrl;
  return <div className="du-gallery-media"><img src={url} alt={media.label} loading="lazy"/></div>;
}

export function DyedUnattachedPage() {
  const [state, setState] = useState<SubmitState>('idle');
  const [message, setMessage] = useState('');
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [galleryPaused, setGalleryPaused] = useState(false);
  const [galleryItems,setGalleryItems]=useState<GalleryItem[]>([]);
  const [galleryLoaded,setGalleryLoaded]=useState(false);
  const touchStartX = useRef<number | null>(null);
  const gallerySlides=useMemo(()=>{
    const valid=galleryItems.filter(item=>galleryPair(item).length===2);
    const slides:Array<GalleryItem[]>=[];
    for(let index=0;index<valid.length;index+=2)slides.push(valid.slice(index,index+2));
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
      .select('id,caption,source_photo_path,stencil_path,finished_disc_path,sort_order')
      .eq('is_published',true)
      .order('sort_order',{ascending:true})
      .order('created_at',{ascending:false})
      .limit(24)
      .then(({data,error})=>{
        if(!alive)return;
        if(!error)setGalleryItems((data||[]).filter(item=>galleryPair(item as GalleryItem).length===2) as GalleryItem[]);
        setGalleryLoaded(true);
      });
    return()=>{alive=false;};
  },[]);
  useEffect(()=>{if(galleryIndex>=gallerySlideCount)setGalleryIndex(0);},[galleryIndex,gallerySlideCount]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const clientName = String(data.get('clientName') || '').trim();
    const phone = String(data.get('phone') || '').trim();
    const petName = String(data.get('petName') || '').trim();
    const notes = String(data.get('notes') || '').trim();
    const fileInput = form.elements.namedItem('referencePhotos') as HTMLInputElement | null;
    const files = Array.from(fileInput?.files || []).filter(file => file.type.startsWith('image/'));

    if (!clientName) { setState('error'); setMessage('Please enter your name.'); return; }
    if (!enoughPhoneDigits(phone)) { setState('error'); setMessage('Please enter a valid phone number.'); return; }
    if (!petName) { setState('error'); setMessage('Please enter your pet’s name.'); return; }
    if (!files.length) { setState('error'); setMessage('Please upload at least one reference photo.'); return; }
    if (files.length > 6) { setState('error'); setMessage('Please choose no more than six reference photos.'); return; }

    try {
      setState('preparing'); setMessage('Preparing photos…');
      const photos = (await Promise.all(files.map(async (file, index) => ({
        name: file.name || `reference-${index + 1}.jpg`,
        dataUrl: await compressImageFile(file),
      })))).filter((photo): photo is { name: string; dataUrl: string } => Boolean(photo.dataUrl));
      if (!photos.length) {
        setState('error');
        setMessage('The selected photos could not be read.');
        return;
      }

      setState('sending'); setMessage('Sending request…');
      const response = await fetch(SUBMIT_INTAKE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientName, phone, petName, notes, photos }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error('submission failed');
      form.reset();
      setState('sent'); setMessage(`Request received — ${result.job.job_number}.`);
    } catch {
      setState('error'); setMessage('The request could not be submitted.');
    }
  }

  const busy = state === 'preparing' || state === 'sending';
  return <Shell><main>
    <style>{`
      .du-share-hero{padding-bottom:22px}.du-share-hero .branch-monogram{background:var(--clay);font-size:2.25rem}.du-gallery{margin:0 auto 52px}.du-gallery-shell{position:relative;width:min(850px,100%);margin:0 auto}.du-gallery-frame{overflow:hidden;border:1px solid rgba(185,154,119,.65);border-radius:24px;background:#f3eadf;box-shadow:0 12px 34px rgba(58,38,24,.10);touch-action:pan-y}.du-gallery-track{display:flex;transition:transform .48s cubic-bezier(.2,.75,.25,1)}.du-gallery-slide{flex:0 0 100%;aspect-ratio:1;display:grid;grid-template-rows:repeat(2,minmax(0,1fr));background:#efe3d2}.du-gallery-row{display:grid;grid-template-columns:1fr 1fr;min-height:0}.du-gallery-row+.du-gallery-row{border-top:1px solid rgba(185,154,119,.55)}.du-gallery-media{min-width:0;min-height:0;overflow:hidden;background:#efe3d2}.du-gallery-media+.du-gallery-media{border-left:1px solid rgba(185,154,119,.55)}.du-gallery-media img{width:100%;height:100%;display:block;object-fit:cover}.du-gallery-media-legacy{background-repeat:no-repeat}.du-gallery-row-empty{background:#efe3d2}.du-gallery-controls{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:10px}.du-gallery-controls button{width:38px;height:38px;border:1px solid rgba(112,77,49,.25);border-radius:999px;background:#fff8ee;color:#5b3a24;font-size:1.25rem;line-height:1;cursor:pointer}.du-gallery-controls button:hover{background:#efe3d2}.du-gallery-count{min-width:52px;text-align:center;color:#756050;font-size:.78rem;font-weight:800;letter-spacing:.08em}.du-gallery-hint{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}.du-request .section-intro strong{display:block;margin-top:14px;color:var(--soil);font-size:.84rem}@media(max-width:620px){.du-share-hero{padding-top:42px}.du-gallery{margin-bottom:36px}.du-gallery-frame{border-radius:18px}.du-gallery-controls{margin-top:8px}.du-live-card{border-radius:18px}}@media(prefers-reduced-motion:reduce){.du-gallery-track{transition:none}}
    `}</style>

    <section className="branch-hero content du-share-hero">
      <div>
        <h1>Dyed &amp; Unattached</h1>
        <div className="branch-actions">
          <a className="button primary" href="#request-stencil">Request a stencil</a>
        </div>
      </div>
      <div className="branch-monogram" aria-hidden="true">D&amp;U</div>
    </section>

    <div id="gallery" />

    <section className="du-gallery content" aria-label="Dyed & Unattached portfolio examples">
      <div className="du-gallery-shell" onMouseEnter={() => setGalleryPaused(true)} onMouseLeave={() => setGalleryPaused(false)} onFocus={() => setGalleryPaused(true)} onBlur={() => setGalleryPaused(false)}>
        <span className="du-gallery-hint">Swipe or use the arrow buttons to browse reference and finished-work comparisons.</span>
        <div className="du-gallery-frame" onTouchStart={event => { touchStartX.current = event.touches[0]?.clientX ?? null; setGalleryPaused(true); }} onTouchEnd={event => { const start = touchStartX.current; const end = event.changedTouches[0]?.clientX; touchStartX.current = null; setGalleryPaused(false); if (start == null || end == null) return; const delta = end - start; if (Math.abs(delta) > 45) delta < 0 ? nextSlide() : previousSlide(); }}>
          <div className="du-gallery-track" style={{ transform: `translateX(-${galleryIndex * 100}%)` }}>
            {galleryLoaded&&gallerySlides.length?gallerySlides.map((items,index)=><div key={items.map(item=>item.id).join(':')} className="du-gallery-slide" aria-label={items.length===1?`Portfolio example ${index*2+1}`:`Portfolio examples ${index*2+1} and ${index*2+2}`} aria-hidden={index!==galleryIndex}>
              {items.map(item=><div className="du-gallery-row" key={item.id}>{galleryPair(item).map(media=><GalleryMediaView key={media.label} media={media}/>)}</div>)}
              {items.length===1?<div className="du-gallery-row-empty" aria-hidden="true"/>:null}
            </div>):<div className="du-gallery-slide" aria-label="Portfolio loading"><div className="du-gallery-row-empty"/><div className="du-gallery-row-empty"/></div>}
          </div>
        </div>
        <div className="du-gallery-controls" aria-label="Gallery controls">
          <button type="button" onClick={previousSlide} aria-label="Previous examples" disabled={gallerySlideCount<=1}>‹</button>
          <span className="du-gallery-count" aria-live="polite">{String(galleryIndex + 1).padStart(2, '0')} / {String(gallerySlideCount).padStart(2, '0')}</span>
          <button type="button" onClick={nextSlide} aria-label="Next examples" disabled={gallerySlideCount<=1}>›</button>
        </div>
      </div>
    </section>

    <section id="request-stencil" className="du-request content" aria-labelledby="du-request-title">
      <div className="section-intro"><h2 id="du-request-title">Request a stencil</h2></div>
      <form className="du-form" onSubmit={submit}>
        <div className="du-form-grid">
          <label>Name<input name="clientName" autoComplete="name" required maxLength={160} /></label>
          <label>Phone<input name="phone" type="tel" inputMode="tel" autoComplete="tel" required /></label>
          <label className="span-2">Pet name<input name="petName" required maxLength={160} /></label>
          <ImageDropField className="span-2" name="referencePhotos" label="Reference photos" hint="1–6 images" accept="image/*" multiple maxFiles={6} required />
          <label className="span-2">Notes <span className="optional">optional</span><textarea name="notes" rows={4} maxLength={4000} /></label>
        </div>
        <div className="form-footer"><button className="button primary" type="submit" disabled={busy}>{busy ? 'Working…' : 'Submit request'}</button>{message ? <span className={state === 'error' ? 'form-error' : 'form-success'} role={state === 'error' ? 'alert' : 'status'} aria-live={state === 'error' ? 'assertive' : 'polite'} aria-atomic="true">{message}</span> : null}</div>
      </form>
    </section>
  </main></Shell>;
}
