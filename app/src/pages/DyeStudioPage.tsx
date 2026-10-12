import { useEffect } from 'react';

export function DyeStudioPage() {
  useEffect(() => {
    window.location.replace('/dye-studio/index.html');
  }, []);

  return <main aria-label="Opening Dye Studio" />;
}
