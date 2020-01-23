var assert = require('assert'),
    api = require("../"),
    ArcCollection = api.internal.ArcCollection;

describe('mapshaper-each-calc.js', function () {

  describe('evaluateEachFeature()', function () {
    var nullArcs = new api.internal.ArcCollection([]);
    it('create new numeric field', function () {
      var records = [{}, {}];
      var lyr = {
        data: new api.internal.DataTable(records)
      };
      api.evaluateEachFeature(lyr, null, "FOO=0");
      assert.deepEqual(records, [{FOO:0}, {FOO:0}]);
    })

    it('create new string field', function () {
      var records = [{}, {}];
      var lyr = {
        data: new api.internal.DataTable(records)
      };
      api.evaluateEachFeature(lyr, null, "FOO=''");
      assert.deepEqual(records, [{FOO:''}, {FOO:''}]);
    })

    it('delete a field', function () {
      var records = [{foo:'mice'}, {foo:'beans'}];
      var lyr = {
        data: new api.internal.DataTable(records)
      };
      api.evaluateEachFeature(lyr, nullArcs, "delete foo");
      assert.deepEqual(records, [{}, {}]);
    })

    it('use arrow function', function () {
      var records = [{foo:[1,2,3]}];
      var lyr = {
        data: new api.internal.DataTable(records)
      };
      api.evaluateEachFeature(lyr, nullArcs, "foo = foo.map(n => n+1).join('')");
      assert.deepEqual(records, [{foo: '234'}]);
    })

    it('update a field', function () {
      var records = [{foo:'mice'}, {foo:'beans'}];
      var lyr = {
        data: new api.internal.DataTable(records)
      };
      api.evaluateEachFeature(lyr, nullArcs, "foo=foo.substr(0, 2)");
      assert.deepEqual(records, [{foo:'mi'}, {foo:'be'}]);
    })

    it('this.properties exposes feature data', function() {
      var records = [{'label-text':'Finland'}, {'label-text':'Sweden'}];
      var lyr = {
        data: new api.internal.DataTable(records)
      };
      api.evaluateEachFeature(lyr, nullArcs, "this.properties['label-text'] = this.properties['label-text'].toUpperCase()");
      assert.deepEqual(records, [{'label-text':'FINLAND'}, {'label-text':'SWEDEN'}]);
    })

    it('"d" is equivalent to "this.properties"', function() {
      var records = [{'label-text':'Finland'}, {'label-text':'Sweden'}];
      var lyr = {
        data: new api.internal.DataTable(records)
      };
      api.evaluateEachFeature(lyr, nullArcs, "d['label-text'] = d['label-text'].toUpperCase()");
      assert.deepEqual(records, [{'label-text':'FINLAND'}, {'label-text':'SWEDEN'}]);
    })

    it('test $.partCount', function () {
      var records = [{}, {}];
      var lyr = {
        geometry_type: 'polygon',
        shapes: [[[0, 2], [-2]], null],
        data: new api.internal.DataTable(records)
      };
      api.evaluateEachFeature(lyr, nullArcs, "parts=$.partCount");
      assert.deepEqual(records, [{parts: 2}, {parts: 0}]);
    })

    it('create records if none existed', function () {
      var lyr = {
        geometry_type: 'polygon',
        shapes: [[[0, 2], [-2]], null]
      };
      api.evaluateEachFeature(lyr, nullArcs, "parts=$.partCount");
      assert.deepEqual(lyr.data.getRecords(), [{parts: 2}, {parts: 0}]);
    })

    it('handle null properties', function () {
      var lyr = {
        shapes: [null, null],
        data: new api.internal.DataTable([null, {'a': 13}])
      };
      api.evaluateEachFeature(lyr, nullArcs, "FID=$.id");
      assert.deepEqual(lyr.data.getRecords(), [{FID: 0}, {a: 13, FID: 1}]);
    })

    it('rename a field', function () {
      var records = [{foo:'mice'}, {foo:'beans'}];
      var lyr = {
        shapes: [],
        data: new api.internal.DataTable(records)
      };
      api.evaluateEachFeature(lyr, nullArcs, "bar = foo, delete foo");
      assert.deepEqual(records, [{bar: 'mice'}, {bar: 'beans'}]);
    })

    it('data record is available as $.properties', function () {
      var records = [{foo:'mice'}, {foo:'beans'}];
      var lyr = {
        shapes: [],
        data: new api.internal.DataTable(records)
      };
      api.evaluateEachFeature(lyr, nullArcs, "valid = $.properties.foo === foo");
      assert.deepEqual(records, [{foo: 'mice', valid: true}, {foo: 'beans', valid: true}]);
    })

    it('Create records by assigning to $.properties', function () {
      var lyr = {
        shapes: [null, null],
        data: null
      };
      api.evaluateEachFeature(lyr, nullArcs, "$.properties = {FID: $.id}");
      assert.deepEqual(lyr.data.getRecords(), [{FID: 0}, {FID: 1}]);
    })

    it('Replace records by assigning to $.properties', function () {
      var records = [{foo:'mice'}, {foo:'beans'}];
      var lyr = {
        geometry_type: 'polygon',
        shapes: [null, null],
        data: new api.internal.DataTable(records)
      };
      api.evaluateEachFeature(lyr, nullArcs, "$.properties = {menu: foo}");
      assert.deepEqual(lyr.data.getRecords(), [{menu: 'mice'}, {menu: 'beans'}]);
    })

    it('Missing properties evaluate to null', function() {
      var records = [{foo:'mice'}, {}];
      var lyr = {
        data: new api.internal.DataTable(records)
      };
      api.evaluateEachFeature(lyr, nullArcs, "bar = foo");
      assert.deepEqual(lyr.data.getRecords(), [{foo:'mice', bar: 'mice'}, {
        bar: null
      }]);
    });

    it('use Math.sqrt() to transform a field', function () {
      var records = [{foo:4}, {foo:0}];
      var lyr = {
        shapes: [],
        data: new api.internal.DataTable(records)
      };
      api.evaluateEachFeature(lyr, nullArcs, "bar=Math.sqrt(foo); delete foo");
      assert.deepEqual(records, [{bar: 2}, {bar: 0}]);
    })

    it('Use a where= expression to exclude some records', function () {
      var records = [{foo:4, bar: 'a'}, {foo:0, bar: 'b'}];
      var lyr = {
        shapes: [],
        data: new api.internal.DataTable(records)
      };
      api.evaluateEachFeature(lyr, nullArcs, "foo = 22", {"where": "bar == 'b'"});
      assert.deepEqual(records, [{foo: 4, bar: 'a'}, {foo: 22, bar: 'b'}]);
    })

    it('Fix: Semicolons in expressions are preserved', function() {
      var records = [{foo: 'As'}];
      var lyr = {
        data: new api.internal.DataTable(records)
      };
      api.evaluateEachFeature(lyr, nullArcs, "foo = 'A&raquo;s'; bar=''", {"where": "!/;/.test(foo)"});
      assert.deepEqual(records, [{foo: 'A&raquo;s', bar: ''}]);
    })

    describe('Point geometry', function() {
      it ('x and y getters are implemented', function() {
        var lyr = {
          geometry_type: 'point',
          shapes: [[[0, 1]], [[2, 3], [3, 4]], null]
        };
        api.evaluateEachFeature(lyr, null, "x=$.x, y=$.y");
        assert.deepEqual(lyr.data.getRecords(), [{x: 0, y: 1}, {x: 2, y: 3}, {x: null, y: null}]);
      })

      it ('x and y setters are implemented', function() {
        var lyr = {
          geometry_type: 'point',
          shapes: [[[0, 1]], [[2, 3], [3, 4]], null]
        };
        // first point of multipoint is set; null shapes are ignored (for now)
        api.evaluateEachFeature(lyr, null, "$.x = 0, $.y = 0");
        assert.deepEqual(lyr.shapes, [[[0, 0]], [[0, 0], [3, 4]], null]);
      })

      it ('point coords are exposed', function() {
        var lyr = {
          geometry_type: 'point',
          shapes: [[[0, 1]], [[2, 3], [3, 4]]]
        };
        api.evaluateEachFeature(lyr, null, "x=$.coordinates[0][0], y=$.coordinates[0][1]");
        assert.deepEqual(lyr.data.getRecords(), [{x: 0, y: 1}, {x: 2, y: 3}]);
      })
    });

    describe('$.length for polygons', function() {
      it ('polygon perimeter and polyline length are the same', function(done) {
        // bit of a kludge to copy polygon perimeter to generated line features
        var cmd = '-i test/data/two_states.json no-topology -each "perimeter = this.perimeter" ' +
          '-lines each="perimeter = A.perimeter" -each "length = this.length" -o';
        api.applyCommands(cmd, function(err, out) {
          var features = JSON.parse(out['two_states.json']).features;
          assert.equal(features[0].properties.perimeter, features[0].properties.length);
          assert.equal(features[1].properties.perimeter, features[1].properties.length);
          done();
        });
      });

    });

    describe('test $.innerPct', function() {
      //
      //  a -- b -- c
      //  |    |    |
      //  d -- e -- f
      //
      //  h -- i
      //  |    |
      //  g--- j
      //
      var geojson = {
        type: 'GeometryCollection',
        geometries: [{
          type: 'Polygon',
          coordinates: [[[1,3], [1, 4], [2, 4], [2, 3], [1, 3]]]
        }, {
          type: 'Polygon',
          coordinates: [[[2,3], [2, 4], [3, 4], [3, 3], [2, 3]]]
        }, {
          type: 'Polygon',
          coordinates: [[[1,1], [1, 2], [2, 2], [2, 1], [1, 1]]]
        }]
      };

      it('test 1', function(done) {
        var cmd = '-i in.json -each "pct = this.innerPct" -o out.json format=json';
        api.applyCommands(cmd, {'in.json': geojson}, function(err, out) {
          var json = JSON.parse(out['out.json']);
          assert.equal(json.length, 3);
          assert.deepEqual(json[2], {pct: 0})
          // value of first two features is not exactly 0.25,
          // because coordinates are interpreted as lat-long, so
          // great circle distance is used
          assert.equal(Math.round(json[0].pct * 100), 25);
          assert.equal(Math.round(json[1].pct * 100), 25);
          done();
        })
      })
    });

    describe('Shape geometry', function() {
      //
      //  a -- b -- c
      //  |    |    |
      //  d -- e -- f
      //  |         |
      //  g ------- i
      //
      // dab, be, ed, bcf, fe, figd
      // 0,   1,  2,  3,   4,  5
      //
      var lyr = {
        geometry_type: 'polygon',
        data: null,
        shapes: [[[0, 1, 2]], [[3, 4, ~1], [5, ~2, ~4]], null]
      }
      var arcs = [[[1, 2], [1, 3], [2, 3]],
          [[2, 3], [2, 2]],
          [[2, 2], [1, 2]],
          [[2, 3], [3, 3], [3, 2]],
          [[3, 2], [2, 2]],
          [[3, 2], [3, 1], [1, 1], [1, 2]]];
      arcs = new ArcCollection(arcs);

      beforeEach(function() {
        lyr.data = null;
      })

      it ("$.centroidX and $.centroidY", function() {
        api.evaluateEachFeature(lyr, arcs, "x=$.centroidX, y=$.centroidY");
        assert.deepEqual(lyr.data.getRecords(), [{x: 1.5, y: 2.5}, {x: 2, y: 1.5}, {x: null, y: null}])
      })

      it ("$.partCount and $.isNull", function() {
        api.evaluateEachFeature(lyr, arcs, "parts=$.partCount, isNull=$.isNull");
        assert.deepEqual(lyr.data.getRecords(), [{parts: 1, isNull: false}, {parts: 2, isNull: false}, {parts: 0, isNull: true}])
      })
      /*
      it ("$.area and $.originalArea", function() {
        api.evaluateEachFeature(lyr, arcs, "area=$.area, area2=$.originalArea");
        assert.deepEqual(lyr.data.getRecords(), [{area: 1, area2: 1}, {area: 3, area2: 3}, {area: 0, area2: 0}])
      })
      */

      it ("$.height and $.width", function() {
        api.evaluateEachFeature(lyr, arcs, "h=$.height, w=$.width");
        assert.deepEqual(lyr.data.getRecords(), [{w: 1, h: 1}, {w: 2, h: 2}, {w: 0, h: 0}])
      })

      it ("$.bounds", function() {
        api.evaluateEachFeature(lyr, arcs, "bb=$.bounds");
        assert.deepEqual(lyr.data.getRecords(), [{bb: [1, 2, 2, 3]}, {bb: [1, 1, 3, 3]}, {bb: []}])
      })

    })

  })

})
