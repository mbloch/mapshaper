import { expect, test } from '@playwright/test';
import AdmZip from 'adm-zip';
import fs from 'fs';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

var SOURCE_FIXTURE = 'test/data/geojson/three_points.geojson';
var RASTER_FIXTURE = 'test/data/geotiff/wgs84-geographic-epsg4326.tif';

test('GUI exports GeoJSON file', async function({page}) {
  await loadFixture(page, SOURCE_FIXTURE);
  await openExportMenu(page);
  await selectExportFormat(page, 'geojson');
  await clearAdvancedOptions(page);
  var download = await triggerExportDownload(page);
  expect(download.suggestedFilename()).toMatch(/\.(geojson|json)$/i);
  var errors = await getExportErrors(page);
  expect(errors).toEqual([]);
});

test('GUI exports FlatGeobuf file', async function({page}) {
  await loadFixture(page, SOURCE_FIXTURE);
  await openExportMenu(page);
  await selectExportFormat(page, 'flatgeobuf');
  await clearAdvancedOptions(page);
  var download = await triggerExportDownload(page);
  expect(download.suggestedFilename()).toMatch(/\.fgb$/i);
  var errors = await getExportErrors(page);
  expect(errors).toEqual([]);
});

test('GUI exports GeoParquet with zstd option', async function({page}) {
  await loadFixture(page, SOURCE_FIXTURE);
  await openExportMenu(page);
  await selectExportFormat(page, 'geoparquet');
  await setAdvancedOptions(page, 'compression=zstd level=10');
  var download = await triggerExportDownload(page);
  expect(download.suggestedFilename()).toMatch(/\.parquet$/i);
  var errors = await getExportErrors(page);
  expect(errors).toEqual([]);
});

// GeoTIFF is offered only for raster layers, and its deflate compression takes
// a different code path in the browser than in Node.
test('GUI exports GeoTIFF file for a raster layer', async function({page}) {
  await loadFixture(page, RASTER_FIXTURE);
  await openExportMenu(page);
  await selectExportFormat(page, 'geotiff');
  await clearAdvancedOptions(page);
  var download = await triggerExportDownload(page);
  expect(download.suggestedFilename()).toMatch(/\.tif$/i);
  var errors = await getExportErrors(page);
  expect(errors).toEqual([]);
});

// HTML output is a fragment and an image, so it downloads as a zip. The image
// is drawn on a canvas by the browser, not by resvg as it is in Node.
test('GUI exports HTML as a zip with a fragment and an image', async function({page}) {
  await loadFixture(page, SOURCE_FIXTURE);
  await openExportMenu(page);
  await selectExportFormat(page, 'html');
  await setAdvancedOptions(page, 'responsiveness=dynamic');
  var download = await triggerExportDownload(page);
  expect(download.suggestedFilename()).toMatch(/\.zip$/i);
  var errors = await getExportErrors(page);
  expect(errors).toEqual([]);
  var zip = new AdmZip(await download.path());
  var names = zip.getEntries().map(function(entry) { return entry.entryName; }).sort();
  expect(names).toEqual(['three_points.html', 'three_points.png']);
  var html = zip.readAsText('three_points.html');
  expect(html).toContain('aspect-ratio:');
  expect(html).toContain('src="three_points.png"');
  var png = zip.readFile('three_points.png');
  expect(png.subarray(1, 4).toString()).toBe('PNG');
});

// The map is drawn the way SVG output draws it, labels and frame included, at
// twice the frame's size by default.
test('GUI exports a PNG image of the map, with its labels', async function({page}) {
  await loadLabelledFrame(page);
  await openExportMenu(page);
  await selectExportFormat(page, 'png');
  await clearAdvancedOptions(page);
  var download = await triggerExportDownload(page);
  expect(download.suggestedFilename()).toMatch(/\.png$/i);
  expect(await getExportErrors(page)).toEqual([]);
  var png = PNG.sync.read(fs.readFileSync(await download.path()));
  expect([png.width, png.height]).toEqual([400, 200]);
  // the frame's fill, and the label's red text over it
  expect(countPixels(png, [0, 0, 255])).toBeGreaterThan(40000);
  expect(countPixels(png, [255, 0, 0])).toBeGreaterThan(500);
});

test('GUI exports a JPEG image of the map at the pixel-ratio= option', async function({page}) {
  await loadLabelledFrame(page);
  await openExportMenu(page);
  await selectExportFormat(page, 'jpg');
  await setAdvancedOptions(page, 'pixel-ratio=1');
  var download = await triggerExportDownload(page);
  expect(download.suggestedFilename()).toMatch(/\.jpg$/i);
  expect(await getExportErrors(page)).toEqual([]);
  var bytes = fs.readFileSync(await download.path());
  expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]);
  var jpg = jpeg.decode(bytes);
  expect([jpg.width, jpg.height]).toEqual([200, 100]);
});

// WebKit draws SVG images with system fonts only, so Safari does not offer them
test('GUI does not offer PNG or JPEG in Safari', async function({page}) {
  await page.addInitScript(function() {
    Object.defineProperty(navigator, 'userAgent', {
      get: function() {
        return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 ' +
          '(KHTML, like Gecko) Version/26.0 Safari/605.1.15';
      }
    });
  });
  await loadFixture(page, SOURCE_FIXTURE);
  await openExportMenu(page);
  await expect(page.locator('.export-formats input[value="svg"]')).toHaveCount(1);
  await expect(page.locator('.export-formats input[value="png"]')).toHaveCount(0);
  await expect(page.locator('.export-formats input[value="jpg"]')).toHaveCount(0);
});

test('GUI does not offer GeoTIFF for a vector layer', async function({page}) {
  await loadFixture(page, SOURCE_FIXTURE);
  await openExportMenu(page);
  await expect(page.locator('.export-formats input[value="geotiff"]')).toHaveCount(0);
});

// A raster on its own can only go to GeoTIFF, so that is what the menu opens on.
test('GUI defaults to GeoTIFF for a raster layer', async function({page}) {
  await loadFixture(page, RASTER_FIXTURE);
  await openExportMenu(page);
  expect(await getSelectedExportFormat(page)).toBe('geotiff');
});

// With vector layers in the selection too, GeoTIFF cannot take them, and SVG is
// the only format that accepts both kinds at once.
test('GUI defaults to SVG for a raster mixed with vector layers', async function({page}) {
  await loadFixture(page, [RASTER_FIXTURE, SOURCE_FIXTURE].join(','));
  await openExportMenu(page);
  expect(await getSelectedExportFormat(page)).toBe('svg');
});

test('GUI switches the default to GeoTIFF when only rasters stay selected', async function({page}) {
  await loadFixture(page, [RASTER_FIXTURE, SOURCE_FIXTURE].join(','));
  await openExportMenu(page);
  await getLayerCheckbox(page, 'three_points').uncheck();
  expect(await getSelectedExportFormat(page)).toBe('geotiff');
});

// Following the selection is a convenience for a format the user has not
// thought about; once they have picked one, it stays picked.
test('GUI keeps a format the user chose when the selection changes', async function({page}) {
  await loadFixture(page, [RASTER_FIXTURE, SOURCE_FIXTURE].join(','));
  await openExportMenu(page);
  await selectExportFormat(page, 'shapefile');
  await getLayerCheckbox(page, 'three_points').uncheck();
  expect(await getSelectedExportFormat(page)).toBe('shapefile');
});

function getLayerCheckbox(page, layerName) {
  return page.locator('.layer-item', {hasText: layerName}).locator('input');
}

async function getSelectedExportFormat(page) {
  return page.locator('.export-formats input:checked').inputValue();
}

async function loadFixture(page, fixture) {
  await page.goto('/?undo=on&undo-test=on&files=' + encodeURIComponent(fixture));
  await page.waitForFunction(function() {
    return window.mapshaper &&
      window.mapshaper.undoTest &&
      window.mapshaper.undoTest.getState().model.datasetCount > 0;
  });
}

// a blue 200 x 100 px frame with a large red label in the middle
async function loadLabelledFrame(page) {
  await loadFixture(page, SOURCE_FIXTURE);
  await page.evaluate(async function() {
    var api = window.mapshaper.undoTest;
    await api.runCommand('-rectangle bbox=0,0,200,100 name=frame');
    await api.runCommand('-each \'type="frame", width=200, fill="#0000ff"\' target=frame');
    await api.runCommand('-add-label + name=labels coordinates=100,50 text=WWW font-size=40 fill="#ff0000"');
  });
}

function countPixels(png, rgb) {
  var n = 0;
  for (var i = 0; i < png.data.length; i += 4) {
    if (Math.abs(png.data[i] - rgb[0]) < 8 && Math.abs(png.data[i + 1] - rgb[1]) < 8 &&
        Math.abs(png.data[i + 2] - rgb[2]) < 8) n++;
  }
  return n;
}

async function openExportMenu(page) {
  await page.locator('.export-btn').click();
  await expect(page.locator('.export-options')).toBeVisible();
}

async function selectExportFormat(page, format) {
  await page.locator('.export-formats input[value="' + format + '"]').check();
}

async function setAdvancedOptions(page, text) {
  var input = page.locator('.export-options .advanced-options');
  await input.click();
  await input.fill(text);
}

async function clearAdvancedOptions(page) {
  await setAdvancedOptions(page, '');
}

async function triggerExportDownload(page) {
  var downloadPromise = page.waitForEvent('download');
  await page.locator('.export-options #export-btn').click();
  return downloadPromise;
}

async function getExportErrors(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getMessages().filter(function(item) {
      return item && item.severity == 'error';
    });
  });
}
