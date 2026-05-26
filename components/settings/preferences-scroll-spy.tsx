'use client';

import { useEffect } from 'react';

const SECTION_IDS = [
  'gmail',
  'triage',
  'email-scanning',
  'sender-rules',
  'ai-context',
  'tasks',
  'interface',
  'time',
  'account',
];

/**
 * Renders nothing — attaches IntersectionObservers to each preference section
 * and updates window.location.hash as sections scroll into view. The sidebar's
 * useHash() hook listens to hashchange events and updates its active state.
 */
export function PreferencesScrollSpy() {
  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    const intersecting = new Set<string>();

    const updateHash = () => {
      // Walk in document order and pick the topmost intersecting section
      for (const id of SECTION_IDS) {
        if (intersecting.has(id)) {
          const newHash = '#' + id;
          if (window.location.hash !== newHash) {
            history.replaceState(null, '', newHash);
            window.dispatchEvent(new HashChangeEvent('hashchange'));
          }
          return;
        }
      }
    };

    SECTION_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) intersecting.add(id);
            else                      intersecting.delete(id);
          });
          updateHash();
        },
        {
          // Trigger when the section enters the upper 40% of the viewport
          rootMargin: '-10% 0px -50% 0px',
          threshold:  0,
        },
      );

      observer.observe(el);
      observers.push(observer);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, []);

  return null;
}
