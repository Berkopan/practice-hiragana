import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import wasmModuleUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import { MODEL_SIDE, predictImage } from './recognition-core';
import type { PixelImage, Prediction } from './recognition-core';

type Request = { type: 'init'; modelUrl: string; labelsUrl: string } |
  { type: 'recognize'; id: number; image: PixelImage };

let session: ort.InferenceSession | undefined;
let labels: string[] = [];
let work = Promise.resolve();

async function download(url: string, onProgress: (fraction: number) => void): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Dosya yüklenemedi (${response.status}).`);
  const total = Number(response.headers.get('content-length'));
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    onProgress(1);
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); loaded += value.byteLength;
    if (total > 0) onProgress(Math.min(0.99, loaded / total));
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  onProgress(1);
  return bytes;
}

async function initialize(request: Extract<Request, { type: 'init' }>) {
  ort.env.wasm.numThreads = 1; // GitHub Pages does not supply COOP/COEP headers.
  ort.env.wasm.proxy = false; // This module is already a dedicated worker.
  ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: wasmModuleUrl };
  ort.env.logLevel = 'error';
  let modelProgress = 0, runtimeProgress = 0;
  const progress = () => self.postMessage({ type: 'progress', value: 0.03 + modelProgress * 0.15 + runtimeProgress * 0.68 });
  progress();
  const [model, runtime, labelsResponse] = await Promise.all([
    download(request.modelUrl, p => { modelProgress = p; progress(); }),
    download(wasmUrl, p => { runtimeProgress = p; progress(); }),
    fetch(request.labelsUrl),
  ]);
  if (!labelsResponse.ok) throw new Error('Karakter listesi yüklenemedi.');
  labels = Array.from((await labelsResponse.text()).trim());
  if (labels.length !== 6507 || !'あいうえおん'.split('').every(c => labels.includes(c))) {
    throw new Error('Modelin karakter listesi geçersiz.');
  }
  ort.env.wasm.wasmBinary = runtime;
  self.postMessage({ type: 'progress', value: 0.9 });
  session = await ort.InferenceSession.create(model, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
  // Validate the actual session before telling the interface that it is ready.
  if (session.inputNames[0] !== 'image' || session.outputNames[0] !== 'probs') {
    throw new Error('Beklenmeyen model biçimi.');
  }
  self.postMessage({ type: 'ready' });
}

async function recognize(image: PixelImage): Promise<Prediction> {
  if (!session) throw new Error('Tanıma modeli henüz hazır değil.');
  const activeSession = session;
  return predictImage(image, labels, async pixels => {
    const tensor = new ort.Tensor('float32', pixels, [1, 1, MODEL_SIDE, MODEL_SIDE]);
    let outputs: ort.InferenceSession.ReturnType | undefined;
    try {
      outputs = await activeSession.run({ image: tensor });
      return new Float32Array(outputs.probs.data as Float32Array);
    } finally {
      tensor.dispose();
      if (outputs) Object.values(outputs).forEach(output => output.dispose());
    }
  });
}

self.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data;
  // Serial inference also makes repeated button taps safe on slower devices.
  work = work.then(async () => {
    try {
      if (request.type === 'init') await initialize(request);
      else self.postMessage({ type: 'result', id: request.id, prediction: await recognize(request.image) });
    } catch (error) {
      self.postMessage({ type: 'error', id: request.type === 'recognize' ? request.id : undefined,
        message: error instanceof Error ? error.message : 'Tanıma modeli çalıştırılamadı.' });
    }
  });
};
