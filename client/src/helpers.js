// Shared presentation helpers.

// Deterministic avatar color from a name, using the palette accents.
const palette = ['#7B9669', '#6C8480', '#5E8C5A', '#8AA97D', '#5E7154', '#A0B394', '#6F8C88'];

export function avatarColor(name = '') {
  let h = 0;
  for (const c of name) h += c.charCodeAt(0);
  return palette[h % palette.length];
}

export function initials(name = '') {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase();
}

// Maps the data-layer color keys to CSS variables.
export function toVar(key) {
  const map = {
    jade: 'var(--jade)',
    pebble: 'var(--pebble)',
    ok: 'var(--ok)',
    warn: 'var(--warn)',
    err: 'var(--err)',
    forest: 'var(--forest)',
  };
  return map[key] || key;
}

export function stars(n) {
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}
