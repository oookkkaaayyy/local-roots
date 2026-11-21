export function DuSwitch({active}:{active:'stencil'|'dye'}){
  return <nav className="du-switch" aria-label="Dyed & Unattached tools">
    <a href="/dyed-and-unattached/stencil" aria-current={active==='stencil'?'page':undefined}>Stencil</a>
    <a href="/dyed-and-unattached/dye-studio" aria-current={active==='dye'?'page':undefined}>Dye design</a>
  </nav>;
}
