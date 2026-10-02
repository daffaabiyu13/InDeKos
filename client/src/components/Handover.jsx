// Foto pengesahan kamar: bukti kondisi kamar saat penghuni mulai menempati.
import { useState } from 'react';
import { api, fileUrl } from '../api.js';
import { fmtDate } from '../helpers.js';
import { useToast } from './Toast.jsx';
import { useConfirm } from './Confirm.jsx';
import { useAuth } from './Auth.jsx';
import Modal from './Modal.jsx';
import { MultiPhotoInput, PhotoGallery } from './MultiPhoto.jsx';

export const HANDOVER_MAX = 12;

export const toGallery = (photos) => photos.map((p) => ({
  key: p.id, id: p.id, url: fileUrl(p.file), caption: p.caption, sub: `Kamar ${p.room} · ${fmtDate(p.takenAt)}`,
}));

// Kartu di profil penghuni: lihat, tambah (staf), hapus (pemilik).
export function HandoverCard({ r, reload }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { isPemilik } = useAuth();
  const [adding, setAdding] = useState(false);
  const photos = r.handoverPhotos || [];

  async function remove(p) {
    if (!(await confirm({ title: 'Hapus Foto Pengesahan', message: `Hapus foto "${p.caption || 'tanpa keterangan'}"? Foto pengesahan adalah bukti kondisi kamar saat masuk.`, confirmText: 'Hapus', danger: true }))) return;
    try { await api.deleteHandoverPhoto(p.id); toast('Foto dihapus.'); reload(); } catch (e) { toast(`⚠️ ${e.message}`); }
  }

  return (
    <div className="card" id="foto-kamar">
      <div className="ch">
        <div>
          <div className="ct">Foto Pengesahan Kamar</div>
          <div className="cs">Kondisi kamar saat mulai ditempati — bukti serah terima & acuan saat keluar</div>
        </div>
        {photos.length < HANDOVER_MAX && <button className="btn btn-p btn-sm" onClick={() => setAdding(true)}>+ Tambah Foto</button>}
      </div>
      <div className="cb">
        <PhotoGallery photos={toGallery(photos)} onDelete={isPemilik ? remove : undefined}
          empty="Belum ada foto pengesahan. Tambahkan foto kondisi kamar (kasur, lemari, kamar mandi, dinding, dll.)." />
      </div>
      {adding && <AddHandoverModal r={r} have={photos.length} onClose={() => setAdding(false)} onDone={reload} />}
    </div>
  );
}

function AddHandoverModal({ r, have, onClose, onDone }) {
  const toast = useToast();
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await api.addHandoverPhotos(r.id, photos);
      toast(`✅ ${photos.length} foto pengesahan kamar ${r.room} disimpan.`);
      onDone();
      onClose();
    } catch (e) { toast(`⚠️ ${e.message}`); setBusy(false); }
  }
  return (
    <Modal title={`Foto Pengesahan · Kamar ${r.room}`} onClose={onClose} width={620} footer={<>
      <button className="btn btn-g" onClick={onClose}>Batal</button>
      <button className="btn btn-p" onClick={save} disabled={busy || !photos.length}>{busy ? 'Mengunggah…' : `Simpan ${photos.length || ''} Foto`}</button>
    </>}>
      <MultiPhotoInput value={photos} onChange={setPhotos} max={HANDOVER_MAX - have} idPrefix="ho"
        hint="Foto tiap sudut & perabot. Beri keterangan agar mudah dibandingkan saat penghuni keluar." />
    </Modal>
  );
}

// Tampilan ringkas (hanya lihat) — dipakai saat memproses keluar untuk membandingkan kondisi kamar.
export function HandoverCompare({ photos }) {
  if (!photos?.length) return null;
  return (
    <div className="ho-compare">
      <div className="fp-sec">Foto Pengesahan Saat Masuk ({photos.length})</div>
      <div className="field-hint" style={{ marginBottom: 8 }}>Bandingkan dengan kondisi kamar sekarang sebelum mengembalikan deposit.</div>
      <PhotoGallery photos={toGallery(photos)} />
    </div>
  );
}
