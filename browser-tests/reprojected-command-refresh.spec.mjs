import { expect, test } from '@playwright/test';

// Commands that rewrite a layer's arcs in place must refresh the map when the
// layer is reprojected for display, as it is with a basemap on.

var FIXTURE = 'test/data/features/snip/ring_and_line.json';

test('-smooth refreshes a layer that is reprojected for display', async function({page}) {
  var before, after;
  await page.goto('/?undo=on&undo-test=on&files=' + encodeURIComponent(FIXTURE));
  await page.waitForFunction(function() {
    return window.mapshaper && window.mapshaper.undoTest &&
      window.mapshaper.undoTest.getState().model.datasetCount > 0;
  });
  await page.evaluate(function() {
    window.mapshaper.undoTest.setDisplayCRS('webmercator');
  });
  await page.waitForTimeout(250);
  before = await getDisplayedPaths(page);
  await page.evaluate(function() {
    return window.mapshaper.undoTest.runCommand('-smooth distance=100km no-corners');
  });
  await page.waitForTimeout(100);
  after = await getDisplayedPaths(page);
  expect(countVertices(after)).toBeGreaterThan(countVertices(before));

  await page.evaluate(() => window.mapshaper.undoTest.undo());
  await page.waitForTimeout(100);
  expect(await getDisplayedPaths(page)).toEqual(before);
});

function getDisplayedPaths(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getLayerPathPixels('ring_and_line');
  });
}

function countVertices(paths) {
  return paths.reduce(function(sum, shp) {
    return sum + shp.reduce(function(sum, part) { return sum + part.length; }, 0);
  }, 0);
}
