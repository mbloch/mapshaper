import { expect, test } from '@playwright/test';
import AdmZip from 'adm-zip';
import fs from 'fs';
import { closeSidebarAfterImport, openLayersPanel } from './sidebar-helpers.mjs';

// f2 (100px wide) is overlaid on f1 (400px wide), in f1's bottom-right corner
var SETUP = '-rectangle bbox=0,0,1,1 name=r1 -rectangle bbox=0,0,2,2 name=r2 ' +
  '-rectangle bbox=0,0,4,4 name=r4 ' +
  '-frame target=r1 width=400 name=f1 -frame target=r4 width=100 name=f2';

test.describe('overlay frames', function() {
  test.beforeEach(async function({page}) {
    // importing a file closes the import dialog, which would catch the mouse
    await page.goto('/?undo=on&undo-test=on&files=' +
      encodeURIComponent('test/data/geojson/three_points.geojson'));
    await page.waitForFunction(function() {
      return window.mapshaper && window.mapshaper.undoTest &&
        window.mapshaper.undoTest.getState().model.datasetCount > 0;
    });
    await closeSidebarAfterImport(page);
  });

  test('an overlay is shown as a box on its host\'s page', async function({page}) {
    await showHost(page, SETUP + ' -frame target=f1 overlay=f2');
    var box = page.locator('.frame-overlay-box');
    await expect(box).toHaveCount(1);
    await expect(box).toHaveAttribute('data-overlay', 'f2');
    await expect(box).not.toContainText('f2');
    await expect(box.locator('.frame-overlay-preview-toggle')).toHaveText('show');
    await expect(page.locator('.frame-overlay-preview')).toHaveCount(0);
    var page1 = await page.locator('.preview-page-border').boundingBox();
    var b = await box.boundingBox();
    // a quarter of the page's width, 10px (scaled) from the right and bottom
    var k = page1.width / 400;
    expect(Math.abs(b.width - 100 * k)).toBeLessThan(1.5);
    expect(Math.abs(page1.x + page1.width - (b.x + b.width) - 10 * k)).toBeLessThan(1.5);
    expect(Math.abs(page1.y + page1.height - (b.y + b.height) - 10 * k)).toBeLessThan(1.5);
  });

  test('dragging a box saves the nearest corner and margins in one command; undo restores',
      async function({page}) {
    await showHost(page, SETUP + ' -frame target=f1 overlay=f2');
    var box = page.locator('.frame-overlay-box');
    var pageBeforePan = await page.locator('.preview-page-border').boundingBox();
    var boxBeforePan = await box.boundingBox();
    await page.mouse.move(boxBeforePan.x + 10, boxBeforePan.y + 10);
    await page.mouse.down();
    await page.mouse.move(boxBeforePan.x + 30, boxBeforePan.y + 25, {steps: 4});
    await page.mouse.up();
    var pageAfterPan = await page.locator('.preview-page-border').boundingBox();
    var boxAfterPan = await box.boundingBox();
    expect(Math.abs(pageAfterPan.x - pageBeforePan.x)).toBeGreaterThan(5);
    expect(Math.abs(pageAfterPan.y - pageBeforePan.y)).toBeGreaterThan(5);
    expect(boxAfterPan.x - boxBeforePan.x).toBeCloseTo(pageAfterPan.x - pageBeforePan.x, 0);
    expect(boxAfterPan.y - boxBeforePan.y).toBeCloseTo(pageAfterPan.y - pageBeforePan.y, 0);
    expect((await getPlacement(page)).position).toBe('bottom-right');
    await box.click();
    await expect(page.locator('.overlay-toolbar')).toBeVisible();
    await page.locator('.frame-overlay-preview-toggle').click();
    var preview = page.locator('.frame-overlay-preview');
    await expect(preview).toHaveCount(1);
    await expect(preview.locator('path')).not.toHaveCount(0);
    var before = await getSignature(page);
    var page1 = await page.locator('.preview-page-border').boundingBox();
    var b = await box.boundingBox();
    var previewBefore = await preview.boundingBox();
    expect(Math.abs(previewBefore.x - b.x)).toBeLessThan(1.5);
    expect(Math.abs(previewBefore.y - b.y)).toBeLessThan(1.5);
    var k = page1.width / 400;
    // to 20,30 page pixels from the top-left corner
    var dx = page1.x + 20 * k - b.x;
    var dy = page1.y + 30 * k - b.y;
    await page.mouse.move(b.x + 10, b.y + 10);
    await page.mouse.down();
    await page.mouse.move(b.x + 10 + dx / 2, b.y + 10 + dy / 2, {steps: 4});
    await page.mouse.move(b.x + 10 + dx, b.y + 10 + dy, {steps: 4});
    await page.mouse.up();
    await expect.poll(async function() {
      return (await getSessionCommands(page)).pop();
    }).toMatch(/^-frame target=f1 overlay=f2 overlay-position=top-left overlay-margin=/);
    var rec = await getPlacement(page);
    expect(rec.position).toBe('top-left');
    expect(rec.margin_x).toBeCloseTo(20, -0.5);
    expect(rec.margin_y).toBeCloseTo(30, -0.5);
    var previewAfter = await preview.boundingBox();
    expect(Math.abs(previewAfter.x - (b.x + dx))).toBeLessThan(1.5);
    expect(Math.abs(previewAfter.y - (b.y + dy))).toBeLessThan(1.5);
    await page.locator('.frame-overlay-preview-toggle').click();
    await expect(preview).toHaveCount(0);
    await page.evaluate(function() { return window.mapshaper.undoTest.undo(); });
    await expect.poll(function() { return getSignature(page); }).toBe(before);
    expect((await getPlacement(page)).position).toBe('bottom-right');
    await page.locator('.overlay-toolbar').getByText('Done').click();
    var pageBeforeZoom = await page.locator('.preview-page-border').boundingBox();
    var boxBeforeZoom = await box.boundingBox();
    await page.mouse.move(boxBeforeZoom.x + 10, boxBeforeZoom.y + 10);
    await page.mouse.wheel(0, -100);
    await expect.poll(async function() {
      return (await page.locator('.preview-page-border').boundingBox()).width;
    }).not.toBeCloseTo(pageBeforeZoom.width, 0);
  });

  test('clicking a box opens its placement as numbers', async function({page}) {
    await showHost(page, SETUP + ' -frame target=f1 overlay=f2');
    await page.locator('.frame-overlay-box').click();
    var toolbar = page.locator('.overlay-toolbar');
    var corner = function(name) {
      return toolbar.locator('.overlay-corner-control [data-tooltip="' + name + ' corner"]');
    };
    var margin = toolbar.locator('.overlay-toolbar-margin-input');
    await expect(toolbar).toBeVisible();
    await expect(toolbar.locator('.overlay-frame-name')).toHaveText('f2');
    await expect(page.locator('.frame-overlay-box')).toHaveClass(/selected/);
    await expect(corner('Bottom right')).toHaveClass(/selected/);
    await expect(margin).toHaveValue('10');
    await corner('Top right').click();
    await expect.poll(async function() {
      return (await getSessionCommands(page)).pop();
    }).toBe('-frame target=f1 overlay=f2 overlay-position=top-right overlay-margin=10,10');
    await margin.fill('10,25');
    await margin.press('Enter');
    await expect.poll(async function() {
      return (await getPlacement(page)).margin_y;
    }).toBe(25);
    await expect(margin).toHaveValue('10,25');
    await toolbar.getByText('Remove').click();
    await expect.poll(function() { return getPlacement(page); }).toBe(null);
    await expect(page.locator('.frame-overlay-box')).toHaveCount(0);
    await expect(toolbar).toBeHidden();
  });

  test('a frame\'s menu overlays it on another frame', async function({page}) {
    await showHost(page, SETUP);
    await openLayersPanel(page);
    var heading = page.locator('.frame-section .frame-item').filter({hasText: 'f2'});
    await heading.hover();
    await heading.locator('.more-btn').click();
    await page.locator('.contextmenu-item').filter({hasText: 'overlay on frame: f1'}).click();
    await expect.poll(async function() {
      return (await getSessionCommands(page)).pop();
    }).toBe('-frame target=f1 overlay=f2');
    await heading.hover();
    await heading.locator('.more-btn').click();
    await expect(page.locator('.contextmenu-item').filter({hasText: 'remove overlay from: f1'}))
      .toBeVisible();
  });

  test('boxes follow their corner while the host is resized', async function({page}) {
    await showHost(page, SETUP + ' -frame target=f1 overlay=f2');
    var box = page.locator('.frame-overlay-box');
    var b1 = await box.boundingBox();
    await page.evaluate(function() { window.mapshaper.undoTest.setInteractionMode('frame'); });
    var handle = page.locator('.frame-edit-box .handle').nth(7); // right edge, middle
    var h = await handle.boundingBox();
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(h.x + h.width / 2 + 60, h.y + h.height / 2, {steps: 6});
    var b2 = await box.boundingBox();
    expect(b2.x - b1.x).toBeGreaterThan(40);
    await page.mouse.up();
  });
});

test.describe('export with overlay frames', function() {
  test.beforeEach(async function({page}) {
    // the Export button is shown once a file has been imported
    await page.goto('/?undo=on&undo-test=on&files=' +
      encodeURIComponent('test/data/geojson/three_points.geojson'));
    await page.waitForFunction(function() {
      return window.mapshaper && window.mapshaper.undoTest &&
        window.mapshaper.undoTest.getState().model.datasetCount > 0;
    });
    await runCommand(page, SETUP + ' -frame target=f1 overlay=f2', null);
    await page.locator('.export-btn').click();
    await expect(page.locator('.export-options')).toBeVisible();
  });

  test('overlay frames start unchecked, and the host\'s map draws them', async function({page}) {
    await expect(page.locator('.export-frame-row').filter({hasText: 'f2'}).locator('input'))
      .not.toBeChecked();
    await expect(page.locator('.export-frame-row').filter({hasText: 'f1'}).locator('input'))
      .toBeChecked();
    var downloadPromise = page.waitForEvent('download');
    await page.locator('.export-options #export-btn').click();
    var download = await downloadPromise;
    var path = await download.path();
    var svg = download.suggestedFilename().endsWith('.zip') ?
      new AdmZip(path).readAsText('f1.svg') : fs.readFileSync(path, 'utf8');
    expect(svg).toMatch(/<svg id="f2" x="290" y="290" width="100" height="100"/);
    expect(svg).toContain('id="f2-r4"');
  });
});

async function showHost(page, setup) {
  await runCommand(page, setup, null);
  await page.evaluate(function() {
    window.mapshaper.undoTest.selectLayer('r1');
    window.mapshaper.undoTest.setPreviewMode(true);
  });
  await waitForDraw(page);
}

async function getPlacement(page) {
  return page.evaluate(function() {
    var api = window.mapshaper.undoTest;
    return api.getOverlayPlacement('f1', 'f2');
  });
}

async function waitForDraw(page) {
  await page.evaluate(function() {
    return new Promise(function(resolve) {
      requestAnimationFrame(function() { requestAnimationFrame(resolve); });
    });
  });
}

async function getSessionCommands(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getSessionHistory().commands;
  });
}

async function runCommand(page, command, signatureBefore) {
  await page.evaluate(function(str) {
    return window.mapshaper.undoTest.runCommand(str);
  }, command);
  await expect.poll(function() {
    return getSignature(page);
  }).not.toBe(signatureBefore);
}

async function getSignature(page) {
  return page.evaluate(function() {
    var model = window.mapshaper.undoTest.getState().model;
    if (model.datasetCount === 0) return null;
    return model.checksum + ' ' + model.datasets.map(function(d) {
      return d.layers.map(function(lyr) { return lyr.name + ':' + lyr.menu_order; }).join(',');
    }).join('|');
  });
}
