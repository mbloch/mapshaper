import { expect, test } from '@playwright/test';
import { openLayersPanel } from './sidebar-helpers.mjs';

// A DEM: one float band, 326 x 279 pixels
var FIXTURE = 'test/data/geotiff/sedona-elev.tif';
var LAYER = 'sedona-elev';

test('the hillshade panel previews a hillshade on a DEM and applies -hillshade, as one undo state and one command', async function({page}) {
  var errors = collectPageErrors(page);
  var panel = page.locator('.raster-hillshade-panel:visible');
  var plain, shaded, opaque;
  await loadFixture(page);
  await page.evaluate(function() {
    window.mapshaper.undoTest.clearUndoHistory();
  });
  plain = await readMapColors(page);

  await openLayersPanel(page);
  await openLayerMenu(page, LAYER);
  await page.locator('.contextmenu-item').filter({hasText: /^hillshade$/}).click();
  await expect(panel).toBeVisible();
  expect(await getMode(page)).toBe('hillshade');
  shaded = await waitForNewColors(page, plain);

  await panel.getByLabel('Azimuth').fill('200');
  await expect(panel.locator('.raster-tone-slider-value').filter({hasText: '200°'})).toHaveCount(1);
  opaque = await waitForNewColors(page, shaded);
  // nothing has changed but the map
  expect(await getHillshadeCommands(page)).toEqual([]);
  expect(await canUndo(page)).toBe(false);

  await panel.getByRole('button', {name: 'Apply'}).click();
  await expect(panel).toBeHidden();
  expect(await getMode(page)).toBe('off');
  await expect.poll(function() { return getHillshadeCommands(page); })
    .toEqual(['-hillshade opaque azimuth=200 +']);
  // the preview was the same image as the command makes
  await expect.poll(function() {
    return readMapColors(page).then(function(colors) { return colors.join(); });
  }).toBe(opaque.join());
  expect((await getLayerNames(page)).length).toBe(2);

  await undo(page);
  expect(await canUndo(page)).toBe(false);
  await expect.poll(function() { return getLayerNames(page); }).toEqual([LAYER]);
  expect(errors).toEqual([]);
});

async function waitForNewColors(page, prev) {
  await expect.poll(function() {
    return readMapColors(page).then(function(colors) { return colors.join() != prev.join(); });
  }).toBe(true);
  return readMapColors(page);
}

async function openLayerMenu(page, name) {
  var row = page.locator('.layer-list .layer-item').filter({hasText: name}).first();
  await row.hover();
  await row.locator('.more-btn').click();
}

async function getLayerNames(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getState().model.datasets.flatMap(function(dataset) {
      return dataset.layers.map(function(o) { return o.name; });
    });
  });
}

async function getMode(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getInteractionMode();
  });
}

async function getHillshadeCommands(page) {
  var cmds = await page.evaluate(function() {
    return window.mapshaper.undoTest.getSessionHistory().commands;
  });
  return cmds.filter(function(cmd) { return /^-hillshade/.test(cmd); });
}

async function canUndo(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getState().undo.canUndo;
  });
}

async function undo(page) {
  await page.evaluate(function() {
    return window.mapshaper.undoTest.undo();
  });
  await page.waitForTimeout(300);
}

async function loadFixture(page) {
  await page.goto('/?undo=on&undo-test=on&files=' + encodeURIComponent(FIXTURE));
  await page.waitForFunction(function() {
    return window.mapshaper && window.mapshaper.undoTest &&
      window.mapshaper.undoTest.getState().model.datasetCount > 0;
  });
  await expect.poll(function() {
    return readMapColors(page).then(function(colors) { return colors.length; });
  }).toBeGreaterThan(0);
}

// The colors of the map's middle row of pixels, in order, apart from the
// background (a hillshade at another azimuth can have the same set of grays)
function readMapColors(page) {
  return page.evaluate(function() {
    var canvas = document.querySelector('.map-layers canvas');
    var y = Math.round(canvas.height / 2);
    var data = canvas.getContext('2d').getImageData(0, y, canvas.width, 1).data;
    var colors = [];
    for (var i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      colors.push([0, 1, 2].map(function(band) { return data[i + band]; }).join('.'));
    }
    return colors;
  });
}

function collectPageErrors(page) {
  var errors = [];
  page.on('pageerror', function(err) {
    errors.push(String(err.message || err));
  });
  return errors;
}
