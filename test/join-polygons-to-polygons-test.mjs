import api from '../mapshaper.js';
import assert from 'assert';

describe('Polygons to polygons spatial joins', function () {

  it('-join calc= expressions work correctly', function(done) {
    var cmd = '-i test/data/features/polygon_join/ex3_target.json ' +
      '-join test/data/features/polygon_join/ex3_source.json calc="names=collect(name), n=count(), groups=collect(group)" -o out.json';
    api.applyCommands(cmd, {}, function(err, output) {
      var json = JSON.parse(output['out.json']);
      var rec = json.features[0].properties;
      assert.deepEqual(rec, {
        // name: 'A', // first joined value gets assigned
        names: ['A', 'B'], // collected names
        // group: 'foo',
        groups: ['foo', 'foo'], // collected groups
        n: 2
      });
      done();
    });
  })


  it('Bug fix: mosaic error', function (done) {
    // Sum of interpolated values of inner subdivisions should be less than value of enclosing source polygon
    // (Before, geometry errors from an earlier, less robust intersection function
    //  caused this dataset to fail this test).
    var cmd = '-i test/data/features/polygon_join/ex1_outer.json ' +
    '-i test/data/features/polygon_join/ex1_inner.json -join ex1_outer ' +
      'interpolate=POPULATION,T,D,R ' +
      '-o target=*';
    api.applyCommands(cmd, {}, function(err, output) {
      var inner = JSON.parse(output['ex1_inner.json']);
      var outer = JSON.parse(output['ex1_outer.json']);
      var sourceData = outer.features[0].properties;
      var interpolatedData = inner.features.reduce(function(memo, feat) {
        var d = feat.properties;
        memo.POPULATION += d.POPULATION;
        memo.D += d.D;
        memo.R += d.R;
        memo.T += d.T;
        return memo;
      }, {POPULATION: 0, D: 0, R: 0, T: 0});
      assert(interpolatedData.POPULATION < sourceData.POPULATION);
      assert(interpolatedData.D < sourceData.D);
      assert(interpolatedData.R < sourceData.R);
      assert(interpolatedData.T < sourceData.T);
      done();
    });
  })

  it('Join inner polygon to outer polygon, 1:2 area ratio', function(done) {
    var cmd = '-i test/data/features/polygon_join/ex2_A.json ' +
      '-join test/data/features/polygon_join/ex2_C.json interpolate=cval ' +
      '-o out.json';
    api.applyCommands(cmd, {}, function(err, output) {
      var json = JSON.parse(output['out.json']);
      assert.equal(json.features[0].properties.cval, 8);
      done();
    });
  })

  it('Join overlapping polygons to polygon with interpolation', async function() {
    var cmd = '-i test/data/features/polygon_join/ex4_target.json ' +
      '-join test/data/features/polygon_join/ex4_source.json fields="" interpolate=money planar ' +
      '-o out.json';
    var out = await api.applyCommands(cmd);
    var features = JSON.parse(out['out.json']).features;
    assert.equal(features.length, 1);
    assert.deepEqual(features[0].properties, {money: 13})
  });

  it('Join outer polygon to inner polygon, 1:2 area ratio', function(done) {
    var cmd = '-i test/data/features/polygon_join/ex2_C.json ' +
      '-join test/data/features/polygon_join/ex2_A.json interpolate=value planar ' +
      '-o out.json';
    api.applyCommands(cmd, {}, function(err, output) {
      var json = JSON.parse(output['out.json']);
      assert.equal(json.features[0].properties.value, 2); // half-area target polygon gets half the original value
      done();
    });
  })

  describe('polygon to polygon options', function() {

    var two = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {name: 'B'},
        geometry: {
          type: 'Polygon',
          coordinates: [[[0, 0], [0, 100], [1, 100], [1, 0], [0, 0]]]
        }
      }, {
        type: 'Feature',
        properties: {name: 'C'},
        geometry: {
          type: 'Polygon',
          coordinates: [[[1, 0], [1, 100], [3, 100], [3, 0], [1, 0]]]
        }
      }]
    };

    it('min-overlap-pct', async function() {
      var one = {
        type: 'Feature',
        properties: {name: 'A'},
        geometry: {
          type: 'Polygon',
          coordinates: [[[0, 0], [0, 100], [5, 100], [5, 0], [0, 0]]]
        }
      };

      var cmd = '-i one.json -join two.json min-overlap-pct=0.25 calc="names=collect(name)" -o joined.json';
      var out = await api.applyCommands(cmd, {'one.json': one, "two.json": two});
      var json = JSON.parse(out['joined.json']);
      // B is 20% C is 40% - only C joins
      assert.deepEqual(json.features[0].properties, {name: 'A', names: ['C']})
    });

    it('min-overlap-area', async function() {
      var one = {
        type: 'Feature',
        properties: {name: 'A'},
        geometry: {
          type: 'Polygon',
          coordinates: [[[0, 0], [0, 100], [5, 100], [5, 0], [0, 0]]]
        }
      };

      var cmd = '-i one.json -join two.json min-overlap-area=150 calc="names=collect(name)" -o joined.json';
      var out = await api.applyCommands(cmd, {'one.json': one, "two.json": two});
      var json = JSON.parse(out['joined.json']);
      // B is 100 C is 200 - only C joins
      assert.deepEqual(json.features[0].properties, {name: 'A', names: ['C']})

    });

    it('interpolate= categorical data', async function() {
      var one = {
        type: 'Feature',
        properties: {name: 'A'},
        geometry: {
          type: 'Polygon',
          coordinates: [[[0, 0], [0, 100], [5, 100], [5, 0], [0, 0]]]
        }
      };

      var cmd = '-i one.json -join two.json interpolate=name -o joined.json';
      var out = await api.applyCommands(cmd, {'one.json': one, "two.json": two});
      var json = JSON.parse(out['joined.json']);
      // C has the larger area
      assert.deepEqual(json.features[0].properties, {name: 'C'})
    });
  });

  describe('inner-point join method', function () {
    var one = {
      type: 'Feature',
      properties: {name: 'A'},
      geometry: {
        type: 'Polygon',
        coordinates: [[[0, 0], [0, 5], [5, 5], [5, 0], [0, 0]]]
      }
    };

    var many = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {id: '0'},
        geometry: {
          type: 'Polygon',
          coordinates: [[[1, 1], [1, 2], [2, 2], [2, 1], [1, 1]]]
        }
      }, {
        type: 'Feature',
        properties: {id: '1'},
        geometry: {
          type: 'Polygon',
          coordinates: [[[3, 1], [3, 2], [4, 2], [4, 1], [3, 1]]]
        }
      }]
    };
    one = JSON.stringify(one);
    many = JSON.stringify(many);

    it('Join outer polygon to inner polygon using inner-point method', function(done) {
      var cmd = '-i test/data/features/polygon_join/ex2_C.json ' +
        '-join test/data/features/polygon_join/ex2_A.json point-method ' +
        '-o out.json';
      api.applyCommands(cmd, {}, function(err, output) {
        var json = JSON.parse(output['out.json']);
        var rec = json.features[0].properties;
        assert.equal(rec.value, 4); // entire value is joined
        done();
      });
    })

    it('Join many polygons to one using inner-point method', function(done) {
      var cmd = '-i one.json -join many.json fields= calc="n=count()" -o';
      api.applyCommands(cmd, {'one.json': one, 'many.json': many}, function(err, out) {
        var json = JSON.parse(out['one.json']);
        var rec = json.features[0].properties;
        assert.deepEqual(rec, {name: 'A', n: 2});
        done();
      });
    });

    it('Join one polygon to many using inner-point method', function(done) {
      var cmd = '-i many.json -join one.json -o';
      api.applyCommands(cmd, {'one.json': one, 'many.json': many}, function(err, out) {
        var json = JSON.parse(out['many.json'])
        assert.deepEqual(json.features[0].properties, {name: 'A', id: 0})
        assert.deepEqual(json.features[1].properties, {name: 'A', id: 1})
        done();
      });
    });
  })

})
