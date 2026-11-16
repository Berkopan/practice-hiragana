# Handwriting recognition

## Model and runtime

The app uses the pretrained **DaKanji Single Character Recognition v2.0** convolutional neural network by CaptainDario / Dariyooo (DaAppLab). It identifies a single character from an image among 6,507 classes, including hiragana, katakana and kanji. It is an actual learned image classifier; the app does not check handwriting against hardcoded character rules or require tracing a fixed path.

- Upstream model and releases: <https://github.com/dariyooo/DaKanji-Single-Kanji-Recognition>
- Pinned release: <https://github.com/dariyooo/DaKanji-Single-Kanji-Recognition/releases/tag/v2.0>
- Release tag revision: `ca4d6c34bacf971ea2d73ddc63d6f803b7902dd8`
- Model: `char_classifier.onnx`, 2,230,001 bytes, quantized INT8, ONNX opset 18.
- Input: `image`, Float32 NCHW; the app supplies `[1, 1, 64, 64]`, white ink on black.
- Output: `probs`, `[1, 6507]`, aligned to the **characters** in `char_classifier_labels.txt`. That file is one continuous string, not one label per line.
- Runtime: `onnxruntime-web` 1.31.1, CPU WebAssembly, one thread, in a dedicated module worker. No WebGPU, SharedArrayBuffer, cross-origin isolation or backend is needed.

The complete upstream license is in [public/licenses/dakanji.txt](../public/licenses/dakanji.txt). Exact artifact and archive checksums are recorded in [public/models/provenance.json](../public/models/provenance.json). The upstream README credits the ETL Character Database and KanjiVG as training sources. No ETL training images or database archives are redistributed here. The model author's MIT grant covers the supplied model software; it is not a grant to redistribute the upstream training databases.

Character recognition powered by machine learning from Dariyooo (DaAppLab).

## Build and hosting

Run `python3 scripts/fetch-model.py` before building. It downloads the fixed release archive only when needed, verifies both the archive and extracted model SHA-256 hashes, and writes the model to `public/models/`. A mismatch aborts the build. Labels and provenance are committed; the binary weights are intentionally excluded from Git.

Vite copies the downloaded model into the published site and bundles the matching WASM files from the locked npm package. All runtime assets are then served from the site's own origin. Drawing images stay in the browser. The initial uncached load includes the 2.23 MB model and roughly 15 MB of WASM before HTTP compression, plus application code; later visits can use the site's offline cache.

## How a drawing is evaluated

1. The drawing pad exports **only ink** on a plain white background. Grid lines, hints, ghost characters and stroke demonstrations are separate visual layers and never enter the classifier.
2. The worker composites transparent pixels on white, finds the ink bounds, preserves the aspect ratio and centers the drawing. Blank/tiny marks and filled blocks are rejected before inference.
3. Area resampling preserves thin strokes while shrinking the drawing. Two normalized sizes, with square padding factors 1.28 and 1.75, accommodate different writing scales. Their full 6,507-class scores are averaged. There are no per-character geometry exceptions.
4. The classifier sees **no expected answer**. Its full output is retained; the app does not renormalize probabilities over only the exercise's target or selected practice group.
5. The best hiragana candidate is accepted only when its raw score, total hiragana mass, separation from other hiragana and competition with all character classes meet conservative thresholds. These are product heuristics, not statistical calibration. Uncertain results invite another attempt.
6. Only after this blind prediction does the main thread compare the predicted character with the exercise's answer.

Stroke-order demonstrations come from KanjiVG. A drawing can be recognizable even when its stroke order is unconventional. The image classifier does not grade stroke order, pen direction or calligraphic quality.

## Validation and limits

`node --experimental-strip-types scripts/verify-model.mjs` verifies the pinned hashes and executes the actual ONNX Runtime Web WASM engine on the same preprocessing and scoring code used by the worker. The committed regression suite contains all 46 basic hiragana, five scaled/translated examples and eight negative controls (blank, dot, line, cross, scribble, A, B and square). **59/59 cases passed** when this version was implemented. Seven focused unit tests separately cover empty input, image sanity checks, ambiguous model output and non-hiragana competitors.

An additional development check covered 368 synthetic kana images: all 46 basic characters at four line widths and two scales. All were correctly recognized with the two-size preprocessing. These are **synthetic regression checks, not an estimate of recognition accuracy on people's handwriting**. The reference strokes come from KanjiVG, which is also among the model's upstream training sources. Independent Apple Pencil handwriting was not available as a held-out evaluation set.

Known limitations:

- A neural classifier can confidently misread unfamiliar shapes. For example, a plain circle was read as `の` during development. A high model score does not prove that every stroke is correctly written.
- Visually close characters and unusual handwriting styles can be confused. Very faint, incomplete or cramped strokes may produce an uncertain result.
- Some hiragana and katakana shapes are visually indistinguishable, such as `へ` and `ヘ`; the full-class confidence checks account for competing classes, but there is no way to infer script intent from identical pixels.
- This version practices the 46 basic hiragana. The model has more classes, but dakuten, handakuten and contracted syllables are not an advertised exercise set in this release.
- The model evaluates character identity. Use the stroke animation and example comparison to check writing form and order as well.

## Regression-fixture provenance

[tests/fixtures/recognition.json](../tests/fixtures/recognition.json) is a compact text fixture set. Kana paths are derived from KanjiVG revision `610091ce618cf757ed1357a8954cd65283e015d6`, with the same source paths recorded in [src/data/kana.ts](../src/data/kana.ts). To create the fixtures, stroke-only SVG paths were rendered black on white at 256×256, with line width 0.025 of the pad. Selected copies were translated and scaled to 65%. The images were reduced to 128×128 grayscale using Lanczos, then compressed with zlib and encoded as base64. Negative controls are simple original geometric drawings. Each fixture is decoded into RGBA and passed through the real preprocessing during the test.

The derived fixture data remains **CC BY-SA 3.0**, with attribution and modification notes inside the JSON. Original application code is MIT; the KanjiVG-derived data retains its separate license. See [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
