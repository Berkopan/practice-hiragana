import { test, expect } from '@playwright/test';
import { KANA } from '../src/data/kana';
import { drawKana, drawPaths, ready, selectKana } from './helpers';

test('the real production worker recognizes all 46 base kana from pen trajectories', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await ready(page);
  await page.getByRole('button', { name: 'Görerek', exact: true }).click();
  for (const kana of KANA) {
    await selectKana(page, kana.id);
    await drawKana(page, kana);
    await page.getByRole('button', { name: 'Kontrol et', exact: true }).click();
    await expect(page.getByText(`${kana.char} doğru tanındı.`, { exact: false })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('a wrong character is rejected and unchanged drawings are not scored twice', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Hatırla', exact: true }).click();
  await selectKana(page, 'a');
  await expect(page.locator('.prompt-romaji')).toHaveText('a');
  await drawKana(page, KANA.find(kana => kana.id === 'ni')!);
  await page.getByRole('button', { name: 'Kontrol et', exact: true }).click();
  await expect(page.getByText('Yazdığın karakter に olarak tanındı.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Kontrol et', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'İlerlemeni görüntüle' }).click();
  await expect(page.getByText('Toplam 1 değerlendirilen deneme.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Pencereyi kapat' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Hatırla', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'İlerlemeni görüntüle' }).click();
  await expect(page.getByText('Toplam 1 değerlendirilen deneme.', { exact: false })).toBeVisible();
});

test('uncertain marks do not count as wrong and hint pixels never reach the model', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Rehber', exact: true }).click();
  await expect(page.locator('.pad-guide')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Kontrol et', exact: true })).toBeDisabled();
  await drawPaths(page, [[{ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }]]);
  await page.getByRole('button', { name: 'Kontrol et', exact: true }).click();
  await expect(page.getByText('Emin olamadım.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'İlerlemeni görüntüle' }).click();
  await expect(page.getByText('Toplam 0 değerlendirilen deneme.', { exact: false })).toBeVisible();
});

test('undo, clear, Pencil-only touch rejection and resize preserve drawing behavior', async ({ page }) => {
  await ready(page);
  await selectKana(page, 'i');
  await page.getByLabel('Yalnızca Pencil').check();
  await page.locator('.pad-canvas').dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 18, button: 0, clientX: 50, clientY: 50 });
  await expect(page.getByRole('button', { name: 'Kontrol et', exact: true })).toBeDisabled();
  await drawKana(page, KANA.find(kana => kana.id === 'i')!);
  await expect(page.locator('.stroke-counter')).toHaveText('2 çizgi');
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.getByRole('button', { name: 'Kontrol et', exact: true }).click();
  await expect(page.getByText('い doğru tanındı.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Son çizgiyi geri al' }).click();
  await expect(page.locator('.stroke-counter')).toHaveText('1 çizgi');
  await page.getByRole('button', { name: 'Temizle', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Kontrol et', exact: true })).toBeDisabled();
});

test('the complete app and model work after an offline reload', async ({ page, context }) => {
  await ready(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => {
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
    });
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Kontrol hazır', { exact: true })).toBeVisible({ timeout: 60_000 });
  const kana = await selectKana(page, 'a');
  await drawKana(page, kana);
  await page.getByRole('button', { name: 'Kontrol et', exact: true }).click();
  await expect(page.getByText('あ doğru tanındı.', { exact: false })).toBeVisible();
});

test('phone and tablet layouts stay within the viewport and the pad stays square', async ({ page }) => {
  await page.goto('./');
  const viewports = [
    { width: 375, height: 1100 },
    { width: 768, height: 1100 },
    { width: 1024, height: 1100 },
    { width: 1280, height: 1000 },
    { width: 1194, height: 834 },
    { width: 1194, height: 800 },
  ];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expect(page.locator('.writing-pad')).toBeVisible();
    const geometry = await page.evaluate(() => {
      const pad = document.querySelector('.pad-canvas')!.getBoundingClientRect();
      const submit = document.querySelector('.submit-row')!.getBoundingClientRect();
      return {
        page: document.documentElement.scrollWidth, viewport: innerWidth,
        width: pad.width, height: pad.height, padTop: pad.top,
        submitBottom: submit.bottom, viewportHeight: innerHeight,
      };
    });
    expect(geometry.page).toBeLessThanOrEqual(geometry.viewport + 1);
    expect(Math.abs(geometry.width - geometry.height)).toBeLessThan(2);
    expect(geometry.width).toBeGreaterThan(280);
    if (viewport.width > viewport.height) {
      // Writing and checking must fit together without scrolling on landscape tablets.
      expect(geometry.padTop).toBeGreaterThanOrEqual(0);
      expect(geometry.submitBottom).toBeLessThanOrEqual(geometry.viewportHeight - 8);
    }
  }
});
