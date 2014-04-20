
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
  describe('exportProperties', function () {
    it('use id_field option', function () {
      var geometries = [{type: null}, {type: null}],
          records = [{FID: 0}, {FID: 1}];

      TopoJSON.exportProperties(geometries, records, {id_field:'FID'});
      assert.deepEqual(geometries, [{
        type: null,
        properties: {FID: 0},
        id: 0
      }, {
        type: null,
        properties: {FID: 1},
        id: 1
      }])
    });

    it('use cut_table option', function () {
      var geometries = [{type: null}, {type: null}],
          records = [{FID: 0}, {FID: 1}];

      TopoJSON.exportProperties(geometries, records, {id_field:'FID', cut_table: true});
      assert.deepEqual(geometries, [{
        type: null,
        id: 0
      }, {
        type: null,
        id: 1
      }])
    });
  });

  describe('filterEmptyArcs()', function () {
    //      b     d
    //     / \   / \
    //    /   \ /   \
    //   a --- c --- e

    // cc, ddd, cabc, cdec
    var coords = new ArcDataset([[[3, 3], [1, 1]], [[4, 4, 4], [3, 3, 3]], [[3, 1, 2, 3], [1, 1, 3, 1]], [[3, 4, 5, 3], [1, 3, 1, 1]]]);

    it('Collapsed arcs are removed', function () {
      var shape = [[0, ~1, 3]],
          filtered = api.filterEmptyArcs(shape, coords);
      assert.deepEqual(filtered, [[3]]);
    })
    it('Collapsed paths are removed', function () {
      var shape = [[~0, 1]],
          filtered = api.filterEmptyArcs(shape, coords);
      assert.deepEqual(filtered, null);
    })
  })

  describe('Import/export tests', function() {
    it("topology contains only points", function() {
      var topology = {
        type: "Topology",
        arcs: [],
        objects: {
          points: {
            type: "GeometryCollection",
            geometries: [
              {type: "Point", coordinates: [1, 2]},
              {type: "MultiPoint", coordinates: [[2, 3], [3, 4]]},
              {type: null}
            ]
          }
        }
      };
      var out = importExport(topology, {topojson_resolution: 0});
      assert.deepEqual(out, topology);
    })

    it("unused arcs are pruned", function() {
      //      b --- c
      //     / \   /
      //    /   \ /
      //   a --- d

      var arcs = [
        [[2, 3], [4, 3], [3, 1]],  // bcd  (unused)
        [[3, 1], [1, 1], [2, 3]],  // dab
        [[3, 1], [2, 3]]];         // db

      var topology = {
        type: "Topology",
        arcs: arcs,
        objects: {
          layer1: {
            type: "GeometryCollection",
            geometries: [
              {type: "LineString", arcs: [2]},
              {type: "MultiLineString", arcs: [[2], [1]]},
              {type: "Polygon", arcs: [[1, ~2]]},
              {type: null},
              {type: 'Point', coordinates: [0.2, 1.3]}
            ]
          }
        }
      };

      // unused arc is removed, arc ids are renumbered
      var pruned = {
        type: "Topology",
        arcs: [[[3, 1], [1, 1], [2, 3]], [[3, 1], [2, 3]]],
        objects: {
          layer1: {
            type: "GeometryCollection",
            geometries: [
              {type: "LineString", arcs: [1]},
              {type: "MultiLineString", arcs: [[1], [0]]},
              {type: "Polygon", arcs: [[0, ~1]]},
              {type: null},
              {type: 'Point', coordinates: [0.2, 1.3]}
            ]
          }
        }
      };

      TopoJSON.pruneArcs(topology)
      assert.deepEqual(topology, pruned);
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
  var opts = {
    output_format:'topojson',
    topojson_resolution: 10000
  };
  var data = api.importFromFile(fixPath(fname));
  var files = api.exportContent(data.layers, data.arcs, opts);
  var data2 = api.importContent(files[0].content, 'json');
  var files2 = api.exportContent(data2.layers, data2.arcs, opts);

  assert.deepEqual(files, files2);
}

function importExport(json, opts) {
  if (Utils.isObject(json)) {
    // prevent import from modifying TopoJSON coords
    // (need to stop modifying coords in-place);
    json = JSON.stringify(json);
  }
  var data = api.importTopoJSON(json, opts);
  return TopoJSON.exportTopology(data.layers, data.arcs, opts);
}
