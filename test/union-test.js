var api = require('../'),
  assert = require('assert'),
  _ = require('underscore');

describe('mapshaper-union.js', function () {

  it('union of two polygons with identical fields adds disambiguating suffixes', function(done) {
    var fileA = 'test/test_data/issues/union/polygonA.json';
    var fileB = 'test/test_data/issues/union/polygonB.json';
    var cmd = `-i ${fileA} -union ${fileB} name=merged -o`;
    api.applyCommands(cmd, {}, function(err, out) {
      var features = JSON.parse(out['merged.json']).features;
      var records = _.pluck(features, 'properties');
      assert.deepEqual(records, [
        { name_B: 'B', value_B: 8, name_A: null, value_A: null },
        { name_B: 'B', value_B: 8, name_A: 'A', value_A: 4 },
        { name_B: null, value_B: null, name_A: 'A', value_A: 4 }
      ]);
      done();
    });
  });

  it('-union add-fid adds FID_A and FID_B fields', function(done) {
    var fileA = 'test/test_data/issues/union/polygonA.json';
    var fileB = 'test/test_data/issues/union/polygonB.json';
    var cmd = `-i ${fileA} -union add-fid ${fileB} name=merged -o`;
    api.applyCommands(cmd, {}, function(err, out) {
      var features = JSON.parse(out['merged.json']).features;
      var records = _.pluck(features, 'properties');
      assert.deepEqual(records, [
        { FID_A: -1, FID_B: 0, name_B: 'B', value_B: 8, name_A: null, value_A: null },
        { FID_A: 0, FID_B: 0, name_B: 'B', value_B: 8, name_A: 'A', value_A: 4 },
        { FID_A: 0, FID_B: -1, name_B: null, value_B: null, name_A: 'A', value_A: 4 }
      ]);
      done();
    });
  });

  it('union of two polygons with different fields preserves field names', function(done) {
    var fileA = 'test/test_data/issues/union/polygonA.json';
    var fileB = 'test/test_data/issues/union/polygonB.json';
    var cmd = `-i ${fileA} -rename-fields nameA=name,valueA=value -union ${fileB} name=merged -o`;
    api.applyCommands(cmd, {}, function(err, out) {
      var features = JSON.parse(out['merged.json']).features;
      var records = _.pluck(features, 'properties');
      assert.deepEqual(records, [
        { name: 'B', value: 8, nameA: null, valueA: null },
        { name: 'B', value: 8, nameA: 'A', valueA: 4 },
        { name: null, value: null, nameA: 'A', valueA: 4 }
      ]);
      done();
    });
  });

  it('union with a no-data layer works', function(done) {
    var fileA = 'test/test_data/issues/union/polygonA.json';
    var geomB = {
      type: 'Polygon',
      coordinates: [[[1, 1], [2, 2], [3, 1], [2, 0], [1, 1]]]
    }
    var cmd = `-i polygonB.json -i ${fileA} -union polygonB name=merged -o`;
    api.applyCommands(cmd, {'polygonB.json': geomB}, function(err, out) {
      var features = JSON.parse(out['merged.json']).features;
      var records = _.pluck(features, 'properties');
      assert.deepEqual(records, [
        { name: null, value: null },
        { name: 'A', value: 4 },
        { name: 'A', value: 4 }
      ]);
      done();
    });
  })
});
