/** Pure preprocessing and decision logic; the requested answer never enters inference. */
export interface PixelImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface Alternative {
  char: string;
  /** Raw model score. It is not a calibrated probability of correct handwriting. */
  score: number;
}

export interface Prediction {
  status: 'known' | 'uncertain' | 'empty';
  predicted: string | null;
  confidence: number;
  alternatives: Alternative[];
  message?: string;
}

export interface PreparedImage {
  pixels: Float32Array;
  empty: boolean;
  implausible: boolean;
}

export const MODEL_SIDE = 64;
export const PADDING_SCALES = [1.28, 1.75] as const;

/**
 * Composite transparent pixels on white, find ink, square-pad and resample.
 * DaKanji expects light foreground on a dark background (the opposite of our pad).
 * Pure pixel operations avoid depending on OffscreenCanvas support in Safari workers.
 */
export function prepareImage(image: PixelImage, paddingScale = 1.28): PreparedImage {
  const { width, height, data } = image;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      width > 4096 || height > 4096 || data.length !== width * height * 4) {
    throw new Error('Geçersiz çizim görüntüsü.');
  }
  const integralWidth = width + 1;
  const integral = new Float64Array(integralWidth * (height + 1));
  let minX = width, minY = height, maxX = -1, maxY = -1, solidPixels = 0;
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const j = i * 4;
      const darkness = (1 - (data[j] * 0.2126 + data[j + 1] * 0.7152 + data[j + 2] * 0.0722) / 255)
        * (data[j + 3] / 255);
      rowSum += darkness;
      integral[(y + 1) * integralWidth + x + 1] = integral[y * integralWidth + x + 1] + rowSum;
      if (darkness > 0.15) {
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        solidPixels++;
      }
    }
  }
  const pixels = new Float32Array(MODEL_SIDE * MODEL_SIDE);
  const boxWidth = maxX - minX + 1;
  const boxHeight = maxY - minY + 1;
  const minimumSpan = Math.max(4, Math.min(width, height) * 0.025);
  const empty = solidPixels < 12 || Math.max(boxWidth, boxHeight) < minimumSpan;
  if (empty) return { pixels, empty: true, implausible: false };

  // A solid patch / single straight line is not a complete hiragana. This is an
  // input sanity check, not a character-specific template or an OOD guarantee.
  const implausible = solidPixels / (boxWidth * boxHeight) > 0.7;
  const side = Math.max(boxWidth, boxHeight) * paddingScale;
  const left = (minX + maxX + 1) / 2 - side / 2;
  const top = (minY + maxY + 1) / 2 - side / 2;
  // Area resampling preserves fine strokes at any pixel alignment. Sampling a
  // single bilinear point when shrinking a large pad can erase a thin line.
  const areaTo = (rawX: number, rawY: number) => {
    const x = Math.max(0, Math.min(width, rawX));
    const y = Math.max(0, Math.min(height, rawY));
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, width), y1 = Math.min(y0 + 1, height);
    const fx = x - x0, fy = y - y0;
    return integral[y0 * integralWidth + x0] * (1 - fx) * (1 - fy) +
      integral[y0 * integralWidth + x1] * fx * (1 - fy) +
      integral[y1 * integralWidth + x0] * (1 - fx) * fy +
      integral[y1 * integralWidth + x1] * fx * fy;
  };
  const step = side / MODEL_SIDE;
  for (let y = 0; y < MODEL_SIDE; y++) {
    for (let x = 0; x < MODEL_SIDE; x++) {
      const x0 = left + x * step, y0 = top + y * step;
      const x1 = x0 + step, y1 = y0 + step;
      pixels[y * MODEL_SIDE + x] = Math.max(0, Math.min(1,
        (areaTo(x1, y1) - areaTo(x0, y1) - areaTo(x1, y0) + areaTo(x0, y0)) / (step * step)));
    }
  }
  return { pixels, empty: false, implausible };
}

/** Keep the full 6,507-class output: never re-softmax only the requested kana. */
export function classifyScores(scores: ArrayLike<number>, labels: readonly string[]): Prediction {
  if (scores.length !== labels.length || scores.length < 46) {
    throw new Error('Model ile karakter listesi uyuşmuyor.');
  }
  const all: Alternative[] = [];
  let hiraganaMass = 0;
  for (let i = 0; i < scores.length; i++) {
    const score = Number(scores[i]);
    if (!Number.isFinite(score) || score < 0) throw new Error('Model geçersiz bir sonuç döndürdü.');
    if (score > 0) all.push({ char: labels[i], score });
    if (/^[\u3041-\u3096]$/u.test(labels[i])) hiraganaMass += score;
  }
  all.sort((a, b) => b.score - a.score);
  const hiragana = all.filter(({ char }) => /^[\u3041-\u3096]$/u.test(char));
  const best = hiragana[0];
  const strongest = all[0];
  const next = hiragana[1]?.score ?? 0;
  if (!best || !strongest) {
    return { status: 'uncertain', predicted: null, confidence: 0, alternatives: [], message: 'Çizimi okuyamadım. Biraz daha belirgin yazmayı dene.' };
  }

  // Scores are quantized in ~1/255 steps. These are cautious product thresholds,
  // not a measured probability calibration. Full-class competition also catches
  // many scribbles and non-kana inputs that a restricted softmax would accept.
  const confident = best.score >= 0.35 && hiraganaMass >= 0.4 &&
    best.score - next >= 0.18 && best.score >= strongest.score * 0.65;
  return {
    status: confident ? 'known' : 'uncertain',
    predicted: best.char,
    confidence: best.score,
    alternatives: hiragana.slice(0, 3),
    ...(confident ? {} : { message: 'Bu çizimden emin olamadım. Örneği karşılaştırıp yeniden deneyebilirsin.' }),
  };
}

/**
 * Average two centered scales before deciding. This gives the classifier room
 * for both compact and broad handwriting, without per-character exceptions.
 * Inference receives only pixels; no exercise answer is available here.
 */
export async function predictImage(
  image: PixelImage,
  labels: readonly string[],
  infer: (pixels: Float32Array) => Promise<Float32Array>,
): Promise<Prediction> {
  const first = prepareImage(image, PADDING_SCALES[0]);
  if (first.empty) {
    return { status: 'empty', predicted: null, confidence: 0, alternatives: [], message: 'Önce kutuya bir karakter yaz.' };
  }
  if (first.implausible) {
    return { status: 'uncertain', predicted: null, confidence: 0, alternatives: [], message: 'Tam bir karakter göremedim. Biraz daha büyük ve belirgin yazmayı dene.' };
  }
  const combined = new Float32Array(labels.length);
  for (let view = 0; view < PADDING_SCALES.length; view++) {
    const pixels = view === 0 ? first.pixels : prepareImage(image, PADDING_SCALES[view]).pixels;
    const scores = await infer(pixels);
    if (scores.length !== labels.length) throw new Error('Model ile karakter listesi uyuşmuyor.');
    for (let i = 0; i < scores.length; i++) combined[i] += scores[i] / PADDING_SCALES.length;
  }
  return classifyScores(combined, labels);
}
