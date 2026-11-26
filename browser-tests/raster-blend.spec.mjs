import { expect, test } from '@playwright/test';
import { openLayersPanel } from './sidebar-helpers.mjs';

// A DEM: one float band, 326 x 279 pixels
var FIXTURE = 'test/data/geotiff/sedona-elev.tif';
var LAYER = 'sedona-elev';

test('the blend panel previews a hillshade on a raster and applies -blend, as one undo state and one command', async function({page}) {
  var errors = collectPageErrors(page);
  var panel = page.locator('.raster-blend-panel:visible');
  var plain, blended, stronger;
  await loadFixture(page);
  await runCommand(page, '-hillshade target=' + LAYER + ' name=relief +');
  await selectLayer(page, LAYER);
  // a DEM displayed in gray is data, not something to blend into
  await openLayersPanel(page);
  await openLayerMenu(page, LAYER);
  await expect(page.locator('.contextmenu-item').filter({hasText: 'color palette'})).toHaveCount(1);
  await expect(page.locator('.contextmenu-item').filter({hasText: 'blend hillshade'})).toHaveCount(0);
  await page.keyboard.press('Escape');
  // with a palette, it's a hypsometric tint
  await runCommand(page, '-classify band1 colors=Greens classes=5 target=' + LAYER);
  await selectLayer(page, LAYER);
  await expect.poll(function() { return getActiveLayerName(page); }).toBe(LAYER);
  await page.evaluate(function() {
    window.mapshaper.undoTest.clearUndoHistory();
  });
  plain = await readMapColors(page);

  // opened from the layer menu, which offers it on the tinted DEM but not on
  // the hillshade
  await openLayersPanel(page);
  await openLayerMenu(page, 'relief');
  await expect(page.locator('.contextmenu-item').filter({hasText: 'blend hillshade'})).toHaveCount(0);
  await page.keyboard.press('Escape'); // closes the menu, and the layers panel
  await openLayersPanel(page);
  await openLayerMenu(page, LAYER);
  await page.locator('.contextmenu-item').filter({hasText: 'blend hillshade'}).click();
  await expect(panel).toBeVisible();
  expect(await getMode(page)).toBe('blend');
  await expect(panel.getByLabel('Hillshade layer').locator('option:checked')).toHaveText('relief');
  await expect.poll(function() {
    return readMapColors(page).then(function(colors) { return colors.join() != plain.join(); });
  }).toBe(true);
  blended = await readMapColors(page);

  await panel.getByLabel('Shadows strength').fill('2');
  await expect.poll(function() {
    return readMapColors(page).then(function(colors) { return colors.join() != blended.join(); });
  }).toBe(true);
  stronger = await readMapColors(page);

  await expect(panel.getByLabel('Shadows color')).toHaveValue('#000000');
  await panel.getByLabel('Shadows color').fill('#2a2550');
  await panel.getByLabel('Shadows color').press('Enter');
  await expect.poll(function() {
    return readMapColors(page).then(function(colors) { return colors.join() != stronger.join(); });
  }).toBe(true);
  stronger = await readMapColors(page);

  await panel.getByRole('button', {name: 'Apply'}).click();
  await expect(panel).toBeHidden();
  expect(await getMode(page)).toBe('off');
  await expect.poll(function() { return layerExists(page, 'relief'); }).toBe(false);
  var blendCommands = (await getSessionCommands(page)).filter(function(cmd) {
    return /^-blend/.test(cmd);
  });
  expect(blendCommands).toEqual(['-blend source=relief strength=2,1 shadow-color=#2a2550']);
  await expect.poll(function() {
    return readMapColors(page).then(function(colors) { return colors.join(); });
  }).toBe(stronger.join());

  await undo(page);
  expect(await layerExists(page, 'relief')).toBe(true);

  // the hillshade can be kept
  await page.evaluate(function() {
    window.mapshaper.undoTest.setInteractionMode('blend');
  });
  await panel.getByLabel('Keep hillshade').check();
  await panel.getByRole('button', {name: 'Apply'}).click();
  await expect.poll(function() {
    return getSessionCommands(page).then(function(cmds) { return cmds[cmds.length - 1]; });
  }).toBe('-blend source=relief keep-source');
  expect(await layerExists(page, 'relief')).toBe(true);
  expect(errors).toEqual([]);
});

test('the blend panel blends a hillshade with a polygon layer, as an overlay or an image', async function({page}) {
  var errors = collectPageErrors(page);
  var panel = page.locator('.raster-blend-panel:visible');
  var plain;
  await loadFixture(page);
  await runCommand(page, '-hillshade target=' + LAYER + ' name=relief +');
  await runCommand(page, '-rectangle source=relief name=cells');
  await runCommand(page, '-each \'fill = "#b5d29b"\' target=cells');
  await selectLayer(page, 'cells');
  await expect.poll(function() { return getActiveLayerName(page); }).toBe('cells');
  await page.evaluate(function() {
    window.mapshaper.undoTest.clearUndoHistory();
  });
  plain = await readMapColors(page);

  await openLayersPanel(page);
  await openLayerMenu(page, 'cells');
  await page.locator('.contextmenu-item').filter({hasText: 'blend hillshade'}).click();
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', {name: 'Overlay'})).toHaveClass(/selected/);
  // the polygons are drawn for the preview, which then replaces the hillshade
  await expect.poll(function() {
    return readMapColors(page).then(function(colors) { return colors.join() != plain.join(); });
  }).toBe(true);

  // an overlay keeps the polygons, and takes the hillshade's place
  await panel.getByRole('button', {name: 'Apply'}).click();
  await expect(panel).toBeHidden();
  await expect.poll(function() {
    return getSessionCommands(page).then(function(cmds) { return cmds[cmds.length - 1]; });
  }).toBe('-blend source=relief overlay');
  expect(await layerExists(page, 'cells')).toBe(true);
  expect(await layerExists(page, 'relief')).toBe(true);
  await undo(page);
  expect(await getSessionCommands(page)).not.toContain('-blend source=relief overlay');

  // an image, named after the polygons, replaces them and the hillshade
  await page.evaluate(function() {
    window.mapshaper.undoTest.setInteractionMode('blend');
  });
  await panel.getByRole('button', {name: 'Image'}).click();
  await panel.getByRole('button', {name: 'Apply'}).click();
  await expect.poll(function() {
    return getSessionCommands(page).then(function(cmds) { return cmds[cmds.length - 1]; });
  }).toBe('-blend source=relief');
  expect(await getGeometryType(page, 'cells')).toBe(null);
  expect(await layerExists(page, 'relief')).toBe(false);
  await undo(page);
  expect(await getGeometryType(page, 'cells')).toBe('polygon');
  expect(await layerExists(page, 'relief')).toBe(true);
  expect(errors).toEqual([]);
});

async function getGeometryType(page, name) {
  return page.evaluate(function(name) {
    return window.mapshaper.undoTest.getLayerInfo(name).geometry_type;
  }, name);
}

async function openLayerMenu(page, name) {
  var row = page.locator('.layer-list .layer-item').filter({hasText: name}).first();
  await row.hover();
  await row.locator('.more-btn').click();
}

async function runCommand(page, cmd) {
  await page.evaluate(function(str) {
    return window.mapshaper.undoTest.runCommand(str);
  }, cmd);
  await page.waitForTimeout(300);
}

async function selectLayer(page, name) {
  await page.evaluate(function(name) {
    window.mapshaper.undoTest.selectLayer(name);
  }, name);
  await page.waitForTimeout(300);
}

async function getActiveLayerName(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getState().model.activeLayer;
  });
}

async function layerExists(page, name) {
  return page.evaluate(function(name) {
    return !!window.mapshaper.undoTest.getLayerInfo(name);
  }, name);
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
    return Object.keys(colors).sort();
  });
}

function collectPageErrors(page) {
  var errors = [];
  page.on('pageerror', function(err) {
    errors.push(String(err.message || err));
  });
  return errors;
}
