// KTP ↔ selfie face verification, fully in the browser (face-api.js).
// Best-effort screening: the resulting score is shown to the admin, who
// makes the final decision by comparing both photos side by side.

const MODEL_URL = import.meta.env.VITE_FACE_MODEL_URL || '/face-models';

// Euclidean distance between 128-d face descriptors: same person is
// typically < 0.5, different people > 0.6. Photo-ID vs live selfie is
// harder (age, print quality), so 0.55 is used as the match threshold.
export const MATCH_THRESHOLD = 0.55;

let loading = null;
function loadFaceApi() {
  if (!loading) {
    loading = (async () => {
      const faceapi = await import('@vladmandic/face-api');
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      return faceapi;
    })().catch((e) => { loading = null; throw e; });
  }
  return loading;
}

function toImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gambar gagal dimuat.'));
    img.src = src;
  });
}

async function describe(faceapi, src) {
  const img = await toImage(src);
  const opts = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.35 });
  // Wajah terbesar di foto (pada KTP ada juga elemen lain).
  const all = await faceapi.detectAllFaces(img, opts).withFaceLandmarks().withFaceDescriptors();
  if (!all.length) return null;
  return all.sort((a, b) => b.detection.box.area - a.detection.box.area)[0].descriptor;
}

// Map distance → 0..1 similarity for display (0.3 → 100%, 0.9 → 0%).
export const similarity = (distance) => Math.max(0, Math.min(1, (0.9 - distance) / 0.6));

/**
 * @returns {Promise<{ok:boolean, match?:boolean, score?:number, distance?:number, reason?:string}>}
 */
export async function compareFaces(ktpSrc, selfieSrc) {
  let faceapi;
  try {
    faceapi = await loadFaceApi();
  } catch {
    return { ok: false, reason: 'Model verifikasi wajah gagal dimuat. Periksa koneksi lalu coba lagi.' };
  }
  const [a, b] = await Promise.all([describe(faceapi, ktpSrc), describe(faceapi, selfieSrc)]);
  if (!a) return { ok: false, reason: 'Wajah tidak terdeteksi pada foto KTP. Pastikan foto KTP jelas & tidak silau.' };
  if (!b) return { ok: false, reason: 'Wajah tidak terdeteksi pada selfie. Pastikan wajah terlihat jelas & cukup cahaya.' };
  const distance = faceapi.euclideanDistance(a, b);
  return { ok: true, distance, score: similarity(distance), match: distance <= MATCH_THRESHOLD };
}
