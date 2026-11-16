/** Run the shipped ONNX Runtime Web WASM engine on licensed regression fixtures. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import assert from 'node:assert/strict';
import * as ort from 'onnxruntime-web/wasm';
import { predictImage } from '../src/lib/recognition-core.ts';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root));
const provenance = JSON.parse(await read('public/models/provenance.json'));
for (const file of provenance.files) {
  const bytes = await read(`public/models/${file.path}`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, `Checksum: ${file.path}`);
}

ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.wasm.wasmPaths = {
  wasm: import.meta.resolve('onnxruntime-web/ort-wasm-simd-threaded.wasm'),
  mjs: import.meta.resolve('onnxruntime-web/ort-wasm-simd-threaded.mjs'),
};
ort.env.wasm.wasmBinary = new Uint8Array(await readFile(new URL(ort.env.wasm.wasmPaths.wasm)));
const session = await ort.InferenceSession.create(new Uint8Array(await read('public/models/char_classifier.onnx')), {
  executionProviders: ['wasm'],
  graphOptimizationLevel: 'all',
});
const labels = Array.from((await read('public/models/char_classifier_labels.txt')).toString('utf8').trim());
const fixtures = JSON.parse(await read('tests/fixtures/recognition.json'));
let checked = 0;
try {
  for (const fixture of fixtures.cases) {
    const grayscale = inflateSync(Buffer.from(fixture.grayDeflate, 'base64'));
    const rgba = new Uint8ClampedArray(grayscale.length * 4);
    for (let i = 0; i < grayscale.length; i++) {
      rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = grayscale[i];
      rgba[i * 4 + 3] = 255;
    }
    const prediction = await predictImage({ width: fixtures.side, height: fixtures.side, data: rgba }, labels, async pixels => {
      const input = new ort.Tensor('float32', pixels, [1, 1, 64, 64]);
      const output = await session.run({ image: input });
      const scores = new Float32Array(output.probs.data);
      input.dispose();
      Object.values(output).forEach(tensor => tensor.dispose());
      return scores;
    });
    assert.equal(prediction.status, fixture.expect, `${fixture.name}: ${JSON.stringify(prediction)}`);
    if (fixture.character) assert.equal(prediction.predicted, fixture.character, fixture.name);
    checked++;
  }
  console.log(`WASM model regression: ${checked}/${fixtures.cases.length} passed (synthetic references and negative controls; not a human accuracy estimate).`);
} finally {
  await session.release();
}
