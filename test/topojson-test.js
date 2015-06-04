
var api = require('../'),
  assert = require('assert'),
  TopoJSON = api.internal.topojson,
  ArcCollection = api.internal.ArcCollection,
  Utils = api.utils;

function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function fixPath(p) {
  return require('path').join(__dirname, p);
}

describe('topojson-test.js', function () {

  it('preserve top-level crs', function(done) {
    var crs = {
      "type": "name",
      "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}
    };
    var input = {
      crs: crs,
      type: 'Topology',
      objects: {
        point: {
          type: 'Point',
          coordinates: [0, 0]
        }
      }
    };
    api.applyCommands('', input, function(err, data) {
      var output = JSON.parse(data);
      assert.deepEqual(output.crs, crs);
      done();
    })
  });


  describe('exportProperties', function () {
    it('use id_field option', function () {
      var geometries = [{type: null}, {type: null}],
          records = [{idx: 0}, {idx: 1}],
          table = new api.internal.DataTable(records);

      TopoJSON.exportProperties(geometries, table, {id_field:'idx'});
      assert.deepEqual(geometries, [{
        type: null,
        properties: {idx: 0},
        id: 0
      }, {
        type: null,
        properties: {idx: 1},
        id: 1
      }])
    });

    it('default id field gets moved from table to id property', function () {
      var geometries = [{type: null}, {type: null}],
          records = [{FID: 0}, {FID: 1}],
          table = new api.internal.DataTable(records);

      TopoJSON.exportProperties(geometries, table, {});
      assert.deepEqual(geometries, [{
        type: null,
        id: 0
      }, {
        type: null,
        id: 1
      }])
    });


    // first matching name in the table is used for id property
    it('use id_field with list of fields', function () {
      var geometries = [{type: null}, {type: null}],
          records = [{ID: 0, NAME: 'a'}, {ID: 1, NAME: 'b'}],
          table = new api.internal.DataTable(records);

      TopoJSON.exportProperties(geometries, table, {id_field:['COUNTY', 'ID', 'NAME']});
      assert.deepEqual(geometries, [{
        type: null,
        properties: {ID: 0, NAME: 'a'},
        id: 0
      }, {
        type: null,
        properties: {ID: 1, NAME: 'b'},
        id: 1
      }])
    });


    it('use cut_table option', function () {
      var geometries = [{type: null}, {type: null}],
          records = [{FID: 0}, {FID: 1}],
          table = new api.internal.DataTable(records);

      TopoJSON.exportProperties(geometries, table, {id_field:'FID', cut_table: true});
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
    var arcs = [[[3, 1], [3, 1]], [[4, 3], [4, 3], [4, 3]], [[3, 1], [1, 1], [2, 3], [3, 1]],
        [[3, 1], [4, 3], [5, 1], [3, 1]]];
    var coords = new ArcCollection(arcs);

    it('Collapsed arcs are removed', function () {
      var shape = [[0, ~1, 3]],
          filtered = api.internal.filterEmptyArcs(shape, coords);
      assert.deepEqual(filtered, [[3]]);
    })
    it('Collapsed paths are removed', function () {
      var shape = [[~0, 1]],
          filtered = api.internal.filterEmptyArcs(shape, coords);
      assert.deepEqual(filtered, null);
    })
  })

  describe('Import/export tests', function() {
    it('id property is retained', function() {
      var topology = {
        type: "Topology",
        arcs: [],
        objects: {
          points: {
            type: "GeometryCollection",
            geometries: [{
              type: "Point",
              coordinates: [0, 0],
              id: 0,
              properties: {foo: 'A'}
            }]
          }
        }
      };
      var out = importExport(topology, {});
    })

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

  describe('TopoJSON import', function () {
    it('importObject() with id_field', function () {
      var obj = {
        type: "Point",
        id: 'bar',
        coordinates: [3, 2]
      };
      var lyr = TopoJSON.importObject(obj, {id_field: 'foo'});
      var records = lyr.data.getRecords();
      assert.deepEqual(records, [{foo: 'bar'}]);
    })
  })

  describe('TopoJSON export', function () {

    it("polygon with hole and null shape", function () {
      //       e
      //      / \
      //     /   \
      //    /  a  \
      //   /  / \  \
      //  h  d   b  f
      //   \  \ /  /
      //    \  c  /
      //     \   /
      //      \ /
      //       g
      //
      //   abcda, efghe
      //   0/-1,  1

      var arcs = [[[3, 4], [4, 3], [3, 2], [2, 3], [3, 4]],
          [[3, 5], [5, 3], [3, 1], [1, 3], [3, 5]]];
      var data = {
        arcs: new ArcCollection(arcs),
        layers: [{
          name: "polygons",
          geometry_type: "polygon",
          shapes: [null, [[0]], [[1], [~0]]]
        }]
      };

      var target = {
        type: "Topology",
        arcs: [[[3, 4], [4, 3], [3, 2], [2, 3], [3, 4]],
          [[3, 5], [5, 3], [3, 1], [1, 3],[3, 5]]],
        objects: {
          polygons: {
            type: "GeometryCollection",
            geometries: [{
              type: null
            }, {
              type: "Polygon",
              arcs: [[0]]
            }, {
              type: "Polygon",
              arcs: [[1], [~0]]
            }]
          }
        }
      };

      var result = TopoJSON.exportTopology(data, {no_quantization: true});
      assert.deepEqual(result, target);
    })

    it("multipolygon", function () {
      //       e
      //      / \
      //     /   \
      //    /  a  \
      //   /  / \  \
      //  h  d   b  f
      //   \  \ /  /
      //    \  c  /
      //     \   /
      //      \ /
      //       g
      //
      //   abcda, efghe
      //   0/-1,  1

      var arcs = [[[3, 4], [4, 3], [3, 2], [2, 3], [3, 4]],
          [[3, 5], [5, 3], [3, 1], [1, 3], [3, 5]]];
      var data = {
        arcs: new ArcCollection(arcs),
        layers: [{
          name: "polygons",
          geometry_type: "polygon",
          shapes: [[[0], [1], [~0]]]
        }]
      };

      var target = {
        type: "Topology",
        arcs: [[[3, 4], [4, 3], [3, 2], [2, 3], [3, 4]],
          [[3, 5], [5, 3], [3, 1], [1, 3],[3, 5]]],
        objects: {
          polygons: {
            type: "GeometryCollection",
            geometries: [{
              type: "MultiPolygon",
              arcs: [[[0]], [[1], [~0]]]
            }]
          }
        }
      };

      var result = TopoJSON.exportTopology(data, {no_quantization: true});

      assert.deepEqual(result, target);
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
  var opts = {
    format:'topojson',
    quantization: 10000
  };
  var data = api.importFile(fixPath(fname));
  var files = api.internal.exportFileContent(data, opts);
  var data2 = api.internal.importFileContent(files[0].content, 'json');
  var files2 = api.internal.exportFileContent(data2, opts);
  assert.equal(files[0].content, files2[0].content);
}

function importExport(json, opts) {
  if (Utils.isObject(json)) {
    // prevent import from modifying TopoJSON coords
    // (need to stop modifying coords in-place);
    json = JSON.stringify(json);
  }
  var data = api.internal.importTopoJSON(json, opts);
  return TopoJSON.exportTopology(data, opts);
}
