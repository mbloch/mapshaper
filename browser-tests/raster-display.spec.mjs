import { expect, test } from '@playwright/test';
import { openLayersPanel } from './sidebar-helpers.mjs';

// A 3x3 RGB image with a differently colored pixel in each cell. Fitted to the
// map, each of its pixels is well over a hundred screen pixels wide.
var RGB_FIXTURE = 'test/data/geotiff/no-crs-rgb-3x3.tif';

test('a raster magnified past its resolution is drawn as its own pixels',
  async function({page}) {
    var colors;
    await loadFixture(page, RGB_FIXTURE);
    colors = await readMapRowColors(page, 0.25);

    // Smoothing would blend the three pixels of the top row into a gradient of
    // dozens of colors; drawing the data gives the three colors and the
    // background, in runs hundreds of pixels long.
    expect(colors.distinct).toEqual(['#0000ff', '#00ff00', '#ff0000']);
    expect(colors.longestRun).toBeGreaterThan(100);
  });

test('"duplicate layer" copies a raster', async function({page}) {
  var rows = page.locator('.layer-list .layer-item');
  await loadFixture(page, RGB_FIXTURE);
  await openLayersPanel(page);
  await expect(rows).toHaveCount(1);
  await rows.first().hover();
  await rows.first().locator('.more-btn').click();
  await page.locator('.contextmenu-item').filter({hasText: 'duplicate layer'}).click();
  await expect.poll(function() {
    return page.evaluate(function() {
      return window.mapshaper.undoTest.getSessionHistory().commands.slice(-1)[0];
    });
  }).toBe('-copy');
  await expect(rows).toHaveCount(2);
  await expect.poll(function() {
    return readMapRowColors(page, 0.25).then(function(colors) { return colors.distinct; });
  }).toEqual(['#0000ff', '#00ff00', '#ff0000']);
  await page.evaluate(function() { return window.mapshaper.undoTest.undo(); });
  await expect(rows).toHaveCount(1);
});

async function loadFixture(page, files) {
  await page.goto('/?undo=on&undo-test=on&files=' + encodeURIComponent(files));
  await expect(page.locator('body.map-view')).toHaveCount(1);
  await expect.poll(function() {
    return readMapRowColors(page, 0.25).then(function(colors) {
      return colors.distinct.length;
    });
  }).toBeGreaterThan(0);
}

// Reads a horizontal line of map pixels, at a fraction of the way down the map,
// and reports the colors found on it apart from the background.
function readMapRowColors(page, yFraction) {
  return page.evaluate(function(fraction) {
    var canvas = document.querySelector('.map-layers canvas');
    var y = Math.round(canvas.height * fraction);
    var data = canvas.getContext('2d').getImageData(0, y, canvas.width, 1).data;
    var counts = {};
    var run = 0, longestRun = 0, prev = null;
    for (var i = 0; i < data.length; i += 4) {
      var hex = data[i + 3] === 0 ? null : '#' + [0, 1, 2].map(function(band) {
        return ('0' + data[i + band].toString(16)).slice(-2);
      }).join('');
      if (hex) counts[hex] = (counts[hex] || 0) + 1;
      run = hex && hex === prev ? run + 1 : 1;
      if (hex && run > longestRun) longestRun = run;
      prev = hex;
    }
    return {distinct: Object.keys(counts).sort(), longestRun: longestRun};
  }, yFraction);
}
