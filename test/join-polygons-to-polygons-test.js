var api = require('../'),
    assert = require('assert');

describe('Polygons to polygons spatial joins', function () {

  it('Bug fix: mosaic error', function (done) {
    // Sum of interpolated values of inner subdivisions should be less than value of enclosing source polygon
    // (Before, geometry errors from an earlier, less robust intersection function
    //  caused this dataset to fail this test).
    var cmd = '-i test/test_data/features/polygon_join/ex1_outer.json ' +
    '-i test/test_data/features/polygon_join/ex1_inner.json -join ex1_outer ' +
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
    var cmd = '-i test/test_data/features/polygon_join/ex2_A.json ' +
      '-join test/test_data/features/polygon_join/ex2_C.json interpolate=cval ' +
      '-o out.json';
    api.applyCommands(cmd, {}, function(err, output) {
      var json = JSON.parse(output['out.json']);
      assert.equal(json.features[0].properties.cval, 8);
      done();
    });
  })

  it('Join outer polygon to inner polygon, 1:2 area ratio', function(done) {
    var cmd = '-i test/test_data/features/polygon_join/ex2_C.json ' +
      '-join test/test_data/features/polygon_join/ex2_A.json interpolate=value planar ' +
      '-o out.json';
    api.applyCommands(cmd, {}, function(err, output) {
      var json = JSON.parse(output['out.json']);
      assert.equal(json.features[0].properties.value, 2); // half-area target polygon gets half the original value
      done();
    });
  })

  it('Join outer polygon to inner polygon using inner-point method', function(done) {
    var cmd = '-i test/test_data/features/polygon_join/ex2_C.json ' +
      '-join test/test_data/features/polygon_join/ex2_A.json point-method ' +
      '-o out.json';
    api.applyCommands(cmd, {}, function(err, output) {
      var json = JSON.parse(output['out.json']);
      assert.equal(json.features[0].properties.value, 4); // entire value is joined
      done();
    });
  })

})