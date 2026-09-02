import { expect, test } from '@playwright/test';

// The fixture reproduces a shape seen in USGS National Map GeoPackages: a
// feature table ('roads') is advertised in gpkg_contents and
// gpkg_geometry_columns, but the table itself is not in the file. The browser
// reads GeoPackages through sql.js rather than better-sqlite3, so exercise the
// skip-and-warn path against the adapter the GUI actually uses.
test('GUI imports a GeoPackage whose metadata lists a missing table', async function({page}) {
  var files = 'test/data/geopackage/missing_feature_table.gpkg';
  await page.goto('/?undo=on&undo-test=on&files=' + encodeURIComponent(files));

  await page.waitForFunction(function() {
    return window.mapshaper &&
      window.mapshaper.undoTest &&
      window.mapshaper.undoTest.getState().model.datasetCount > 0;
  });
  var result = await page.evaluate(function() {
    var state = window.mapshaper.undoTest.getState();
    return {
      layerNames: state.model.datasets.reduce(function(memo, dataset) {
        return memo.concat((dataset.layers || []).map(function(lyr) {
          return lyr.name;
        }));
      }, []),
      messages: window.mapshaper.undoTest.getMessages()
    };
  });

  expect(result.layerNames).toEqual(['land']);
  expect(result.messages.filter(function(item) {
    return item.severity == 'error';
  })).toEqual([]);
  // The skipped layer is reported in the Messages inbox rather than silently.
  expect(result.messages.some(function(item) {
    return item.severity == 'warn' && item.body.includes('roads');
  })).toBe(true);
});
