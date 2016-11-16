var api = require('../'),
    assert = require('assert');

describe('mapshaper-point-grid.js', function () {

  it('grid with rows, cols has margins', function() {
    var opts = {
      bbox: [0, 0, 2, 4],
      rows: 2, cols: 1
    };
    var lyr = api.pointGrid(null, opts);
    assert.deepEqual(lyr, {
      geometry_type: 'point',
      shapes: [[[1, 1]], [[1, 3]]]
    });
  });

  it('grid with interval opt has margins', function() {
    var opts = {
      bbox: [0, 0, 2, 4],
      interval: 2
    };
    var lyr = api.pointGrid(null, opts);
    assert.deepEqual(lyr, {
      geometry_type: 'point',
      shapes: [[[1, 1]], [[1, 3]]]
    });
  });

  it('uses bbox of dataset, if no bbox option present', function() {
    var dataset = {
      layers: [{
        geometry_type: 'point',
        shapes: [[[0, 4], [2, 0]]]
      }]
    };
    var opts = {
      rows: 2, cols: 1
    };
    var lyr = api.pointGrid(dataset, opts);
    assert.deepEqual(lyr, {
      geometry_type: 'point',
      shapes: [[[1, 1]], [[1, 3]]]
    });
  });

  it('default bbox is -180,-90,180,90', function() {
    var opts = {
      rows: 1, cols: 2
    };
    var lyr = api.pointGrid(null, opts);
    assert.deepEqual(lyr, {
      geometry_type: 'point',
      shapes: [[[-90, 0]], [[90, 0]]]
    });
  });

  it('throws on invalid row or col', function() {
    assert.throws(function() {
      api.pointGrid(null, {rows: NaN, cols: NaN});
    })
    assert.throws(function() {
      api.pointGrid(null, {rows: 0, cols: 0});
    })
    assert.throws(function() {
      api.pointGrid(null, {rows: -1, cols: -1});
    })
  });

  it('throws on invalid interval', function() {
    assert.throws(function() {
      api.pointGrid(null, {interval: NaN});
    })
    assert.throws(function() {
      api.pointGrid(null, {interval: 0});
    })
    assert.throws(function() {
      api.pointGrid(null, {interval: -1});
    })
  });

});
