import { expect, test } from '@playwright/test';
import { openLayersPanel } from './sidebar-helpers.mjs';

var POINT_FIXTURE = 'test/data/geojson/three_points.geojson';
var TABLE_FIXTURE = 'test/data/features/join/key_target.csv';

test('frame button opens frame creation when no frame exists', async function({page}) {
  await loadFixture(page, POINT_FIXTURE);

  await expect(page.locator('.preview-toggle')).not.toHaveClass(/disabled/);
  await expect(page.locator('.frame-tool-toggle')).toHaveCount(0);
  expect(await page.locator('.nav-buttons > .nav-btn:last-child')
    .evaluate(function(el) {
      return el.classList.contains('preview-toggle');
    })).toBe(true);
  await expect(page.locator('.preview-readout')).toBeHidden();
  await expect(page.locator('.preview-overlay')).toBeHidden();
  expect(await getSymbolScale(page)).toBe(1);
  await page.locator('.preview-toggle').click();
  await expect(page.locator('.frame-create-popup')).toBeVisible();
});

test('table view suspends preview without clearing its state', async function({page}) {
  await loadPreviewSession(page, POINT_FIXTURE + ',' + TABLE_FIXTURE);
  await selectLayer(page, 'three_points');
  await setPreviewMode(page, true);
  await expect(page.locator('.preview-overlay')).toBeVisible();

  await selectLayer(page, 'key_target');
  await expect(page.locator('.preview-overlay')).toBeHidden();
  await expect(page.locator('.preview-readout')).toBeHidden();
  expect(await getPreviewMode(page)).toBe(true);
  expect(await getSymbolScale(page)).toBe(1);

  await selectLayer(page, 'three_points');
  await expect(page.locator('.preview-overlay')).toBeVisible();
  await expect(page.locator('.preview-readout')).toBeVisible();
  expect(await getPreviewMode(page)).toBe(true);
});

test('the map frame row has frame-specific menu actions', async function({page}) {
  await loadPreviewSession(page);
  await openLayersPanel(page);
  await page.locator('.map-frame-list .more-btn').click();

  await expect(page.locator('.contextmenu')).toBeVisible();
  expect(await page.locator('.contextmenu-item').allInnerTexts()).toEqual([
    'frame properties',
    'add scale bar',
    'resize frame',
    'delete frame',
  ]);

  await page.locator('.contextmenu-item').filter({hasText: 'frame properties'}).click();
  await expect(page.locator('.frame-properties-popup')).toBeVisible();
  await expect(page.locator('.frame-width-input')).toHaveValue('600');
  await page.locator('.alert-wrapper .close2-btn').click();

  await page.locator('.map-frame-list .more-btn').click();
  await page.locator('.contextmenu-item').filter({hasText: 'resize frame'}).click();
  expect(await page.evaluate(function() {
    return window.mapshaper.undoTest.getInteractionMode();
  })).toBe('frame');
  await expect(page.locator('.frame-toolbar')).toBeVisible();
  await expect(page.locator('.frame-toolbar')).toContainText(
    'Fix scaleFix outputRatioFitMarginDone'
  );
  await page.locator('.frame-toolbar .text-btn').filter({hasText: 'Done'}).click();
  expect(await page.evaluate(function() {
    return window.mapshaper.undoTest.getInteractionMode();
  })).toBe('off');
});

async function loadPreviewSession(page, files) {
  await loadFixture(page, files || POINT_FIXTURE);
  await page.evaluate(function() {
    return window.mapshaper.undoTest.runCommand(
      '-frame bbox=-80,30,-70,40 width=600 name=frame'
    );
  });
  await expect.poll(async function() {
    return page.locator('.preview-toggle').evaluate(function(el) {
      return !el.classList.contains('disabled');
    });
  }).toBe(true);
}

async function loadFixture(page, files) {
  var url = '/?undo=on&undo-test=on&files=' + encodeURIComponent(files);
  await page.goto(url);
  await page.waitForFunction(function() {
    return window.mapshaper && window.mapshaper.undoTest;
  });
  await page.waitForFunction(function() {
    return window.mapshaper.undoTest.getState().model.datasetCount > 0;
  });
}

async function setPreviewMode(page, on) {
  await page.evaluate(function(value) {
    window.mapshaper.undoTest.setPreviewMode(value);
  }, on);
  await expect.poll(function() {
    return getPreviewMode(page);
  }).toBe(on);
}

async function getPreviewMode(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getPreviewMode();
  });
}

async function getSymbolScale(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getSymbolScale();
  });
}

async function selectLayer(page, name) {
  await page.evaluate(function(layerName) {
    window.mapshaper.undoTest.selectLayer(layerName);
  }, name);
}
