import assert from 'assert';
import api from '../mapshaper.js';

var internal = api.internal;

// Arcs that no layer uses -- left by -filter, or by a GUI edit that replaces
// a path's arcs -- should have no effect on the arcs that layers do use.

// @used, @unused: arrays of paths ([[x, y], ...]); the layer refers to the
// used paths only, which come after the unused ones in the arc collection
function getDataset(used, unused) {
  var arcs = new internal.ArcCollection(unused.concat(used));
  var shapes = used.map(function(path, i) {
    return [[unused.length + i]];
  });
  return {
    arcs: arcs,
    layers: [{geometry_type: 'polyline', shapes: shapes}],
    info: {}
  };
}

function getPaths(dataset) {
  return dataset.layers[0].shapes.map(function(shp) {
    var iter = dataset.arcs.getShapeIter(shp[0]);
    var path = [];
    while (iter.hasNext()) path.push([iter.x, iter.y]);
    return path;
  });
}

function getGeoJSONCoords(output) {
  return JSON.parse(output).geometries.map(function(geom) {
    return geom.coordinates;
  });
}

describe('unused arcs', function() {
  var line = [[0, 0], [10, 0]];
  var crossingLine = [[5, -5], [5, 5]];

  describe('getUsedArcTest()', function() {
    it('returns null if every arc is used', function() {
      var dataset = getDataset([line, crossingLine], []);
      assert.strictEqual(internal.getUsedArcTest(dataset), null);
    });

    it('returns null if there are no path layers', function() {
      var dataset = getDataset([], [line]);
      dataset.layers = [];
      assert.strictEqual(internal.getUsedArcTest(dataset), null);
    });

    it('tests forward and reversed arc ids', function() {
      var dataset = getDataset([line], [crossingLine]);
      var test = internal.getUsedArcTest(dataset);
      assert.equal(test(0), false);
      assert.equal(test(~0), false);
      assert.equal(test(1), true);
      assert.equal(test(~1), true);
    });
  });

  describe('findSegmentIntersections()', function() {
    it('arcFilter skips the arcs it rejects', function() {
      var dataset = getDataset([line], [crossingLine]);
      var arcFilter = internal.getUsedArcTest(dataset);
      assert.equal(internal.findSegmentIntersections(dataset.arcs).length, 1);
      assert.equal(internal.findSegmentIntersections(dataset.arcs, {arcFilter: arcFilter}).length, 0);
    });
  });

  describe('buildTopology()', function() {
    it('does not split a used arc where an unused arc shares its vertices', function() {
      var dataset = getDataset([[[0, 0], [5, 0], [10, 0]]], [[[5, 0], [10, 0], [10, 5]]]);
      internal.buildTopology(dataset);
      assert.equal(dataset.arcs.size(), 1);
      assert.deepEqual(dataset.layers[0].shapes, [[[0]]]);
      assert.deepEqual(getPaths(dataset), [[[0, 0], [5, 0], [10, 0]]]);
    });

    it('leaves the arcs of a dataset without path layers', function() {
      var dataset = getDataset([], [line]);
      dataset.layers = [];
      internal.buildTopology(dataset);
      assert.equal(dataset.arcs.size(), 1);
    });
  });

  describe('addIntersectionCuts()', function() {
    it('does not cut a used arc where an unused arc crosses it', function() {
      var dataset = getDataset([line], [crossingLine]);
      internal.addIntersectionCuts(dataset, {});
      assert.deepEqual(getPaths(dataset), [line]);
    });
  });

  describe('-snap', function() {
    it('does not move a used vertex to a nearby vertex of an unused arc', function() {
      var dataset = getDataset([line], [[[9.9, 0.1], [9.9, 5]]]);
      api.cmd.snap({dataset: dataset, layers: dataset.layers}, {interval: 0.5});
      assert.deepEqual(getPaths(dataset), [line]);
    });
  });

  describe('-check-geometry', function() {
    it('ignores intersections with unused arcs', function() {
      var dataset = getDataset([line], [crossingLine]);
      api.cmd.checkGeometry(dataset.layers[0], dataset, {strict: true});
    });

    it('still finds intersections between used arcs', function() {
      var dataset = getDataset([line, crossingLine], []);
      assert.throws(function() {
        api.cmd.checkGeometry(dataset.layers[0], dataset, {strict: true});
      }, /Found 1 intersection/);
    });
  });

  describe('commands run after -filter', function() {
    var input = {
      type: 'GeometryCollection',
      geometries: [
        {type: 'LineString', coordinates: line},
        {type: 'LineString', coordinates: crossingLine}
      ]
    };

    it('-clean does not add a vertex where a removed line crossed', async function() {
      var out = await api.applyCommands('-i in.json -filter "this.id === 0" -clean -o out.json',
        {'in.json': input});
      assert.deepEqual(getGeoJSONCoords(out['out.json']), [line]);
    });

    it('-snap does not pull vertices toward a removed line', async function() {
      var input2 = {
        type: 'GeometryCollection',
        geometries: [
          {type: 'LineString', coordinates: line},
          {type: 'LineString', coordinates: [[9.9, 0.1], [9.9, 5]]}
        ]
      };
      var out = await api.applyCommands('-i in.json -filter "this.id === 0" -snap interval=0.5 -o out.json',
        {'in.json': input2});
      assert.deepEqual(getGeoJSONCoords(out['out.json']), [line]);
    });
  });

  describe('undo', function() {
    function state(dataset) {
      var data = dataset.arcs.getVertexData();
      return JSON.stringify({
        nn: Array.from(data.nn),
        xx: Array.from(data.xx),
        yy: Array.from(data.yy),
        shapes: dataset.layers.map(function(lyr) { return lyr.shapes; })
      });
    }

    it('restores the unused arcs and the layer\'s arc ids', function() {
      var dataset = getDataset([[[0, 0], [5, 0], [10, 0]]], [[[5, 0], [10, 0], [10, 5]]]);
      var before = state(dataset);
      var tx = new internal.UndoTransaction('test');
      internal.setActiveUndoTransaction(tx);
      try {
        internal.buildTopology(dataset);
      } finally {
        internal.clearActiveUndoTransaction(tx);
      }
      assert.notEqual(state(dataset), before);
      internal.restoreCapturedUnits(internal.filterUnchangedRestoreUnits(tx.getCapturedUnits()));
      assert.equal(state(dataset), before);
    });
  });
});
