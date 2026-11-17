import { useEffect, useRef, useState } from 'react';

// Older Safari (iOS 12 to 15.3) has no dialog methods. Fall back to the open attribute.
function isOpen(dialog: HTMLDialogElement) { return dialog.hasAttribute('open'); }
function isModal(dialog: HTMLDialogElement) { try { return dialog.matches(':modal'); } catch { return false; } }
function showDialog(dialog: HTMLDialogElement) { if (typeof dialog.show === 'function') dialog.show(); else dialog.setAttribute('open', ''); }
function showModalDialog(dialog: HTMLDialogElement) { if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', ''); }
function closeDialog(dialog: HTMLDialogElement) { if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open'); }

export function useFilterSheet() {
  const [compactViewport, setCompactViewport] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 700px)');
    const update = () => { setCompactViewport(media.matches); if (!media.matches && (filtersDialog.current ? isOpen(filtersDialog.current) : false)) { closeDialog(filtersDialog.current); setFiltersOpen(false); } };
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    media.addListener(update); // Safari 13 and older
    return () => media.removeListener(update);
  }, []);
  useEffect(() => {
    const dialog = filtersDialog.current;
    if (!dialog) return;
    if (!compactViewport) {
      if (isOpen(dialog) && isModal(dialog)) closeDialog(dialog);
      if (!isOpen(dialog)) showDialog(dialog);
      return;
    }
    if (!filtersOpen && isOpen(dialog)) closeDialog(dialog);
  }, [compactViewport, filtersOpen]);
  function closeFilters() { if (filtersDialog.current) closeDialog(filtersDialog.current); setFiltersOpen(false); }
  function openFilters() {
    const dialog = filtersDialog.current;
    if (!compactViewport || !dialog) return;
    setFiltersOpen(true);
    if (!isOpen(dialog)) showModalDialog(dialog);
    dialog.querySelector<HTMLElement>('[data-filter-close]')?.focus();
  }
  return { compactViewport, filtersOpen, setFiltersOpen, filtersDialog, openFilters, closeFilters };
}
