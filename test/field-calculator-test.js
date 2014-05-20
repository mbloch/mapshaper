var assert = require('assert'),
    api = require("../"),
    ArcCollection = api.internal.ArcCollection;

describe('mapshaper-field-calculator.js', function () {
  describe('evaluateLayer()', function () {
    var nullArcs = new api.internal.ArcCollection([]);
    it('create new numeric field', function () {
      var records = [{}, {}];
      var lyr = {
        shapes: [],
        data: new api.internal.DataTable(records)
      };
      api.evaluateLayer(lyr, nullArcs, "FOO=0");
      assert.deepEqual(records, [{FOO:0}, {FOO:0}]);
    })

    it('create new string field', function () {
      var records = [{}, {}];
      var lyr = {
        shapes: [],
        data: new api.internal.DataTable(records)
      };
      api.evaluateLayer(lyr, nullArcs, "FOO=''");
      assert.deepEqual(records, [{FOO:''}, {FOO:''}]);
    })

    it('delete a field', function () {
      var records = [{foo:'mice'}, {foo:'beans'}];
      var lyr = {
        shapes: [],
        data: new api.internal.DataTable(records)
      };
      api.evaluateLayer(lyr, nullArcs, "delete foo");
      assert.deepEqual(records, [{}, {}]);
    })

    it('update a field', function () {
      var records = [{foo:'mice'}, {foo:'beans'}];
      var lyr = {
        shapes: [],
        data: new api.internal.DataTable(records)
      };
      api.evaluateLayer(lyr, nullArcs, "foo=foo.substr(0, 2)");
      assert.deepEqual(records, [{foo:'mi'}, {foo:'be'}]);
    })

    it('test $.partCount', function () {
      var records = [{}, {}];
      var lyr = {
        shapes: [[[0, 2], [-2]], null],
        data: new api.internal.DataTable(records)
      };
      api.evaluateLayer(lyr, nullArcs, "parts=$.partCount");
      assert.deepEqual(records, [{parts: 2}, {parts: 0}]);
    })

    it('create records if none existed', function () {
      var lyr = {
        shapes: [[[0, 2], [-2]], null]
      };
      api.evaluateLayer(lyr, nullArcs, "parts=$.partCount");
      assert.deepEqual(lyr.data.getRecords(), [{parts: 2}, {parts: 0}]);
    })

    it('handle null properties', function () {
      var lyr = {
        shapes: [null, null],
        data: new api.internal.DataTable([null, {'a': 13}])
      };
      api.evaluateLayer(lyr, nullArcs, "FID=$.id");
      assert.deepEqual(lyr.data.getRecords(), [{FID: 0}, {a: 13, FID: 1}]);
    })

    it('rename a field', function () {
      var records = [{foo:'mice'}, {foo:'beans'}];
      var lyr = {
        shapes: [],
        data: new api.internal.DataTable(records)
      };
      api.evaluateLayer(lyr, nullArcs, "bar = foo, delete foo");
      assert.deepEqual(records, [{bar: 'mice'}, {bar: 'beans'}]);
    })

    it('data record is available as $.properties', function () {
      var records = [{foo:'mice'}, {foo:'beans'}];
      var lyr = {
        shapes: [],
        data: new api.internal.DataTable(records)
      };
      api.evaluateLayer(lyr, nullArcs, "valid = $.properties.foo === foo");
      assert.deepEqual(records, [{foo: 'mice', valid: true}, {foo: 'beans', valid: true}]);
    })

    it('Create records by assigning to $.properties', function () {
      var lyr = {
        shapes: [null, null],
        data: null
      };
      api.evaluateLayer(lyr, nullArcs, "$.properties = {FID: $.id}");
      assert.deepEqual(lyr.data.getRecords(), [{FID: 0}, {FID: 1}]);
    })

    it('Replace records by assigning to $.properties', function () {
      var records = [{foo:'mice'}, {foo:'beans'}];
      var lyr = {
        shapes: [null, null],
        data: new api.internal.DataTable(records)
      };
      api.evaluateLayer(lyr, nullArcs, "$.properties = {menu: foo}");
      assert.deepEqual(lyr.data.getRecords(), [{menu: 'mice'}, {menu: 'beans'}]);
    })

    it('use Math.sqrt() to transform a field', function () {
      var records = [{foo:4}, {foo:0}];
      var lyr = {
        shapes: [],
        data: new api.internal.DataTable(records)
      };
      api.evaluateLayer(lyr, nullArcs, "bar=Math.sqrt(foo); delete foo");
      assert.deepEqual(records, [{bar: 2}, {bar: 0}]);
    })

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
        api.evaluateLayer(lyr, arcs, "x=$.centroidX, y=$.centroidY");
        assert.deepEqual(lyr.data.getRecords(), [{x: 1.5, y: 2.5}, {x: 2, y: 1.5}, {x: null, y: null}])
      })

      it ("$.partCount and $.isNull", function() {
        api.evaluateLayer(lyr, arcs, "parts=$.partCount, isNull=$.isNull");
        assert.deepEqual(lyr.data.getRecords(), [{parts: 1, isNull: false}, {parts: 2, isNull: false}, {parts: 0, isNull: true}])
      })
      /*
      it ("$.area and $.originalArea", function() {
        api.evaluateLayer(lyr, arcs, "area=$.area, area2=$.originalArea");
        assert.deepEqual(lyr.data.getRecords(), [{area: 1, area2: 1}, {area: 3, area2: 3}, {area: 0, area2: 0}])
      })
      */

      it ("$.height and $.width", function() {
        api.evaluateLayer(lyr, arcs, "h=$.height, w=$.width");
        assert.deepEqual(lyr.data.getRecords(), [{w: 1, h: 1}, {w: 2, h: 2}, {w: 0, h: 0}])
      })

      it ("$.bounds", function() {
        api.evaluateLayer(lyr, arcs, "bb=$.bounds");
        assert.deepEqual(lyr.data.getRecords(), [{bb: [1, 2, 2, 3]}, {bb: [1, 1, 3, 3]}, {bb: []}])
      })

    })

  })

})
