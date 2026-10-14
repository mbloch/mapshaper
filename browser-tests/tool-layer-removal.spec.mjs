import { expect, test } from '@playwright/test';
import { openLayersPanel } from './sidebar-helpers.mjs';

// The label and symbol tools make the layer they need when they open. When
// that layer goes away -- undone, or deleted from the layer menu -- the tool
// closes, rather than staying open with nowhere to put anything.

test('undoing the symbol tool back past its layer closes the tool', async function({page}) {
  var errors = collectPageErrors(page);
  await openSession(page);
  await setMode(page, 'symbols');
  await clickMap(page, 0.3, 0.5);
  expect((await getLayer(page, 'symbols')).shapeCount).toBe(1);

  // taking back the symbol leaves the layer, and the tool
  await undo(page);
  expect((await getLayer(page, 'symbols')).shapeCount).toBe(0);
  expect(await getMode(page)).toBe('symbols');

  await undo(page);
  expect(await getLayer(page, 'symbols')).toBe(null);
  expect(await getMode(page)).toBe('off');
  expect(await page.locator('.floating-toolbar.symbol-toolbar').isVisible()).toBe(false);
  expect(await page.locator('.symbol-style-panel').isVisible()).toBe(false);
  expect(errors).toEqual([]);
});

test('undoing the label tool back past its layer closes the tool', async function({page}) {
  var errors = collectPageErrors(page);
  await openSession(page);
  await setMode(page, 'label');
  expect(await getLayer(page, 'labels')).not.toBe(null);
  expect(await getMode(page)).toBe('label');

  await undo(page);
  expect(await getLayer(page, 'labels')).toBe(null);
  expect(await getMode(page)).toBe('off');
  expect(errors).toEqual([]);
});

test("deleting the symbol tool's layer from the layer menu closes the tool", async function({page}) {
  var errors = collectPageErrors(page);
  await openSession(page);
  await setMode(page, 'symbols');
  await clickMap(page, 0.3, 0.5);
  await openLayersPanel(page);
  await deleteFirstLayer(page);
  await page.waitForTimeout(200);
  expect(await getLayer(page, 'symbols')).toBe(null);
  expect(await getMode(page)).toBe('off');
  expect(await page.locator('.floating-toolbar.symbol-toolbar').isVisible()).toBe(false);
  expect(errors).toEqual([]);
});

test("deleting the label tool's layer closes it, though it was there before the tool", async function({page}) {
  var errors = collectPageErrors(page);
  await openSession(page);
  await runCommand(page, '-labels coordinates=0,0 text=Paris name=places no-replace');
  await setMode(page, 'label');
  expect(await getMode(page)).toBe('label');
  await openLayersPanel(page);
  await deleteFirstLayer(page);
  await page.waitForTimeout(200);
  expect(await getLayer(page, 'places')).toBe(null);
  expect(await getMode(page)).toBe('off');
  expect(errors).toEqual([]);
});

function collectPageErrors(page) {
  var errors = [];
  page.on('pageerror', function(err) {
    errors.push(String(err.message || err));
  });
  return errors;
}

async function openSession(page) {
  await page.goto('/?undo=on&undo-test=on');
  await page.waitForFunction(function() {
    return window.mapshaper && window.mapshaper.undoTest;
  });
  await page.locator('#import-options .cancel-btn').click();
  await page.waitForTimeout(150);
}

async function setMode(page, mode) {
  await page.evaluate(function(m) {
    window.mapshaper.undoTest.setInteractionMode(m);
  }, mode);
  await page.waitForTimeout(200);
}

async function getMode(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getInteractionMode();
  });
}

async function getLayer(page, name) {
  return page.evaluate(function(n) {
    return window.mapshaper.undoTest.getLayerInfo(n);
  }, name);
}

async function clickMap(page, fx, fy) {
  var box = await page.locator('.mshp-main-map').boundingBox();
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await page.waitForTimeout(200);
}

async function undo(page) {
  await page.evaluate(function() { return window.mapshaper.undoTest.undo(); });
  await page.waitForTimeout(250);
}

async function runCommand(page, cmd) {
  await page.evaluate(function(str) {
    return window.mapshaper.undoTest.runCommand(str);
  }, cmd);
  await page.waitForTimeout(200);
}

async function deleteFirstLayer(page) {
  var layerItem = page.locator('.layer-list .layer-item').first();
  await layerItem.hover();
  await layerItem.locator('.more-btn').click();
  await page.locator('.contextmenu-item').filter({hasText: 'delete layer'}).click();
}
