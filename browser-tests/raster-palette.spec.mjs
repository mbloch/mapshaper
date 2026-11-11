import { expect, test } from '@playwright/test';
import { openLayersPanel } from './sidebar-helpers.mjs';

// A DEM: one float band, 326 x 279 pixels
var FIXTURE = 'test/data/geotiff/sedona-elev.tif';
var LAYER = 'sedona-elev';

test('the color palettes panel colors a DEM, as one undo state and one command', async function({page}) {
  var errors = collectPageErrors(page);
  var panel = page.locator('.color-scheme-panel:visible');
  var applied, edited;
  await loadFixture(page);
  expect(await getPalette(page)).toBe(null);
  var grays = await readMapColors(page);
  expect(grays.every(isGray)).toBe(true);

  // opened from the layer menu
  await openLayersPanel(page);
  await page.locator('.layer-list .layer-item').first().hover();
  await page.locator('.layer-list .layer-item .more-btn').first().click();
  await page.locator('.contextmenu-item').filter({hasText: 'color palette'}).click();
  await expect(panel).toBeVisible();
  expect(await getMode(page)).toBe('palette');

  // a single band needs no band menu; a raster named as a DEM starts with
  // fixed elevations, without the sea
  await expect(panel.getByLabel('Band')).toBeHidden();
  await expect(panel.getByRole('tab', {name: 'Elevation'})).toHaveAttribute('aria-selected', 'true');
  await expect(panel.getByRole('button', {name: 'Sea palette'})).toContainText('Transparent');
  await expect.poll(function() { return getPalette(page).then(function(p) { return p && p.sea; }); }).toBe('transparent');

  // other ramps start with continuous colors
  await panel.getByRole('tab', {name: 'Sequential'}).click();
  await expect(panel.getByRole('button', {name: 'Sea palette'})).toBeHidden();
  await expect(panel.locator('.continuous-btn')).toHaveClass(/selected/);
  await expect(panel.locator('.color-scheme-null-count')).toHaveText('None in this layer');
  await expect.poll(function() { return getPalette(page).then(function(p) { return p && !p.sea; }); }).toBe(true);
  applied = await getPalette(page);
  expect(applied.continuous).toBe(true);
  expect(applied.band).toBe(1);
  await expect.poll(function() {
    return readMapColors(page).then(function(colors) { return colors.some(isColored); });
  }).toBe(true);

  // classes instead of continuous colors
  await panel.locator('.continuous-btn').click();
  await setField(panel.locator('.size-field-input'), '4');
  await expect.poll(function() {
    return getPalette(page).then(function(p) { return p && !p.continuous && p.breaks.length; });
  }).toBe(3);
  edited = await getPalette(page);

  await panel.locator('.label-style-close').click();
  await expect(panel).toBeHidden();
  expect(await getMode(page)).toBe('off');
  var classify = (await getSessionCommands(page)).filter(function(cmd) {
    return /^-classify/.test(cmd);
  });
  expect(classify.length).toBe(1);
  expect(classify[0]).toMatch(/band1/);

  await undo(page);
  expect(await getPalette(page)).toBe(null);
  await expect.poll(function() {
    return readMapColors(page).then(function(colors) { return colors.every(isGray); });
  }).toBe(true);
  await redo(page);
  expect(await getPalette(page)).toEqual(edited);
  expect(errors).toEqual([]);
});

test('undo while the panel is open takes back the palette and closes the panel', async function({page}) {
  var errors = collectPageErrors(page);
  var panel = page.locator('.color-scheme-panel:visible');
  await loadFixture(page);
  await page.evaluate(function() {
    window.mapshaper.undoTest.setInteractionMode('palette');
  });
  await expect(panel).toBeVisible();
  await expect.poll(function() { return getPalette(page); }).not.toBe(null);
  await undo(page);
  expect(await getPalette(page)).toBe(null);
  await expect(panel).toBeHidden();
  expect(await getMode(page)).toBe('off');
  expect(errors).toEqual([]);
});

function isGray(hex) {
  return hex.slice(1, 3) == hex.slice(3, 5) && hex.slice(3, 5) == hex.slice(5, 7);
}

function isColored(hex) {
  return !isGray(hex);
}

async function getPalette(page) {
  return page.evaluate(function(layer) {
    var info = window.mapshaper.undoTest.getLayerInfo(layer);
    return info ? info.rasterPalette : null;
  }, LAYER);
}

async function getMode(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getInteractionMode();
  });
}

async function getSessionCommands(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getSessionHistory().commands;
  });
}

async function undo(page) {
  await page.evaluate(function() {
    return window.mapshaper.undoTest.undo();
  });
  await page.waitForTimeout(300);
}

async function redo(page) {
  await page.evaluate(function() {
    return window.mapshaper.undoTest.redo();
  });
  await page.waitForTimeout(300);
}

async function setField(locator, value) {
  await locator.fill(value);
  await locator.press('Enter');
  await locator.page().waitForTimeout(300);
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
  await page.evaluate(function() {
    window.mapshaper.undoTest.clearUndoHistory();
  });
}

// The distinct colors of the map's middle row of pixels, apart from the
// background
function readMapColors(page) {
  return page.evaluate(function() {
    var canvas = document.querySelector('.map-layers canvas');
    var y = Math.round(canvas.height / 2);
    var data = canvas.getContext('2d').getImageData(0, y, canvas.width, 1).data;
    var colors = {};
    for (var i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      colors['#' + [0, 1, 2].map(function(band) {
        return ('0' + data[i + band].toString(16)).slice(-2);
      }).join('')] = true;
    }
    return Object.keys(colors);
  });
}

function collectPageErrors(page) {
  var errors = [];
  page.on('pageerror', function(err) {
    errors.push(String(err.message || err));
  });
  return errors;
}
