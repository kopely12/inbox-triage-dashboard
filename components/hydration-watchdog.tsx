'use client';

import { useEffect } from 'react';

// Sets a marker the moment React finishes hydrating this component.
// A companion <script> in layout.tsx checks for this marker after a delay;
// if it's missing, React never hydrated (e.g. a JS chunk returned 403)
// and we show a visible reload banner.
export function HydrationWatchdog() {
  useEffect(() => {
    document.documentElement.setAttribute('data-hydrated', 'true');
  }, []);
  return null;
}
