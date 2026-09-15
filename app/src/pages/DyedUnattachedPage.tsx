import { FormEvent, useEffect, useRef, useState } from 'react';
import { Shell } from '../components/Shell';

const SUBMIT_INTAKE_URL = 'https://wtymjxscneufjlkkywyg.supabase.co/functions/v1/submit-intake';
const GALLERY_SPRITE = '/du-gallery/du-gallery-sprite.jpg';
const GALLERY_SLIDE_FIVE = '/du-gallery/slide-05.avif';
const GALLERY_SLIDE_COUNT = 8;

type SubmitState = 'idle' | 'preparing' | 'sending' | 'sent' | 'error';

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

export function DyedUnattachedPage() {
  const [state, setState] = useState<SubmitState>('idle');
  const [message, setMessage] = useState('');
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [galleryPaused, setGalleryPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const previousSlide = () => setGalleryIndex(index => (index - 1 + GALLERY_SLIDE_COUNT) % GALLERY_SLIDE_COUNT);
  const nextSlide = () => setGalleryIndex(index => (index + 1) % GALLERY_SLIDE_COUNT);

  useEffect(() => {
    if (galleryPaused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(nextSlide, 4800);
    return () => window.clearInterval(timer);
  }, [galleryPaused]);

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
      .du-gallery{margin:-8px auto 52px}.du-gallery-shell{position:relative;width:min(850px,100%);margin:0 auto}.du-gallery-frame{overflow:hidden;border:1px solid rgba(185,154,119,.65);border-radius:24px;background:#f3eadf;box-shadow:0 12px 34px rgba(58,38,24,.10);touch-action:pan-y}.du-gallery-track{display:flex;transition:transform .48s cubic-bezier(.2,.75,.25,1)}.du-gallery-slide{flex:0 0 100%;aspect-ratio:1;background-repeat:no-repeat;background-size:100% 800%;background-position-x:center}.du-gallery-controls{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:10px}.du-gallery-controls button{width:38px;height:38px;border:1px solid rgba(112,77,49,.25);border-radius:999px;background:#fff8ee;color:#5b3a24;font-size:1.25rem;line-height:1;cursor:pointer}.du-gallery-controls button:hover{background:#efe3d2}.du-gallery-count{min-width:52px;text-align:center;color:#756050;font-size:.78rem;font-weight:800;letter-spacing:.08em}.du-gallery-hint{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}@media(max-width:620px){.du-gallery{margin-top:-18px;margin-bottom:36px}.du-gallery-frame{border-radius:18px}.du-gallery-controls{margin-top:8px}}@media(prefers-reduced-motion:reduce){.du-gallery-track{transition:none}}
    `}</style>
    <section className="branch-hero content"><h1>Dyed &amp; Unattached</h1></section>
    <section className="du-gallery content" aria-label="Reference photos and finished stencil examples">
      <div className="du-gallery-shell" onMouseEnter={() => setGalleryPaused(true)} onMouseLeave={() => setGalleryPaused(false)} onFocus={() => setGalleryPaused(true)} onBlur={() => setGalleryPaused(false)}>
        <span className="du-gallery-hint">Each slide shows two reference-photo and finished-stencil comparisons.</span>
        <div className="du-gallery-frame" onTouchStart={event => { touchStartX.current = event.touches[0]?.clientX ?? null; setGalleryPaused(true); }} onTouchEnd={event => { const start = touchStartX.current; const end = event.changedTouches[0]?.clientX; touchStartX.current = null; setGalleryPaused(false); if (start == null || end == null) return; const delta = end - start; if (Math.abs(delta) > 45) delta < 0 ? nextSlide() : previousSlide(); }}>
          <div className="du-gallery-track" style={{ transform: `translateX(-${galleryIndex * 100}%)` }}>
            {Array.from({ length: GALLERY_SLIDE_COUNT }, (_, index) => <div key={index} className="du-gallery-slide" role="img" aria-label={`Stencil examples ${index * 2 + 1} and ${index * 2 + 2}`} aria-hidden={index !== galleryIndex} style={index === 4 ? { backgroundImage: `url(${GALLERY_SLIDE_FIVE})`, backgroundPosition: 'center', backgroundSize: '100% 100%' } : { backgroundImage: `url(${GALLERY_SPRITE})`, backgroundPositionY: `${index * (100 / (GALLERY_SLIDE_COUNT - 1))}%` }} />)}
          </div>
        </div>
        <div className="du-gallery-controls" aria-label="Gallery controls">
          <button type="button" onClick={previousSlide} aria-label="Previous examples">‹</button>
          <span className="du-gallery-count" aria-live="polite">{String(galleryIndex + 1).padStart(2, '0')} / {String(GALLERY_SLIDE_COUNT).padStart(2, '0')}</span>
          <button type="button" onClick={nextSlide} aria-label="Next examples">›</button>
        </div>
      </div>
    </section>
    <section id="request-stencil" className="du-request content" aria-labelledby="du-request-title">
      <div className="section-intro"><h2 id="du-request-title">Stencil request</h2><p>Contact details and source photos are private and are not published by this form.</p></div>
      <form className="du-form" onSubmit={submit}>
        <div className="du-form-grid">
          <label>Name<input name="clientName" autoComplete="name" required maxLength={160} /></label>
          <label>Phone<input name="phone" type="tel" inputMode="tel" autoComplete="tel" required /></label>
          <label className="span-2">Pet name<input name="petName" required maxLength={160} /></label>
          <label className="span-2">Reference photos <span className="optional">1–6 images</span><input name="referencePhotos" type="file" accept="image/*" multiple required /></label>
          <label className="span-2">Notes <span className="optional">optional</span><textarea name="notes" rows={4} maxLength={4000} /></label>
        </div>
        <div className="form-footer"><button className="button primary" type="submit" disabled={busy}>{busy ? 'Working…' : 'Submit request'}</button>{message ? <span className={state === 'error' ? 'form-error' : 'form-success'} role={state === 'error' ? 'alert' : 'status'} aria-live={state === 'error' ? 'assertive' : 'polite'} aria-atomic="true">{message}</span> : null}</div>
      </form>
    </section>
  </main></Shell>;
}
