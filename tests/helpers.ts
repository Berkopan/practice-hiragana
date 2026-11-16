import { expect, type Page } from '@playwright/test';
import { KANA, type Kana } from '../src/data/kana';

export async function selectKana(page: Page, id: string) {
  const kana = KANA.find(item => item.id === id)!;
  await page.getByRole('button', { name: 'Karakterler', exact: true }).click();
  await page.getByRole('button', { name: `${kana.char}, ${kana.romaji}: bu karakteri çalış`, exact: true }).click();
  return kana;
}

/** Feed sampled stroke trajectories through the real pointer/canvas pipeline. */
export async function drawKana(page: Page, kana: Kana) {
  const paths = await page.evaluate(strokes => strokes.map(d => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    const length = path.getTotalLength();
    const steps = Math.max(8, Math.ceil(length));
    return Array.from({ length: steps + 1 }, (_, i) => {
      const point = path.getPointAtLength(length * i / steps);
      return { x: point.x / 109, y: point.y / 109 };
    });
  }), kana.strokes);
  await drawPaths(page, paths);
}

export async function drawPaths(page: Page, paths: { x: number; y: number }[][]) {
  const canvas = page.locator('.pad-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Drawing canvas is missing');
  for (const points of paths) {
    await canvas.evaluate(element => {
      element.addEventListener('pointerdown', event => {
        (element as HTMLElement).dataset.testPointerId = String((event as PointerEvent).pointerId);
      }, { once: true });
    });
    await page.mouse.move(box.x + points[0].x * box.width, box.y + points[0].y * box.height);
    await page.mouse.down();
    await canvas.evaluate((element, input) => {
      const rect = element.getBoundingClientRect();
      const pointerId = Number((element as HTMLElement).dataset.testPointerId);
      for (const point of input) element.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true, cancelable: true, pointerId, pointerType: 'mouse',
        buttons: 1, pressure: 0.5, clientX: rect.x + point.x * rect.width, clientY: rect.y + point.y * rect.height,
      }));
    }, points.slice(1));
    const last = points[points.length - 1];
    await page.mouse.move(box.x + last.x * box.width, box.y + last.y * box.height);
    await page.mouse.up();
  }
  await expect(page.getByRole('button', { name: 'Kontrol et', exact: true })).toBeEnabled();
}

export async function ready(page: Page) {
  await page.goto('./');
  await expect(page.getByText('Kontrol hazır', { exact: true })).toBeVisible({ timeout: 60_000 });
}
