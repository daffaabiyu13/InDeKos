// Image uploads (foto KTP, selfie, struk). Received as base64 data URLs
// in JSON, validated by magic bytes, stored under data/uploads with a
// random name, and served only to authenticated staff.
import fs from 'node:fs';
import path from 'node:path';
import { UPLOAD_DIR } from './db.js';
import { randomId } from './util.js';

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB per image
const NAME_RE = /^[A-Za-z0-9_-]+\.(jpg|png|webp)$/;

function sniff(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'webp';
  return null;
}

const invalid = (msg) => Object.assign(new Error(msg), { status: 400 });

// Returns stored filename, '' when no image given. Throws 400 on invalid input.
export function saveImage(dataUrl, prefix = 'img') {
  if (!dataUrl) return '';
  const m = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl));
  if (!m) throw invalid('Format gambar tidak valid (gunakan JPG/PNG/WebP).');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX_BYTES) throw invalid('Ukuran gambar maksimal 4 MB.');
  const ext = sniff(buf);
  if (!ext) throw invalid('File bukan gambar yang valid.');
  const name = `${prefix}_${randomId(12)}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return name;
}

export function sendImage(req, res) {
  const name = String(req.params.name || '');
  if (!NAME_RE.test(name)) return res.status(400).json({ error: 'Nama file tidak valid.' });
  const file = path.join(UPLOAD_DIR, name);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'File tidak ditemukan.' });
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(file);
}
