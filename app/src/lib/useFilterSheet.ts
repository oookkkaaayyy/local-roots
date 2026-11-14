import { useEffect, useRef, useState } from 'react';

export function useFilterSheet() {
  const [compactViewport, setCompactViewport] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 700px)');
    const update = () => { setCompactViewport(media.matches); if (!media.matches && filtersDialog.current?.open) { filtersDialog.current.close(); setFiltersOpen(false); } };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const dialog = filtersDialog.current;
    if (!dialog) return;
    if (!compactViewport) {
      if (dialog.open && dialog.matches(':modal')) dialog.close();
      if (!dialog.open) dialog.show();
      return;
    }
    if (!filtersOpen && dialog.open) dialog.close();
  }, [compactViewport, filtersOpen]);
  function closeFilters() { filtersDialog.current?.close(); setFiltersOpen(false); }
  function openFilters() {
    const dialog = filtersDialog.current;
    if (!compactViewport || !dialog) return;
    setFiltersOpen(true);
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLElement>('[data-filter-close]')?.focus();
  }
  return { compactViewport, filtersOpen, setFiltersOpen, filtersDialog, openFilters, closeFilters };
}
