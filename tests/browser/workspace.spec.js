import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

test('inspect a design, create FreeCAD script and export validated CAD files', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'OpenRocket CAD Workbench' })).toBeVisible();
  await page.locator('#file-input').setInputFiles('public/aster-01.ork');
  await expect(page.locator('#model-name')).toHaveText('Aster 01');
  await expect(page.locator('#stat-parts')).toHaveText('11');
  await expect(page.locator('#viewer canvas')).toBeVisible();
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await page.screenshot({ path: testInfo.outputPath('desktop.png') });
  await page.getByRole('button', { name: 'X-ray', exact: true }).click();
  await page.locator('#section').check();
  await page.locator('#explode').fill('25');
  await page.getByRole('button', { name: 'Front view', exact: true }).click();
  await page.locator('#section').uncheck();
  await page.locator('#explode').fill('0');
  await page.getByRole('button', { name: 'Solid', exact: true }).click();
  await page.getByRole('button', { name: 'Isometric view', exact: true }).click();
  await page.locator('#nose-mode').selectOption('hollow');
  await page.locator('#wall').fill('2.4');
  await page.locator('#wall').dispatchEvent('change');
  await page.getByRole('button', { name: 'Create in FreeCAD' }).click();
  await expect(page.locator('#python-code')).toHaveValue(/^exec\(/);
  const pythonDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Python', exact: true }).click();
  const py = await pythonDownload;
  await py.saveAs(testInfo.outputPath('generated_freecad.py'));
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  const stepDownload = page.waitForEvent('download', { timeout: 120000 });
  await page.getByRole('button', { name: 'Download STEP assembly' }).click();
  const step = await stepDownload;
  await step.saveAs(testInfo.outputPath('assembly.step'));
  const stepText = await fs.readFile(await step.path(), 'utf8');
  expect(stepText).toContain('ISO-10303-21');
  expect(stepText).toContain('NEXT_ASSEMBLY_USAGE_OCCURRENCE');
  expect(stepText).toContain('Ogive nose cone');
  expect(stepText).toContain('Sustainer');
  expect(stepText).toContain('MANIFOLD_SOLID_BREP');
  const stlDownload = page.waitForEvent('download', { timeout: 120000 });
  await page.getByRole('button', { name: 'Download nose cone STL' }).click();
  const stl = await stlDownload;
  await stl.saveAs(testInfo.outputPath('nose.stl'));
  expect((await fs.stat(await stl.path())).size).toBeGreaterThan(10000);
  await expect(page.locator('#toast')).toContainText('1 validated solid');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(errors).toEqual([]);
});

test('invalid input is reported and the loaded design is retained', async ({ page }) => {
  await page.goto('/');
  await page.locator('#file-input').setInputFiles('public/aster-01.ork');
  await expect(page.locator('#model-name')).toHaveText('Aster 01');
  await page
    .locator('#file-input')
    .setInputFiles({ name: 'bad.ork', mimeType: 'text/xml', buffer: Buffer.from('<invalid/>') });
  await expect(page.locator('#toast')).toContainText('not a valid OpenRocket');
  await expect(page.locator('#model-name')).toHaveText('Aster 01');
});

test('heavy-lift demonstrator preserves its nested booster and engine structure', async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1600, height: 1050 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Load heavy-lift demonstrator', exact: true }).click();
  await expect(page.locator('#model-name')).toHaveText('TRIAD Heavy / H9');
  await expect(page.locator('#stat-parts')).toHaveText('139');
  await expect(page.locator('#report-summary')).toContainText('No import warnings');
  await page.getByRole('button', { name: 'Expand 04 / Center core airframe', exact: true }).click();
  await page.getByRole('button', { name: 'Expand 06 / Side boosters', exact: true }).click();
  await expect(page.getByRole('button', { name: '06 / Side boosters 1', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '06 / Side boosters 2', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hide 06 / Side boosters', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Show 06 / Side boosters', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show 06 / Side boosters', exact: true }).click();
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await page.screenshot({ path: testInfo.outputPath('heavy-desktop.png') });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download STEP assembly' }).click();
  const step = await downloadPromise;
  await step.saveAs(testInfo.outputPath('heavy.step'));
  const source = await fs.readFile(await step.path(), 'utf8');
  expect(source).toContain('06 / Side boosters 1');
  expect(source).toContain('automotive_design');
  expect(source).toContain('06 / Side boosters 2');
  expect((source.match(/MANIFOLD_SOLID_BREP/g) || []).length).toBe(139);
  await page.getByRole('button', { name: 'X-ray', exact: true }).click();
  const rect = await page.locator('#viewer canvas').boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2 + 60, rect.y + rect.height / 2 + 15, { steps: 8 });
  await page.mouse.up();
  await page.screenshot({ path: testInfo.outputPath('heavy-xray.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#export-step')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(errors).toEqual([]);
});

test('a delayed demonstrator cannot replace a more recently opened file', async ({ page }) => {
  let release, started, finished;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const requested = new Promise((resolve) => {
    started = resolve;
  });
  const completed = new Promise((resolve) => {
    finished = resolve;
  });
  await page.route('**/triad-heavy.ork', async (route) => {
    started();
    await gate;
    try {
      await route.fulfill({ body: await fs.readFile('public/triad-heavy.ork') });
    } finally {
      finished();
    }
  });
  await page.goto('/');
  await page.locator('#load-demo').click();
  await requested;
  await page.locator('#file-input').setInputFiles('public/aster-01.ork');
  await expect(page.locator('#model-name')).toHaveText('Aster 01');
  release();
  await completed;
  await expect(page.locator('#model-name')).toHaveText('Aster 01');
  await expect(page.locator('#stat-parts')).toHaveText('11');
});

test('invalid construction settings retain the model and restore the last valid settings', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#file-input').setInputFiles('public/aster-01.ork');
  await page.locator('#nose-mode').selectOption('hollow');
  await page.locator('#wall').fill('50');
  await page.locator('#wall').dispatchEvent('change');
  await expect(page.locator('#toast')).toContainText('thinner than the base radius');
  await expect(page.locator('#wall')).toHaveValue('2');
  await expect(page.locator('#model-name')).toHaveText('Aster 01');
  await expect(page.locator('#export-step')).toBeEnabled();
});

test('a worker startup failure restores export controls and permits a successful retry', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    let failed = false;
    window.Worker = function (url, options) {
      if (!failed && String(url).includes('cad.worker')) {
        failed = true;
        throw new Error('Simulated worker startup failure');
      }
      return new NativeWorker(url, options);
    };
  });
  await page.goto('/');
  await page.locator('#file-input').setInputFiles('public/aster-01.ork');
  await page.locator('#export-step').click();
  await expect(page.locator('#toast')).toContainText('Simulated worker startup failure');
  await expect(page.locator('#export-step')).toBeEnabled();
  const downloaded = page.waitForEvent('download');
  await page.locator('#export-step').click();
  const step = await downloaded;
  expect(await fs.readFile(await step.path(), 'utf8')).toContain('MANIFOLD_SOLID_BREP');
  await expect(page.locator('#export-step')).toBeEnabled();
});
