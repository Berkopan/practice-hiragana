import { describe, expect, it } from 'vitest';
import { classifyScores, prepareImage } from './recognition-core';

const labels = Array.from('あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん漢字');
function scores(values: Record<string, number>) {
  return labels.map(char => values[char] ?? 0);
}

describe('recognition decisions', () => {
  it('retains non-hiragana competition instead of always choosing a kana', () => {
    const result = classifyScores(scores({ 漢: 0.92, あ: 0.04 }), labels);
    expect(result.status).toBe('uncertain');
    expect(result.confidence).toBe(0.04);
  });

  it('abstains when similar kana have insufficient separation', () => {
    expect(classifyScores(scores({ あ: 0.49, お: 0.46 }), labels).status).toBe('uncertain');
  });

  it('identifies clear drawings without an expected answer parameter', () => {
    const result = classifyScores(scores({ い: 0.91, り: 0.05 }), labels);
    expect(result.status).toBe('known');
    expect(result.predicted).toBe('い');
  });

  it('rejects mismatched labels and invalid numeric model output', () => {
    expect(() => classifyScores([1], labels)).toThrow();
    expect(() => classifyScores(scores({ あ: Number.NaN }), labels)).toThrow();
  });
});

describe('image preprocessing', () => {
  it('does not mistake transparent black pixels for ink', () => {
    const result = prepareImage({ width: 32, height: 32, data: new Uint8ClampedArray(32 * 32 * 4) });
    expect(result.empty).toBe(true);
  });

  it('treats a blank white pad as empty', () => {
    const result = prepareImage({ width: 32, height: 32, data: new Uint8ClampedArray(32 * 32 * 4).fill(255) });
    expect(result.empty).toBe(true);
  });

  it('flags a filled rectangle rather than sending it to a forced-choice classifier', () => {
    const width = 64;
    const data = new Uint8ClampedArray(width * width * 4).fill(255);
    for (let y = 12; y < 48; y++) for (let x = 12; x < 48; x++) {
      const index = (y * width + x) * 4;
      data[index] = data[index + 1] = data[index + 2] = 0;
    }
    const result = prepareImage({ width, height: width, data });
    expect(result.empty).toBe(false);
    expect(result.implausible).toBe(true);
    expect(Math.max(...result.pixels)).toBe(1);
    expect(result.pixels[0]).toBeCloseTo(0);
  });
});
