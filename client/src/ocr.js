// Receipt OCR (Tesseract.js, runs in the browser). The library, its WASM
// core and the language data are fetched on first use only.
import { parseReceipt } from './receiptParser.js';

export async function scanReceipt(dataUrl, onProgress) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(['ind', 'eng'], 1, {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) onProgress(Math.round(m.progress * 100));
    },
  });
  try {
    const { data } = await worker.recognize(dataUrl);
    return { ...parseReceipt(data.text), text: data.text, confidence: Math.round(data.confidence) };
  } finally {
    await worker.terminate();
  }
}
