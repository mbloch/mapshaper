import { expect, test } from '@playwright/test';
// A 3x3 RGBA image covering -15,-15,15,15. Because the grid has an odd number
// of rows and columns, the center of the fitted map view lands squarely inside
// the middle pixel, which is (0, 128, 255).
var RGB_FIXTURE = [
  'test/data/images/rgb-3x3.png',
  'test/data/images/rgb-3x3.pgw',
  'test/data/images/rgb-3x3.prj'
].join(',');

// A 2x2 single-band GeoTIFF covering the whole world.
var GRAY_FIXTURE = 'test/data/geotiff/wgs84-geographic-epsg4326.tif';

test('right-click reads the bands and color of a raster pixel', async function({page}) {
  var menu;
  await loadFixture(page, RGB_FIXTURE);
  menu = await openMapContextMenu(page);

  expect(menu.labels).toContain('red, green, blue, alpha');
  expect(menu.items).toContain('0, 128, 255, 255');
  expect(menu.labels).toContain('color');
  expect(menu.items).toContain('#0080ff');
  expect(menu.swatchColors).toEqual(['rgb(0, 128, 255)']);
});

test('right-click reads a single band value without a color', async function({page}) {
  var menu;
  await loadFixture(page, GRAY_FIXTURE);
  menu = await openMapContextMenu(page);

  expect(menu.labels).toContain('band value');
  expect(menu.labels).not.toContain('color');
  expect(menu.swatchColors).toEqual([]);
});

test('right-click on a vector layer shows no band info', async function({page}) {
  var menu;
  await loadFixture(page, 'test/data/geojson/three_points.geojson');
  menu = await openMapContextMenu(page);

  expect(menu.labels).toContain('longitude, latitude');
  expect(menu.labels).not.toContain('band value');
  expect(menu.labels).not.toContain('color');
});

async function loadFixture(page, files) {
  await page.goto('/?undo=on&undo-test=on&files=' + encodeURIComponent(files));
  await page.waitForFunction(function() {
    return window.mapshaper && window.mapshaper.undoTest &&
      window.mapshaper.undoTest.getState().model.layerCount > 0;
  });
  await expect(page.locator('body.map-view')).toHaveCount(1);
}

// Right-clicks the center of the map, which is the center of the fitted layer.
async function openMapContextMenu(page) {
  var map = page.locator('.map-layers');
  var box = await map.boundingBox();
  await map.click({
    button: 'right',
    position: {x: Math.round(box.width / 2), y: Math.round(box.height / 2)}
  });
  await expect(page.locator('.contextmenu')).toBeVisible();
  return page.evaluate(function() {
    var menu = document.querySelector('.contextmenu');
    function textsOf(selector) {
      return Array.from(menu.querySelectorAll(selector)).map(function(el) {
        return el.textContent.replace(/^[•\s\u00a0]+/, '').trim();
      });
    }
    return {
      labels: textsOf('.contextmenu-label'),
      items: textsOf('.contextmenu-item'),
      swatchColors: Array.from(menu.querySelectorAll('.contextmenu-swatch'))
        .map(function(el) {
          return window.getComputedStyle(el).backgroundColor;
        })
    };
  });
}
