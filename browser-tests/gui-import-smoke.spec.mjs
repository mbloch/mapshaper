import { expect, test } from '@playwright/test';

var REQUIRE_ERROR_RX = /require is not defined/i;
var FIXTURES = [{
  name: 'GeoJSON',
  files: 'test/data/geojson/three_points.geojson'
}, {
  name: 'FlatGeobuf',
  files: 'test/data/flatgeobuf/countries.fgb'
}, {
  name: 'GeoParquet',
  files: 'test/data/geoparquet/example-crs_vermont-4326_geo.parquet'
}];

FIXTURES.forEach(function(fixture) {
  test('GUI imports ' + fixture.name + ' fixture', async function({page}) {
    var pageErrors = [];
    var consoleErrors = [];
    var result;

    page.on('pageerror', function(err) {
      pageErrors.push(String(err && err.message || err));
    });
    page.on('console', function(msg) {
      if (msg.type() == 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/?undo=on&undo-test=on&files=' + encodeURIComponent(fixture.files));
    result = await getImportResult(page);

    expect(result.datasetCount).toBeGreaterThan(0);
    expect(result.layerCount).toBeGreaterThan(0);
    expect(result.errorMessages).toEqual([]);
    expect(containsRequireError(pageErrors)).toBe(false);
    expect(containsRequireError(consoleErrors)).toBe(false);
  });
});

test('GUI imports multiple fixtures in one session', async function({page}) {
  var files = [
    'test/data/geojson/three_points.geojson',
    'test/data/features/clean/ex20_ogc_line.json'
  ].join(',');
  var result;

  await page.goto('/?undo=on&undo-test=on&files=' + encodeURIComponent(files));
  result = await getImportResult(page);

  expect(result.datasetCount).toBeGreaterThan(0);
  expect(result.layerCount).toBeGreaterThanOrEqual(2);
  expect(result.errorMessages).toEqual([]);
});

async function getImportResult(page) {
  await page.waitForFunction(function() {
    return window.mapshaper &&
      window.mapshaper.undoTest &&
      window.mapshaper.undoTest.getState().model.datasetCount > 0;
  });
  return page.evaluate(function() {
    var state = window.mapshaper.undoTest.getState();
    var messages = window.mapshaper.undoTest.getMessages();
    return {
      datasetCount: state.model.datasetCount,
      layerCount: state.model.layerCount,
      errorMessages: messages.filter(function(item) {
        return item && item.severity == 'error';
      })
    };
  });
}

function containsRequireError(messages) {
  return messages.some(function(msg) {
    return REQUIRE_ERROR_RX.test(msg);
  });
}
