import type { Alternative, Prediction } from './recognition-core';

export interface RecognitionResult {
  status: 'correct' | 'incorrect' | 'uncertain' | 'empty';
  predicted: string | null;
  /** Raw classifier score, not a calibrated handwriting accuracy percentage. */
  confidence: number;
  alternatives: Alternative[];
  message?: string;
}

export interface Recognizer {
  recognize(image: ImageData, expected: string): Promise<RecognitionResult>;
}

let cached: Promise<Recognizer> | undefined;
let lastProgress = 0;
const progressListeners = new Set<(progress: number) => void>();

/** Load once, reuse the worker, and allow a clean retry after any loading failure. */
export function getRecognizer(options?: { onProgress?: (progress: number) => void }): Promise<Recognizer> {
  const listener = options?.onProgress;
  if (listener) { progressListeners.add(listener); listener(lastProgress); }
  if (!cached) {
    cached = createRecognizer().catch(error => {
      cached = undefined; lastProgress = 0;
      throw error;
    });
  }
  return cached.finally(() => { if (listener) progressListeners.delete(listener); });
}

function createRecognizer(): Promise<Recognizer> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./recognition.worker.ts', import.meta.url), { type: 'module' });
    const pending = new Map<number, {
      expected: string;
      resolve: (result: RecognitionResult) => void;
      reject: (reason: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }>();
    let sequence = 0;
    let ready = false;
    let failed = false;
    const fail = (message: string) => {
      if (failed) return;
      failed = true; clearTimeout(loadTimer); worker.terminate();
      const error = new Error(message);
      pending.forEach(item => { clearTimeout(item.timer); item.reject(error); });
      pending.clear(); cached = undefined; lastProgress = 0;
      reject(error);
    };
    const loadTimer = setTimeout(() => fail('Model yüklenemedi. İnternet bağlantını kontrol edip yeniden dene.'), 120_000);
    worker.onerror = () => fail('Tanıma modeli başlatılamadı. Sayfayı yenileyip yeniden deneyebilirsin.');
    worker.onmessage = (event: MessageEvent) => {
      const data = event.data;
      if (data.type === 'progress') {
        lastProgress = Math.max(lastProgress, Math.min(1, data.value));
        progressListeners.forEach(listener => listener(lastProgress));
      } else if (data.type === 'ready') {
        clearTimeout(loadTimer); ready = true; lastProgress = 1;
        progressListeners.forEach(listener => listener(1));
        resolve({
          recognize: (image, expected) => new Promise<RecognitionResult>((resolveResult, rejectResult) => {
            if (!ready || failed) { rejectResult(new Error('Modeli yeniden yüklemek gerekiyor.')); return; }
            const id = ++sequence;
            const timer = setTimeout(() => fail('Tanıma beklenenden uzun sürdü. Yeniden deneyebilirsin.'), 30_000);
            pending.set(id, { expected, resolve: resolveResult, reject: rejectResult, timer });
            // Do not detach the caller's ImageData; the UI may still use it.
            const pixels = new Uint8ClampedArray(image.data);
            worker.postMessage({ type: 'recognize', id, image: { width: image.width, height: image.height, data: pixels } }, [pixels.buffer]);
          }),
        });
      } else if (data.type === 'result') {
        const item = pending.get(data.id);
        if (!item) return;
        clearTimeout(item.timer); pending.delete(data.id);
        const prediction = data.prediction as Prediction;
        // Only now compare the blind prediction with the exercise's answer.
        item.resolve({ ...prediction,
          status: prediction.status === 'known' ? (prediction.predicted === item.expected ? 'correct' : 'incorrect') : prediction.status,
        });
      } else if (data.type === 'error') {
        if (!ready || data.id === undefined) { fail(data.message); return; }
        const item = pending.get(data.id);
        if (item) { clearTimeout(item.timer); pending.delete(data.id); item.reject(new Error(data.message)); }
      }
    };
    worker.postMessage({ type: 'init',
      modelUrl: new URL('./models/char_classifier.onnx', document.baseURI).href,
      labelsUrl: new URL('./models/char_classifier_labels.txt', document.baseURI).href,
    });
  });
}
