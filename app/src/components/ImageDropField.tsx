import { useEffect, useId, useRef, useState } from 'react';

type ImageDropFieldProps = {
  name:string;
  label:string;
  hint?:string;
  accept?:string;
  multiple?:boolean;
  required?:boolean;
  maxFiles?:number;
  className?:string;
};

function imageFiles(files:File[],multiple:boolean,maxFiles?:number){
  const images=files.filter(file=>file.type.startsWith('image/')||/\.(?:jpe?g|png|webp|gif|heic|heif|avif)$/i.test(file.name));
  const limited=typeof maxFiles==='number'?images.slice(0,maxFiles):images;
  return multiple?limited:limited.slice(0,1);
}

export function ImageDropField({
  name,label,hint,accept='image/*',multiple=false,required=false,maxFiles,className='',
}:ImageDropFieldProps){
  const inputRef=useRef<HTMLInputElement|null>(null);
  const id=useId();
  const [dragging,setDragging]=useState(false);
  const [selected,setSelected]=useState<string[]>([]);

  function sync(files:File[]){
    const next=imageFiles(files,multiple,maxFiles);
    const transfer=new DataTransfer();
    next.forEach(file=>transfer.items.add(file));
    if(inputRef.current)inputRef.current.files=transfer.files;
    setSelected(next.map(file=>file.name||'Image'));
    inputRef.current?.dispatchEvent(new Event('change',{bubbles:true}));
  }

  useEffect(()=>{
    const input=inputRef.current;
    const form=input?.form;
    if(!form)return;
    const reset=()=>setSelected([]);
    form.addEventListener('reset',reset);
    return()=>form.removeEventListener('reset',reset);
  },[]);

  const status=selected.length
    ? multiple
      ? `${selected.length} image${selected.length===1?'':'s'} ready`
      : selected[0]
    : hint||'Drop an image here';

  return <div className={`image-drop-field ${className}`.trim()}>
    <span className="image-drop-label">{label}{hint?<span className="optional"> {hint}</span>:null}</span>
    <label
      className={`image-drop-zone${dragging?' is-dragging':''}${selected.length?' has-files':''}`}
      htmlFor={id}
      onDragEnter={event=>{event.preventDefault();setDragging(true);}}
      onDragOver={event=>{event.preventDefault();event.dataTransfer.dropEffect='copy';setDragging(true);}}
      onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setDragging(false);}}
      onDrop={event=>{
        event.preventDefault();setDragging(false);
        sync(Array.from(event.dataTransfer.files));
      }}
    >
      <input
        ref={inputRef}
        id={id}
        name={name}
        className="image-drop-input"
        type="file"
        accept={accept}
        multiple={multiple}
        required={required}
        onChange={event=>setSelected(Array.from(event.currentTarget.files||[]).map(file=>file.name||'Image'))}
      />
      <span className="image-drop-icon" aria-hidden="true">＋</span>
      <span className="image-drop-copy">
        <strong>{selected.length?'Ready to upload':'Drag from Photos here'}</strong>
        <small>{status}{selected.length?' · drop another image to replace'+(multiple?' selection':''): ' · or click to choose'}</small>
      </span>
    </label>
  </div>;
}
