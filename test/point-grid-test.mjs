import api from '../mapshaper.js';
import assert from 'assert';


describe('mapshaper-point-grid.js', function () {

  describe('-point-grid command', function () {

    it('create a grid without importing a file using <rows,cols>', function (done) {
      var cmd = '-point-grid bbox=10,10,20,20 2,2 -o out.json';
      api.applyCommands(cmd, {}, function(err, out) {
        var json = JSON.parse(out['out.json']);
        var expected = {
          type: 'GeometryCollection',
          geometries: [{
            type: 'Point',
            coordinates: [12.5, 12.5]
          }, {
            type: 'Point',
            coordinates: [17.5, 12.5]
          }, {
            type: 'Point',
            coordinates: [12.5, 17.5]
          }, {
            type: 'Point',
            coordinates: [17.5, 17.5]
          }]
        };
        assert.deepEqual(json, expected);
        done();
      })
    })

    it('create a grid without importing a file using interval=', function (done) {
      var cmd = '-point-grid bbox=10,10,20,20 interval=5 -o out.json';
      api.applyCommands(cmd, {}, function(err, out) {
        var json = JSON.parse(out['out.json']);
        var expected = {
          type: 'GeometryCollection',
          geometries: [{
            type: 'Point',
            coordinates: [12.5, 12.5]
          }, {
            type: 'Point',
            coordinates: [17.5, 12.5]
          }, {
            type: 'Point',
            coordinates: [12.5, 17.5]
          }, {
            type: 'Point',
            coordinates: [17.5, 17.5]
          }]
        };
        assert.deepEqual(json, expected);
        done();
      })
    })

  })

  it('grid with rows, cols has margins', function() {
    var opts = {
      bbox: [0, 0, 2, 4],
      rows: 2, cols: 1
    };
    var lyr = api.cmd.pointGrid(null, opts);
    assert.deepEqual(lyr, {
      name: 'grid',
      geometry_type: 'point',
      shapes: [[[1, 1]], [[1, 3]]]
    });
  });

  it('grid with interval opt has margins', function() {
    var opts = {
      bbox: [0, 0, 2, 4],
      interval: 2
    };
    var lyr = api.cmd.pointGrid(null, opts);
    assert.deepEqual(lyr, {
      name: 'grid',
      geometry_type: 'point',
      shapes: [[[1, 1]], [[1, 3]]]
    });
  });

  it('uses bbox of dataset, if no bbox option present', function() {
    var dataset = {
      layers: [{
        name: 'grid',
        geometry_type: 'point',
        shapes: [[[0, 4], [2, 0]]]
      }]
    };
    var opts = {
      rows: 2, cols: 1
    };
    var lyr = api.cmd.pointGrid(dataset, opts);
    assert.deepEqual(lyr, {
      name: 'grid',
      geometry_type: 'point',
      shapes: [[[1, 1]], [[1, 3]]]
    });
  });

  it('default bbox is -180,-90,180,90', function() {
    var opts = {
      rows: 1, cols: 2
    };
    var lyr = api.cmd.pointGrid(null, opts);
    assert.deepEqual(lyr, {
      name: 'grid',
      geometry_type: 'point',
      shapes: [[[-90, 0]], [[90, 0]]]
    });
  });

  it('throws on invalid row or col', function() {
    assert.throws(function() {
      api.cmd.pointGrid(null, {rows: NaN, cols: NaN});
    })
    assert.throws(function() {
      api.cmd.pointGrid(null, {rows: 0, cols: 0});
    })
    assert.throws(function() {
      api.cmd.pointGrid(null, {rows: -1, cols: -1});
    })
  });

  it('throws on invalid interval', function() {
    assert.throws(function() {
      api.cmd.pointGrid(null, {interval: NaN});
    })
    assert.throws(function() {
      api.cmd.pointGrid(null, {interval: 0});
    })
    assert.throws(function() {
      api.cmd.pointGrid(null, {interval: -1});
    })
  });

});
