import assert from 'assert';
import api from '../mapshaper.js';

var utils = api.Utils,
    dissolve = api.cmd.dissolve,
    ArcCollection = api.internal.ArcCollection;

describe('mapshaper-dissolve.js', function () {

  describe('-dissolve command', function () {

    it('where= options dissolves a subset of features', function(done) {
      var input = 'id,x,y\na,0,0\na,1,1\nb,2,2\nb,3,3';
      var cmd = '-i points.csv -points -dissolve planar id where=\'id == "a"\' -o format=geojson';
      var expect = {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "geometry": {
              "type": "Point",
              "coordinates": [2,2]
            },
            "properties": {
              "id": "b",
              "x": 2,
              "y": 2
            }
          },
          {
            "type": "Feature",
            "geometry": {
              "type": "Point",
              "coordinates": [3,3]
            },
            "properties": {
              "id": "b",
              "x": 3,
              "y": 3
            }
          },
          {
            "type": "Feature",
            "geometry": {
              "type": "Point",
              "coordinates": [0.5, 0.5]
            },
            "properties": {
              "id": "a"
            }
          }
        ]
      };
      api.applyCommands(cmd, {'points.csv': input}, function(err, out) {
        var json = JSON.parse(out['points.json']);
        assert.deepEqual(json, expect);
        done();
      });
    });

    it('Fix: dissolve a layer with no attributes', function(done) {
      var input = {
        type: 'GeometryCollection',
        geometries: [{
          type: 'Polygon',
          coordinates: [[[0, 0], [0, 1], [1, 0], [0, 0]]]
        }, {
          type: 'Polygon',
          coordinates: [[[1, 0], [0, 1], [1, 1], [1, 0]]]
        }]
      };
      api.applyCommands('-i input.json -dissolve -o', {'input.json': input}, function(err, out) {
        assert(!err);
        var output = JSON.parse(out['input.json']);
        assert.equal(output.geometries.length, 1);
        done();
      });
    });


    it('multipart option with polylines', function(done) {
      var input = {
        type: 'GeometryCollection',
        geometries: [{
          type: 'LineString',
          coordinates: [[0, 0], [1, 1]]
        }, {
          type: 'LineString',
          coordinates: [[1, 1], [2, 2]]
        }, {
          type: 'LineString',
          coordinates: [[2, 2], [3, 3]]
        }]
      };
      var expect = {
        type: 'GeometryCollection',
        geometries: [{
          type: 'MultiLineString',
          coordinates: [[[0, 0], [1, 1]], [[1, 1], [2, 2]], [[2, 2], [3, 3]]]
        }]
      };
      api.applyCommands('-i lines.json -dissolve multipart -o', {'lines.json': input}, function(err, out) {
          var output = JSON.parse(out['lines.json']);
          assert.deepEqual(output, expect);
          done();
        });

    });

    it('dissolve CSV on three fields', function(done) {
      var str = 'id1,id2,id3\na,1,x\na,1,x\na,2,x\nb,1,x\nb,2,x\nb,2,x\nc,2,x\na,1,y\na,1,y';
      api.applyCommands('-i in.csv -dissolve id1,id2,id3 -o out.csv', {'in.csv': str}, function(err, out) {
        var csv = out['out.csv'];
        assert.equal(csv, 'id1,id2,id3\na,1,x\na,2,x\nb,1,x\nb,2,x\nc,2,x\na,1,y');
        done();
      })
    });

    it('polyline test 1 (multiple segments)', function(done) {
      var a = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {name: 'bar'},
          geometry: {
            type: 'LineString',
            coordinates: [[1, 1], [0, 0]]
          }
        }, {
          type: 'Feature',
          properties: {name: 'foo'},
          geometry: {
            type: 'MultiLineString',
            coordinates: [[[1, 1], [2, 2], [3, 3]], [[4, 4], [3, 3]]]
          }
        }]
      };
      var expect = {
        type: 'GeometryCollection',
        geometries: [{
          type: 'LineString',
          coordinates: [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]]
        }]
      };
      api.applyCommands('-i a.json -dissolve -o', {'a.json': a}, function(err, output) {
        var geojson = JSON.parse(output['a.json']);
        assert.deepEqual(geojson, expect)
        done();
      })
    });

    it('polyline test 2 (simple ring)', function(done) {
      var a = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {name: 'bar'},
          geometry: {
            type: 'LineString',
            coordinates: [[1, 1], [1, 0], [0, 1], [1, 1]]
          }
        }]
      };
      var expect = {
        type: 'GeometryCollection',
        geometries: [{
          type: 'LineString',
          coordinates: [[1, 1], [1, 0], [0, 1], [1, 1]]
        }]
      };
      api.applyCommands('-i a.json -dissolve -o', {'a.json': a}, function(err, output) {
        var geojson = JSON.parse(output['a.json']);
        assert.deepEqual(geojson, expect)
        done();
      })
    });

    it('polyline test 3 (split ring)', function(done) {
      var a = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {name: 'foo'},
          geometry: {
            type: 'LineString',
            coordinates: [[1, 1], [1, 0], [0, 0]]
          }
        }, {
          type: 'Feature',
          properties: {name: 'bar'},
          geometry: {
            type: 'LineString',
            coordinates: [[0, 0], [0, 1], [1, 1]]
          }
        }]
      };
      var expect = {
        type: 'GeometryCollection',
        geometries: [{
          type: 'LineString',
          coordinates: [[1, 1], [1, 0], [0, 0], [0, 1], [1, 1]]
        }]
      };
      api.applyCommands('-i a.json -dissolve -o', {'a.json': a}, function(err, output) {
        var geojson = JSON.parse(output['a.json']);
        assert.deepEqual(geojson, expect)
        done();
      })
    });

    it('polygon test 1', function(done) {
      var cmd = "-i test/data/six_counties.shp -dissolve + copy-fields NAME,STATE_FIPS sum-fields POP2000,MULT_RACE";
        api.internal.testCommands(cmd, function(err, data) {
        assert.equal(data.layers.length, 2);
        var lyr1 = data.layers[0]; // original lyr
        assert.equal(lyr1.data.size(), 6); // original data table hasn't been replaced

        var lyr2 = data.layers[1]; // dissolved lyr
        assert.deepEqual(lyr2.data.getRecords(),
            [{NAME: 'District of Columbia', STATE_FIPS: '11', POP2000: 1916238, MULT_RACE: 76770}]);
        done();
      })
    })

    it('calc= option works', function(done) {
      var input = [
        {POP: 200, INCOME: 20000, GROUP: "A", NAME: "Apple"},
        {POP: 400, INCOME: 15000, GROUP: "B", NAME: "Beet"},
        {POP: 600, INCOME: 8000, GROUP: "A", NAME: "Ant"}];
      var copy = JSON.parse(JSON.stringify(input));
      var target = [
        {INCOMES: [20000,8000], TOTPOP: 800, MAXPOP: 600, MINPOP: 200, n: 2, GROUP: "A", NAMES: ['Apple', 'Ant']},
        {INCOMES: [15000], TOTPOP: 400, MAXPOP: 400, MINPOP: 400, n: 1, GROUP: "B", NAMES: ['Beet']}];

      var calc = "INCOMES=collect(INCOME), TOTPOP=sum(POP), MAXPOP=max(POP), MINPOP=min(POP), n=count(), NAMES=collect(NAME)";
      var cmd = '-i data.json -dissolve GROUP calc="' + calc + '" -o';
      api.applyCommands(cmd, {'data.json': input}, function(err, output) {
        assert.deepEqual(JSON.parse(output['data.json']), target);
        assert.deepEqual(input, copy);
        done();
      });
    });

    it('calc= assigning to same var name does not modify original data', function(done) {
      var input = [
        {POP: 200, MAXINCOME: 20000, GROUP: "A", NAME: "Apple"},
        {POP: 400, MAXINCOME: 15000, GROUP: "B", NAME: "Beet"},
        {POP: 600, MAXINCOME: 8000, GROUP: "A", NAME: "Ant"}];
      var copy = JSON.parse(JSON.stringify(input));
      var target = [
        {MAXINCOME: 20000, POP: 1200,  NAME: 'Apple'}];

      var calc = "MAXINCOME=max(MAXINCOME), POP=sum(POP), NAME = first(NAME)";
      var cmd = '-i data.json -dissolve calc="' + calc + '" -o';
      api.applyCommands(cmd, {'data.json': input}, function(err, output) {
        assert.deepEqual(JSON.parse(output['data.json']), target);
        assert.deepEqual(input, copy);
        done();
      });
    });

    /*
    // THIS NO LONGER WORKS -- in order to support assingment to same-named variables,
    // First-pass collect() function could no longer return an array

    it('calc= option: collect().join() works', function(done) {
      var input = [
        {POP: 200, NAME: "Apple"},
        {POP: 400, NAME: "Beet"},
        {POP: 600, NAME: "Ant"}];
      var copy = JSON.parse(JSON.stringify(input));
      var target = [
        {POPS:"200,400,600", NAMES: "Apple,Beet,Ant"}];

      var calc = "POPS=collect(POP).join(','), NAMES=collect(NAME).join(',')";
      var cmd = '-i data.json -dissolve calc="' + calc + '" -o';
      api.applyCommands(cmd, {'data.json': input}, function(err, output) {
        assert.deepEqual(JSON.parse(output['data.json']), target);
        assert.deepEqual(input, copy);
        done();
      });
    });
    */

  })

  describe('dissolve()', function() {

    it('dissolves a layer with no geometry', function() {
      var lyr = {
        data: new api.internal.DataTable([{foo: 1, bar: 2}, {foo: 2, bar: 3}, {foo: 2, bar: 4}])
      };
      var lyr2 = api.cmd.dissolve(lyr, null, {field: 'foo', sum_fields: ['bar']})
      assert.deepEqual(lyr2.data.getRecords(), [{foo: 1, bar: 2}, {foo: 2, bar: 7}]);
    })

    describe('two adjacent triangles', function () {

      //      b --- d
      //     / \   /
      //    /   \ /
      //   a --- c
      //
      //   cab, bc, bdc
      //   0,   1,  2

      var arcs = [[[3, 1], [1, 1], [2, 3]], [[2, 3], [3, 1]], [[2, 3], [4, 3], [3, 1]]];
      var arcData = new ArcCollection(arcs);

      // Handle arcs with a kink
      it('bugfix 2 (abnormal topology) test 1', function() {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 2}]),
              shapes: [[[0, 1, ~1, 1]], [[~1, 1, ~1, 2]]]
            };
        var lyr2 = dissolve(lyr, arcData, {field:'foo'});
        assert.deepEqual(lyr2.shapes, [[[0, 1]], [[~1, 2]]]);
      })

      it('bugfix 2 (abnormal topology) test 2', function() {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 1}]),
              shapes: [[[0, 1, ~1, 1]], [[~1, 1, ~1, 2]]]
            };
        var lyr2 = dissolve(lyr, arcData, {field: 'foo'});
        assert.deepEqual(lyr2.shapes, [[[0, 2]]]);
      })

      it('dissolve on "foo" 1', function() {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 1}]),
              shapes: [[[0, 1]], [[-2, 2]]]
            };
        var lyr2 = dissolve(lyr, arcData, {field: 'foo'});
        assert.deepEqual(lyr2.shapes, [[[0, 2]]]);
        assert.deepEqual(lyr2.data.getRecords(), [{foo: 1}])
      })

      it('dissolve on "foo" 2', function() {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 1}]),
              shapes: [[[0, 1]], [[2, -2]]]
            };
        var lyr2 = dissolve(lyr, arcData, {field: 'foo'});
        assert.deepEqual(lyr2.shapes, [[[0, 2]]]);
      })

      it('dissolve on "foo" 3', function() {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 1}]),
              shapes: [[[1, 0]], [[2, -2]]]
            };
        var lyr2 = dissolve(lyr, arcData, {field: 'foo'});
        assert.deepEqual(lyr2.shapes, [[[0, 2]]]);
      })

      it('dissolve on null, no data table', function() {
        var lyr = {
              geometry_type: 'polygon',
              shapes: [[[1, 0]], [[2, -2]]]
            };
        var lyr2 = dissolve(lyr, arcData, {});
        assert.deepEqual(lyr2.shapes, [[[0, 2]]]);
        assert.ok(!lyr2.data);
      })

      it('dissolve on null + data table', function() {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 1}]),
              shapes: [[[1, 0]], [[2, -2]]]
            };
        var lyr2 = dissolve(lyr, arcData, {});
        assert.deepEqual(lyr2.shapes, [[[0, 2]]]);
        assert.deepEqual(lyr2.data.getRecords(), [{}]); // empty table (?)
      })

      it('dissolve on "foo" with null shapes', function() {
        var records = [{foo: 2}, {foo: 1}, {foo: 1}, {foo: 1}];
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable(records),
              shapes: [null, [[0, 1]], [[-2, 2]], null]
            };
        var lyr2 = dissolve(lyr, arcData, {field: 'foo'});
        assert.deepEqual(lyr2.data.getRecords(), [{foo: 2}, {foo: 1}])
        assert.deepEqual(lyr2.shapes, [null, [[0, 2]]]);
      })

      it('dissolve on "foo" with null shapes 2', function() {
        var records = [{foo: 1}, {foo: 1}, {foo: 1}, {foo: 2}];
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable(records),
              shapes: [null, [[0, 1]], [[-2, 2]], null]
            };
        var lyr2 = dissolve(lyr, arcData, {field: 'foo'});
        assert.deepEqual(lyr2.data.getRecords(), [{foo: 1}, {foo: 2}])
        assert.deepEqual(lyr2.shapes, [[[0, 2]], null]);
      })

      it('no dissolve', function() {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 2}]),
              shapes: [[[0, 1]], [[-2, 2]]]
            };
        var lyr2 = dissolve(lyr, arcData, {field: 'foo'});
        assert.deepEqual(lyr2.shapes, [[[0, 1]], [[-2, 2]]]);
      })

      it('bugfix 1 test 1', function() {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 1}]),
              shapes: [[[0, 1]], [[~1, ~0], [2, 0]]]
            };
        var lyr2 = dissolve(lyr, arcData, {field: 'foo'});
        assert.deepEqual(lyr2.shapes, [[[2, 0]]]);
        assert.deepEqual(lyr2.data.getRecords(), [{foo: 1}])
      })

      it('bugfix 1 test 2', function() {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 1}]),
              shapes: [[[0, 1]], [[2, 0], [~1, ~0]]]
            };
        var lyr2 = dissolve(lyr, arcData, {field: 'foo'});
        assert.deepEqual(lyr2.shapes, [[[2, 0]]]);
        assert.deepEqual(lyr2.data.getRecords(), [{foo: 1}])
      })

      it('bugfix 1 test 3', function() {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 1}]),
              shapes: [[[0, 2], [~1, ~0]], [[1, 0]]]
            };
        var lyr2 = dissolve(lyr, arcData, {field: 'foo'});
        assert.deepEqual(lyr2.shapes, [[[0, 2]]]);
        assert.deepEqual(lyr2.data.getRecords(), [{foo: 1}])
      })


    })

    describe('two islands', function () {

      //      b     d --- e
      //     / \     \   /
      //    /   \     \ /
      //   a --- c     f
      //
      //   cabc, defd
      //   0,    1

      var arcs = [[[3, 1], [1, 1], [2, 3], [3, 1]],
          [[4, 3], [6, 3], [5, 1], [4, 3]]];
      var arcData = new ArcCollection(arcs);

      it('no dissolve', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 1}]),
              shapes: [[[0]], [[1]]]
            };
        var lyr2 = dissolve(lyr, arcData, {field: 'foo'});
        assert.deepEqual(lyr2.shapes, [[[0], [1]]]);
      })

      it('no dissolve 2', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 2}]),
              shapes: [[[0]], [[1]]]
            };
        var lyr2 = dissolve(lyr, arcData, {field: 'foo'});
        assert.deepEqual(lyr2.shapes, [[[0]], [[1]]]);
      })
    })

    describe('simple hole', function () {

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
      //   0,     1

      var arcs = [[[3, 4], [4, 3], [3, 2], [2, 3], [3, 4]],
          [[3, 5], [5, 3], [3, 1], [1, 3], [3, 5]]];
      var arcData = new ArcCollection(arcs);

      it('empty hole', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}]),
              shapes: [[[0], [-2]]]
            };
        var lyr2 = dissolve(lyr, arcData, {field: 'foo'});
        assert.deepEqual(lyr2.shapes, [[[0], [-2]]]);
      })

      it('dissolve filled hole', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 1}]),
              shapes: [[[0], [-2]], [[1]]]
            };
        var lyr2 = dissolve(lyr, arcData, {field: 'foo'});
        assert.deepEqual(lyr2.shapes, [[[0]]]);
      })

      it('dissolve filled hole 2', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 1}]),
              shapes: [[[1]], [[-2], [0]]]
            };
        var lyr2 = dissolve(lyr, arcData, {field: 'foo'});
        assert.deepEqual(lyr2.shapes, [[[0]]]);
      })

      it('no dissolve filled hole', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 2}]),
              shapes: [[[0], [-2]], [[1]]]
            };
        var lyr2 = dissolve(lyr, arcData, {field: 'foo'});
        assert.deepEqual(lyr2.shapes, [[[0], [-2]], [[1]]]);
      })
    })

    describe('shape 1', function () {

      //       e
      //      /|\
      //     / | \
      //    /  a  \
      //   /  / \  \
      //  h  d   b  f
      //   \  \ /  /
      //    \  c  /
      //     \   /
      //      \ /
      //       g
      //
      //   abcda, ae, efghe
      //   0,     1,  2

      var arcs = [[[3, 4], [4, 3], [3, 2], [2, 3], [3, 4]],
          [[3, 4], [3, 5]],
          [[3, 5], [5, 3], [3, 1], [1, 3], [3, 5]]];
      var arcData = new ArcCollection(arcs);

      // TODO: is this the desired behavior?
      it('dissolve a shape into itself', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}]),
              shapes: [[[1, 2, -2, -1]]]
            };
        var lyr2 = dissolve(lyr, arcData, {field: 'foo'});
        assert.deepEqual(lyr2.shapes, [[[2],[-1]]]);
      })
    })

    describe('shape 2', function () {

      //       e
      //      /|\
      //     / | \
      //    /  a  \
      //   /  / \  \
      //  h  d   b  f
      //   \  \ /  /
      //    \  c  /
      //     \ | /
      //      \|/
      //       g
      //
      //   abc,  cda,  ae,   efg, gc,   ghe
      //   0/-1, 1/-2, 2/-3, 3,   4/-5, 5

      var arcs = [[[3, 4], [4, 3], [3, 2]],
          [[3, 2], [2, 3], [3, 4]],
          [[3, 4], [3, 5]],
          [[3, 5], [5, 3], [3, 1]],
          [[3, 1], [3, 2]],
          [[3, 1], [1, 3], [3, 5]]];
      var arcData = new ArcCollection(arcs);

      it('dissolve two of three shapes', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 1}, {foo: 2}]),
              shapes: [[[0, 1]], [[2, 3, 4, -1]], [[5, -3, -2, -5]]]
            };
        var lyr2 = dissolve(lyr, arcData, {field: 'foo'});
        assert.deepEqual(lyr2.shapes,
            [[[1, 2, 3, 4]], [[5, -3, -2, -5]]]);
        assert.deepEqual(lyr2.data.getRecords(), [{foo: 1}, {foo: 2}]);
      })

      it('dissolve everything', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 1}, {foo: 1}]),
              shapes: [[[0, 1]], [[2, 3, 4, -1]], [[5, -3, -2, -5]]]
            };
        var lyr2 = dissolve(lyr, arcData, {field: 'foo'});
        assert.deepEqual(lyr2.shapes, [[[3, 5]]]);
      })

      it('dissolve two shapes around an empty hole', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 1}]),
              shapes: [[[2, 3, 4, -1]], [[5, -3, -2, -5]]]
            };
        var lyr2 = dissolve(lyr, arcData, {field: 'foo'});
        assert.deepEqual(lyr2.shapes, [[[3, 5], [-1, -2]]]);
      })


      it('dissolve two shapes around a filled hole', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 1}, {foo: 2}]),
              shapes: [[[2, 3, 4, -1]], [[5, -3, -2, -5]], [[0, 1]]]
            };
        var lyr2 = dissolve(lyr, arcData, {field: 'foo'});
        assert.deepEqual(lyr2.shapes, [[[3, 5], [-1, -2]], [[0, 1]]]);
      })
    })


    describe('shape 3', function () {

      //
      //  d -- e -- a
      //  |   / \   |
      //  |  g - f  |
      //  |         |
      //  c ------- b
      //
      //   abcde, efge, ea
      //   0,     1,    3

      var arcs = [[[5, 3], [5, 1], [1, 1], [1, 3], [3, 3]],
          [[3, 3], [4, 2], [2, 2], [3, 3]],
          [[3, 3], [5, 3]]];
      var arcData = new ArcCollection(arcs);

      it('odd shape', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 1}]),
              shapes: [[[0, ~1, 2]], [[1]]]
            };
        var lyr2 = dissolve(lyr, arcData, {field: 'foo'});
        assert.deepEqual(lyr2.shapes, [[[0, 2]]]);

      })
    })

    describe('shape 4', function () {

      //
      //  d -- e -- a
      //  |   /|\   |
      //  |  h | f  |
      //  |   \|/   |
      //  |    g    |
      //  |         |
      //  c ------- b
      //
      //   abcde, efg,  eg,   ghe,  ea
      //   0,     1/-2, 2/-3, 3/-4, 4

      var arcs = [[[5, 4], [5, 1], [1, 1], [1, 4], [3, 4]],
          [[3, 4], [4, 3], [3, 2]],
          [[3, 4], [3, 2]],
          [[3, 2], [2, 3], [3, 4]],
          [[3, 4], [5, 4]]];
      var arcData = new ArcCollection(arcs);

      it('dissolve all', function () {
        var lyr = {
              geometry_type: 'polygon',
              data: new api.internal.DataTable([{foo: 1}, {foo: 1}, {foo: 1}]),
              shapes: [[[0, ~3, ~1, 4]], [[2, 3]], [[1, ~2]]]
            };
        var lyr2 = dissolve(lyr, arcData, {field: 'foo'});
        assert.deepEqual(lyr2.shapes, [[[0, 4]]]);
      })

    })
  })
})
