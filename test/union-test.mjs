import api from '../mapshaper.js';
import assert from 'assert';
import _ from 'underscore';

describe('mapshaper-union.js', function () {

  it('union of two polygons with identical fields adds disambiguating suffixes', function(done) {
    var fileA = 'test/data/features/union/polygonA.json';
    var fileB = 'test/data/features/union/polygonB.json';
    var cmd = `-i ${fileA} ${fileB} combine-files -union name=merged -o`;
    api.applyCommands(cmd, {}, function(err, out) {
      var features = JSON.parse(out['merged.json']).features;
      var records = _.pluck(features, 'properties');
      assert.deepEqual(records, [
        { name_2: null, value_2: null, name_1: 'A', value_1: 4 },
        { name_2: 'B', value_2: 8, name_1: 'A', value_1: 4 },
        { name_2: 'B', value_2: 8, name_1: null, value_1: null }
      ]);
      done();
    });
  });

  it('fields= option selects fields to retain', function(done) {
    var fileA = 'test/data/features/union/polygonA.json';
    var fileB = 'test/data/features/union/polygonB.json';
    var cmd = `-i ${fileA} ${fileB} combine-files -union fields=name name=merged -o`;
    api.applyCommands(cmd, {}, function(err, out) {
      var features = JSON.parse(out['merged.json']).features;
      var records = _.pluck(features, 'properties');
      assert.deepEqual(records, [
        { name_2: null, name_1: 'A'},
        { name_2: 'B', name_1: 'A'},
        { name_2: 'B', name_1: null}
      ]);
      done();
    });
  });

  it('union of three polygons with identical fields', function(done) {
    var fileA = 'test/data/features/union/polygonA.json';
    var fileB = 'test/data/features/union/polygonB.json';
    var fileC = 'test/data/features/union/polygonC.json';
    var cmd = `-i ${fileA} ${fileB} ${fileC} combine-files -union name=merged -o`;
    api.applyCommands(cmd, {}, function(err, out) {
      var features = JSON.parse(out['merged.json']).features;
      var records = _.pluck(features, 'properties');
      assert.deepEqual(records, [
        { name_2: null, value_2: null, name_1: 'A', value_1: 4, name_3: null, value_3: null },
        { name_2: 'B', value_2: 8, name_1: 'A', value_1: 4, name_3: null, value_3: null  },
        { name_2: 'B', value_2: 8, name_1: null, value_1: null, name_3: null, value_3: null  },
        { name_2: 'B', value_2: 8, name_1: null, value_1: null, name_3: 'C', value_3: 0  },
        { name_2: null, value_2: null, name_1: null, value_1: null, name_3: 'C', value_3: 0  }
      ]);
      done();
    });
  });

  it('union of two polygons with different fields preserves field names', function(done) {
    var fileA = 'test/data/features/union/polygonA.json';
    var fileB = 'test/data/features/union/polygonB.json';
    var cmd = `-i ${fileA} -rename-fields nameA=name,valueA=value -i ${fileB} -union target=* name=merged -o`;
    api.applyCommands(cmd, {}, function(err, out) {
      var features = JSON.parse(out['merged.json']).features;
      var records = _.pluck(features, 'properties');
      assert.deepEqual(records, [
        { name: null, value: null, nameA: 'A', valueA: 4 },
        { name: 'B', value: 8, nameA: 'A', valueA: 4 },
        { name: 'B', value: 8, nameA: null, valueA: null }
      ]);
      done();
    });
  });

  it('union with a no-data layer works; default layer name is "union"', function(done) {
    var fileA = 'test/data/features/union/polygonA.json';
    var geomB = {
      type: 'Polygon',
      coordinates: [[[1, 1], [2, 2], [3, 1], [2, 0], [1, 1]]]
    }
    var cmd = `-i polygonB.json -i ${fileA} -union target=polygonA,polygonB -o`;
    api.applyCommands(cmd, {'polygonB.json': geomB}, function(err, out) {
      var features = JSON.parse(out['union.json']).features;
      var records = _.pluck(features, 'properties');
      assert.deepEqual(records, [
        { name: 'A', value: 4 },
        { name: 'A', value: 4 },
        { name: null, value: null }
      ]);
      done();
    });
  })
});
