import { FormEvent, useState } from 'react';
import { Shell } from '../components/Shell';

const SUBMIT_INTAKE_URL = 'https://wtymjxscneufjlkkywyg.supabase.co/functions/v1/submit-intake';

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
      if (!photos.length) throw new Error('The selected photos could not be read.');

      setState('sending'); setMessage('Sending request…');
      const response = await fetch(SUBMIT_INTAKE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientName, phone, petName, notes, photos }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || `Submission failed (${response.status}).`);
      form.reset();
      setState('sent'); setMessage(`Request received — ${result.job.job_number}.`);
    } catch (error) {
      setState('error'); setMessage(error instanceof Error ? error.message : 'The request could not be submitted.');
    }
  }

  const busy = state === 'preparing' || state === 'sending';
  return <Shell><main>
    <section className="branch-hero content du-hero"><div><span className="eyebrow">Custom disc art · Local Roots</span><h1>Dyed &amp; Unattached</h1><p>Custom pet portraits translated into production-minded disc stencils, built from your reference photos and finished by hand.</p><div className="branch-actions"><a className="button primary" href="#request-stencil">Request a stencil</a><a className="button ghost" href="/">Back to Local Roots</a></div></div><div className="branch-monogram" aria-hidden="true">D&amp;U</div></section>
    <section className="branch-feature-grid content">
      <article><span className="eyebrow">01</span><h2>Send photos</h2><p>Upload up to six clear reference images and identify the pet you want translated into a stencil.</p></article>
      <article><span className="eyebrow">02</span><h2>Build the portrait</h2><p>The production workflow preserves likeness while keeping the design practical for cutting, weeding and dyeing.</p></article>
      <article><span className="eyebrow">03</span><h2>Finish the disc</h2><p>Approved artwork moves through the cut-and-dye process rather than being treated as a generic digital illustration.</p></article>
    </section>
    <section id="request-stencil" className="du-request content" aria-labelledby="du-request-title">
      <div className="section-intro"><span className="eyebrow">Request</span><h2 id="du-request-title">Start with the pet.</h2><p>Your contact details and source photos go into the private production workflow. They are not published by this form.</p></div>
      <form className="du-form" onSubmit={submit}>
        <div className="du-form-grid">
          <label>Name<input name="clientName" autoComplete="name" required maxLength={160} /></label>
          <label>Phone<input name="phone" type="tel" inputMode="tel" autoComplete="tel" required /></label>
          <label className="span-2">Pet name<input name="petName" required maxLength={160} /></label>
          <label className="span-2">Reference photos <span className="optional">1–6 images</span><input name="referencePhotos" type="file" accept="image/*" multiple required /></label>
          <label className="span-2">Notes <span className="optional">optional</span><textarea name="notes" rows={4} maxLength={4000} placeholder="Markings, expression, or anything important to preserve or avoid." /></label>
        </div>
        <div className="form-footer"><button className="button primary" type="submit" disabled={busy}>{busy ? 'Working…' : 'Submit request'}</button>{message ? <span className={state === 'error' ? 'form-error' : 'form-success'} role={state === 'error' ? 'alert' : 'status'} aria-live="polite">{message}</span> : null}</div>
      </form>
    </section>
  </main></Shell>;
}
