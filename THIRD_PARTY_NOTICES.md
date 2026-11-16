# Third-party notices

The original application code is © 2026 Berkay Sarıca and is available under the [MIT license](LICENSE). Third-party code, model weights, and guide data retain the separate licenses listed below. In particular, **the KanjiVG-derived dataset is CC BY-SA 3.0, not MIT**.

## Assets shipped with the website

| Component | Version / source | License | Included notice |
| --- | --- | --- | --- |
| React, React DOM, and Scheduler | React / React DOM `19.3.1`; Scheduler `0.28.0` | MIT, © Meta Platforms, Inc. and affiliates | [`react.txt`](public/licenses/react.txt) |
| ONNX Runtime Web and Common | `1.31.1`, Microsoft | MIT | [`onnxruntime.txt`](public/licenses/onnxruntime.txt) |
| Components used by ONNX Runtime | Upstream `v1.31.1` comprehensive notice file | Component-specific licenses | [`onnxruntime-third-party.txt`](public/licenses/onnxruntime-third-party.txt) |
| DaKanji single-character model and class labels | Upstream release `v2.0`, Dariyooo / DaAppLab | MIT, © 2021 CaptainDario | [`dakanji.txt`](public/licenses/dakanji.txt) |
| KanjiVG stroke guides | 46 basic hiragana; source commit `610091ce618cf757ed1357a8954cd65283e015d6` | CC BY-SA 3.0, © Ulrich Apel | [`kanjivg.txt`](public/licenses/kanjivg.txt) |

These notice files live in `public/licenses/` so the static build also distributes them. The application license is also copied to [`public/licenses/app.txt`](public/licenses/app.txt). The React, React DOM, and Scheduler packages carry identical license texts; the included `react.txt` preserves that text verbatim. The app imports ONNX Runtime's WASM-specific entry point (`onnxruntime-web/wasm`) and distributes its WASM bootstrap and binary. The comprehensive upstream ONNX Runtime notices are included intact; they cover upstream components and may list components not compiled into this particular browser build.

### Character recognition model

**Character recognition powered by machine learning from Dariyooo (DaAppLab).**

The unmodified weights and labels come from [DaKanji-Single-Kanji-Recognition v2.0](https://github.com/dariyooo/DaKanji-Single-Kanji-Recognition/releases/tag/v2.0), source revision [`ca4d6c34bacf971ea2d73ddc63d6f803b7902dd8`](https://github.com/dariyooo/DaKanji-Single-Kanji-Recognition/tree/ca4d6c34bacf971ea2d73ddc63d6f803b7902dd8). The model publisher releases the project under MIT; the original notice is retained in `public/licenses/dakanji.txt`.

The model publisher identifies the **ETL Character Database** and **KanjiVG** among its training sources. Training-data attribution is retained in [`public/models/provenance.json`](public/models/provenance.json). This repository distributes the publisher's released model, not the raw ETL training images; it does not claim that ETL's original dataset is MIT-licensed. See [the recognition notes](docs/recognition.md) for the model's intended use, processing, evaluation, and limitations.

The included model file is `public/models/char_classifier.onnx` (2,230,001 bytes), SHA-256 `2c8d334e1541720dd1f8603a9dc3ecd270842756c99fbe24ce2de3e925e1f4a7`. The labels file is `public/models/char_classifier_labels.txt` (19,521 bytes), SHA-256 `a3b26bee5c6b37f3e76f802c8012c6b00c0dfbcda90de1a208d62386b2c6b3ba`.

### KanjiVG teaching guides

The [KanjiVG project](https://kanjivg.tagaini.net/) is copyright Ulrich Apel. Its stroke data is available under [Creative Commons Attribution-ShareAlike 3.0 Unported](https://creativecommons.org/licenses/by-sa/3.0/).

The 46-character subset in `src/data/kana.ts` selects and repackages the original SVG paths without changing their geometry or order. This adaptation remains under CC BY-SA 3.0. Original attribution, the license, and a modification statement are retained. See [`DATA_SOURCES.md`](DATA_SOURCES.md) for exact scope and reproducible SHA-256-verified extraction. No endorsement by the source projects or authors is implied.

### ONNX Runtime notice provenance

The ONNX Runtime license and third-party notices were obtained from upstream tag [`v1.31.1`](https://github.com/microsoft/onnxruntime/tree/v1.31.1), which resolves to commit `6af1a932e2286d5c58166085d24c68783033edee`.

| Source file | Included copy | SHA-256 of unmodified contents |
| --- | --- | --- |
| [`LICENSE`](https://github.com/microsoft/onnxruntime/blob/v1.31.1/LICENSE) | `public/licenses/onnxruntime.txt` | `2f07c72751aed99790b8a4869cf2311df85a860b22ded05fa22803587a48922c` |
| [`ThirdPartyNotices.txt`](https://github.com/microsoft/onnxruntime/blob/v1.31.1/ThirdPartyNotices.txt) | `public/licenses/onnxruntime-third-party.txt` | `143764b952fdb1a7c69ce653bfba74a7744d6a8a573bfb73e235fba356c83de3` |

## Build and test tools

[Vite](https://github.com/vitejs/vite) `8.3.8` is an MIT-licensed build tool, © VoidZero Inc. and Vite contributors. Its complete published license file, including its bundled dependency notices, is included as [`public/licenses/vite.txt`](public/licenses/vite.txt). Vite itself is not needed as a server for the deployed site.

The repository also uses the React Vite plugin (MIT), TypeScript (Apache-2.0), Vitest (MIT), Playwright (Apache-2.0), and type definitions during development. Their packages and transitive dependencies are versioned in `package-lock.json` and retain their notices in the npm distribution. `node_modules` and development servers are not distributed as part of the deployed site.

When updating dependencies, preserve their notices and refresh the copied runtime license files. Changes to ONNX Runtime should update both its MIT notice and its upstream third-party notice file from the matching release. Changes to models or data should also update the associated provenance record.
