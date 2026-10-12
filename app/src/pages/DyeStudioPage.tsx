import { useEffect } from 'react';

export function DyeStudioPage() {
  useEffect(() => {
    window.location.replace('/dyed-and-unattached/dye-studio/index.html');
  }, []);

  return <main aria-label="Opening Dye Studio" />;
}
