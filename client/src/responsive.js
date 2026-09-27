// Responsive helpers: breakpoints, media-query hook, body scroll lock,
// and automatic data-labels so tables can reflow into cards on phones.
import { useEffect, useState } from 'react';

// Breakpoints (keep in sync with styles.css)
export const PHONE = '(max-width: 767px)';     // drawer menu + bottom nav + tabel jadi kartu
export const TABLET = '(max-width: 1199px)';   // sidebar ringkas (ikon) secara default

export function useMediaQuery(query) {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export const isPhone = () => window.matchMedia(PHONE).matches;

// Scroll lock with a counter so nested overlays (drawer + modal + confirm)
// release correctly. Keeps position on iOS where overflow:hidden alone leaks.
let locks = 0;
let savedY = 0;
export function lockScroll() {
  if (locks++ === 0) {
    savedY = window.scrollY;
    const b = document.body.style;
    b.position = 'fixed'; b.top = `-${savedY}px`; b.left = '0'; b.right = '0'; b.width = '100%';
  }
  return () => {
    if (--locks === 0) {
      const b = document.body.style;
      b.position = ''; b.top = ''; b.left = ''; b.right = ''; b.width = '';
      window.scrollTo(0, savedY);
    }
  };
}

export function useScrollLock(active = true) {
  useEffect(() => (active ? lockScroll() : undefined), [active]);
}

// On phones, tables become stacked cards; each cell shows its column name
// via ::before { content: attr(data-label) }. Labels are copied from <th>
// automatically so every table in the app gets this without per-page code.
export function useAutoTableLabels(ref) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    let raf = 0;
    const apply = () => {
      raf = 0;
      for (const table of root.querySelectorAll('table')) {
        const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
        if (!heads.length) continue;
        table.classList.add('rt');
        for (const tr of table.querySelectorAll('tbody tr')) {
          let col = 0;
          for (const td of tr.children) {
            const span = td.colSpan || 1;
            if (span > 1) td.classList.add('rt-full');
            else if (td.dataset.label === undefined) td.dataset.label = heads[col] ?? '';
            col += span;
          }
        }
      }
    };
    const mo = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(apply); });
    mo.observe(root, { childList: true, subtree: true });
    apply();
    return () => { mo.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [ref]);
}

// Bring a panel into view after a selection on small screens (e.g. room
// detail below the room grid, or a calendar day's list).
export function revealOnSmall(id) {
  if (!window.matchMedia('(max-width: 1100px)').matches) return;
  requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}
