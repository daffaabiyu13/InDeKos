// Markdown ringan untuk jawaban AI: **tebal**, baris "- " jadi daftar,
// baris kosong memisahkan paragraf. Dirender sebagai elemen React
// (bukan innerHTML) sehingga teks dari AI/pengguna tidak bisa menyisipkan HTML.
import { Fragment } from 'react';

function inline(text, keyBase) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (
    part.startsWith('**') && part.endsWith('**') && part.length > 4
      ? <strong key={`${keyBase}-${i}`}>{part.slice(2, -2)}</strong>
      : <Fragment key={`${keyBase}-${i}`}>{part}</Fragment>
  ));
}

export default function Md({ text = '', className = '' }) {
  const blocks = [];
  let para = []; let list = [];
  const flushPara = () => { if (para.length) { blocks.push({ t: 'p', lines: para }); para = []; } };
  const flushList = () => { if (list.length) { blocks.push({ t: 'ul', lines: list }); list = []; } };
  for (const raw of String(text).split('\n')) {
    const line = raw.trimEnd();
    const item = line.match(/^\s*(?:[-•*]|\d+[.)])\s+(.*)$/);
    if (item) { flushPara(); list.push(item[1]); } else if (!line.trim()) { flushPara(); flushList(); } else { flushList(); para.push(line); }
  }
  flushPara(); flushList();
  return (
    <div className={`md ${className}`}>
      {blocks.map((b, i) => (b.t === 'ul'
        ? <ul key={i}>{b.lines.map((l, j) => <li key={j}>{inline(l, `${i}-${j}`)}</li>)}</ul>
        : <p key={i}>{b.lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l, `${i}-${j}`)}</Fragment>)}</p>))}
    </div>
  );
}
