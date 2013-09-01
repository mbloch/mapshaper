
var api = require('../'),
  assert = require('assert'),
  TopoJSON = api.topojson,
  ArcDataset = api.ArcDataset,
  Utils = api.Utils,
  Node = api.Node;


function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function fixPath(p) {
  return Node.path.join(__dirname, p);
}

describe('topojson-test.js', function () {

  describe('#remapShapeArcs()', function () {
    it('Remap a shape, removing a reversed arc', function () {
      var shape = [[0, 1, 2], [~1, 2, 3]],
          map = [0, -1, 1, 2];

      TopoJSON.remapShapeArcs(shape, map);
      assert.deepEqual([[0, 1], [1, 2]], shape);
    })

    it('Remap a shape, including a reversed arc', function () {
      var shape = [[0, 1, 2], [1, 2, ~3]],
          map = [0, 1, -1, 2];

      TopoJSON.remapShapeArcs(shape, map);
      assert.deepEqual([[0, 1], [1, ~2]], shape);
    })

    it('Handle a null shape', function() {
      var shape = null,
          map = [0, 1, -1, 2];

      TopoJSON.remapShapeArcs(shape, map);
      assert.equal(null, shape);
    })
  })

  describe('filterExportArcs()', function () {

    //      b     d
    //     / \   / \
    //    /   \ /   \
    //   a --- c --- e

    // cc, ddd, cabc, cdec
    var arcs1 = [[[3, 3], [1, 1]], [[4, 4, 4], [3, 3, 3]], [[3, 1, 2, 3], [1, 1, 3, 1]], [[3, 4, 5, 3], [1, 3, 1, 1]]];

    // cabc, cdec
    var arcs2 = [[[3, 1, 2, 3], [1, 1, 3, 1]], [[3, 4, 5, 3], [1, 3, 1, 1]]];

    it('Collapsed arcs are removed', function () {
      var arcs = new ArcDataset(arcs1);
      var map = TopoJSON.filterExportArcs(arcs);
      assert.equal(2, arcs.size());
      assert.deepEqual([-1, -1, 0, 1], Utils.toArray(map));
      assert.deepEqual([[[3, 1], [1, 1], [2, 3], [3, 1]], [[3, 1], [4, 3], [5, 1], [3, 1]]], arcs.toArray());
    })

    it("Returns null if no arcs are removed", function() {
      var arcs = new ArcDataset(arcs2);
      var map = TopoJSON.filterExportArcs(arcs);
      assert.equal(2, arcs.size());
      assert.equal(null, map);
      assert.deepEqual([[[3, 1], [1, 1], [2, 3], [3, 1]], [[3, 1], [4, 3], [5, 1], [3, 1]]], arcs.toArray());
    })
  })


  describe('Export/Import roundtrip tests', function () {
    it('two states', function () {
      topoJSONRoundTrip('test_data/two_states.json');
    })

    it('six counties, two null geometries', function () {
      topoJSONRoundTrip('test_data/six_counties_three_null.json');
    })

    it('internal state borders (polyline)', function () {
      topoJSONRoundTrip('test_data/ne/ne_110m_admin_1_states_provinces_lines.json');
    })
  })

})

function topoJSONRoundTrip(fname) {
  // in order for the roundtrip to work, need to use a constant resolution
  // rather than letting mapshaper automatically pick a suitable resolution
  var exportOpts = {
    output_format:'topojson',
    topojson_resolution: 10000
  };
  var data = api.importFromFile(fixPath(fname));
  var files = api.exportContent(data.layers, data.arcs, exportOpts);

  var data2 = api.importContent(files[0].content, 'json');
  var files2 = api.exportContent(data2.layers, data2.arcs, exportOpts);

  assert.deepEqual(files, files2);
}
