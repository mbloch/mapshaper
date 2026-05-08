import { expect, test } from '@playwright/test';

var GEO_PARQUET_FIXTURE = 'test/data/geoparquet/example-crs_vermont-4326_geo.parquet';
var REQUIRE_ERROR_RX = /require is not defined/i;
var PROJ_ERROR_RX = /Unable to use projection/i;

test('GeoParquet CRS import does not fail with require() error', async function({page}) {
  var pageErrors = [];
  var consoleErrors = [];

  page.on('pageerror', function(err) {
    pageErrors.push(String(err && err.message || err));
  });
  page.on('console', function(msg) {
    if (msg.type() == 'error') {
      consoleErrors.push(msg.text());
    }
  });

  await page.goto('/?undo=on&undo-test=on&files=' + encodeURIComponent(GEO_PARQUET_FIXTURE));

  await page.waitForFunction(function() {
    return window.mapshaper &&
      window.mapshaper.undoTest &&
      window.mapshaper.undoTest.getState().model.datasetCount > 0;
  });

  var appMessages = await page.evaluate(function() {
    return window.mapshaper.undoTest.getMessages();
  });
  var appMessageText = appMessages.map(function(item) {
    return [item && item.title || '', item && item.message || ''].join(' ').trim();
  });

  expect(pageErrors.some(function(msg) {
    return REQUIRE_ERROR_RX.test(msg) || PROJ_ERROR_RX.test(msg) && REQUIRE_ERROR_RX.test(msg);
  })).toBe(false);
  expect(consoleErrors.some(function(msg) {
    return REQUIRE_ERROR_RX.test(msg) || PROJ_ERROR_RX.test(msg) && REQUIRE_ERROR_RX.test(msg);
  })).toBe(false);
  expect(appMessageText.some(function(msg) {
    return REQUIRE_ERROR_RX.test(msg) || PROJ_ERROR_RX.test(msg) && REQUIRE_ERROR_RX.test(msg);
  })).toBe(false);
});
