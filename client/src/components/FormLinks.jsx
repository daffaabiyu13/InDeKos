// Tombol link form publik untuk penghuni: salin link & buka di tab baru (tanpa menampilkan path mentah).
import { copyText } from '../helpers.js';
import { Icons } from './icons.jsx';
import { useToast } from './Toast.jsx';

export default function FormLinks({ path, name, openLabel }) {
  const toast = useToast();
  const url = `${window.location.origin}${path}`;
  return (
    <div className="form-links">
      <button type="button" className="btn btn-g btn-sm" title={`Salin link ${name} untuk dikirim ke penghuni`}
        onClick={async () => toast((await copyText(url)) ? `🔗 Link ${name} disalin.` : '⚠️ Link tidak bisa disalin di browser ini.')}>
        <Icons.link /> Salin Link
      </button>
      <a className="btn btn-p btn-sm" href={path} target="_blank" rel="noopener noreferrer" title={`Buka ${name} di tab baru`}>
        {openLabel || `Buka ${name}`} <Icons.external />
      </a>
    </div>
  );
}
