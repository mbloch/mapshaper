import assert from 'assert';
import api from '../mapshaper.js';


describe('mapshaper-split.js', function () {

  describe('-split command', function () {
    it('test 1', function(done) {
      var cmd = "-i test/data/two_states.shp -split STATE";
      api.internal.testCommands(cmd, function(err, data) {
        assert.equal(data.layers.length, 2);
        assert.equal(data.layers[0].shapes.length, 1);
        assert.equal(data.layers[1].shapes.length, 1);
        done();
      })
    })

    it('argument is a field name but not a valid expression', async function() {
      var data = [{
        'ISO3166-1': 'alpha'
      }, {
        'ISO3166-1': 'beta'
      }];
      var cmd = '-i data.json -split ISO3166-1 -o';
      var output = await api.applyCommands(cmd, {'data.json': data});
      assert.deepEqual(output, {
        'alpha.json': '[{"ISO3166-1":"alpha"}]',
        'beta.json': '[{"ISO3166-1":"beta"}]'
      });

    });
  })

  describe('splitLayer()', function () {
    it('divides a layer into multiple named layers', function () {
      var records = [{foo: "spruce"}, {foo: "fir"}, {foo: "apple"}, {foo: "fir"}];
      var lyr = {
        name: "trees",
        data: new api.internal.DataTable(records),
        shapes: [[[0]], [[1], [2]], null, [[3]]]
      };
      var layers = api.cmd.splitLayer(lyr, 'foo');
      assert.equal(layers.length, 3)
      assert.deepEqual(layers[0].data.getRecords(), [{foo: 'spruce'}]);
      assert.deepEqual(layers[0].shapes, [[[0]]]);
      assert.equal(layers[0].name, 'spruce')
      assert.deepEqual(layers[1].data.getRecords(), [{foo: "fir"}, {foo: "fir"}]);
      assert.deepEqual(layers[1].shapes, [[[1], [2]], [[3]]]);
      assert.equal(layers[1].name, 'fir')
      assert.deepEqual(layers[2].data.getRecords(), [{foo: 'apple'}]);
      assert.deepEqual(layers[2].shapes, [null]);
      assert.equal(layers[2].name, 'apple')
    })

    it('Fix: numerical values are converted to string names', function () {
      var records = [{foo: 0}, {foo: -1}, {foo: 1}, {foo: 1}];
      var lyr = {
        name: 'bar',
        data: new api.internal.DataTable(records),
        shapes: [[[0, -2]], [[1], [2, 4]], null, [[3, 4]]]
      };
      var layers = api.cmd.splitLayer(lyr, 'foo');
      assert.equal(layers.length, 3)
      assert.strictEqual(layers[0].name, '0');
      assert.strictEqual(layers[1].name, '-1')
      assert.strictEqual(layers[2].name, '1')
    })

    it('Splitting with an expression also sets layer name', function () {
      var records = [{foo: 0}, {foo: -1}, {foo: 1}, {foo: 1}];
      var lyr = {
        name: 'bar',
        data: new api.internal.DataTable(records),
        shapes: [[[0, -2]], [[1], [2, 4]], null, [[3, 4]]]
      };
      var layers = api.cmd.splitLayer(lyr, '"layer_" + foo');
      assert.equal(layers.length, 3)
      assert.strictEqual(layers[0].name, 'layer_0');
      assert.strictEqual(layers[1].name, 'layer_-1')
      assert.strictEqual(layers[2].name, 'layer_1')
    })

    it('Non-string values are coerced to strings', function () {
      var records = [{foo: 0}, {foo: null}, {foo: undefined}
        , {foo: false}, {foo: true}];
      var lyr = {
        name: 'bar',
        data: new api.internal.DataTable(records)
      };
      var layers = api.cmd.splitLayer(lyr, 'foo');
      assert.strictEqual(layers[0].name, '0');
      assert.strictEqual(layers[1].name, 'null')
      assert.strictEqual(layers[2].name, 'undefined')
      assert.strictEqual(layers[3].name, 'false')
      assert.strictEqual(layers[4].name, 'true')
    })

    it('Issue #123 if layer is unnamed and a field is given, do not add a prefix to output layers', function () {
      var records = [{foo: 'a'}, {foo: 'b'}];
      var lyr = {
        data: new api.internal.DataTable(records)
      };
      var layers = api.cmd.splitLayer(lyr, 'foo');
      assert.equal(layers.length, 2)
      assert.equal(layers[0].name, 'a');
      assert.equal(layers[1].name, 'b')
    })

    it('Handle layer with no shapes', function() {
      var lyr = {
        data: new api.internal.DataTable([{foo: 'a'}, {foo: 'b'}])
      };
      var layers = api.cmd.splitLayer(lyr, 'foo');
      assert.deepEqual(layers[0].data.getRecords(), [{foo: 'a'}])
      assert.deepEqual(layers[1].data.getRecords(), [{foo: 'b'}])
    });

    it('Split all shapes (no field)', function() {
      var lyr = {
        data: new api.internal.DataTable([{foo: 'a'}, {foo: 'b'}])
      };
      var layers = api.cmd.splitLayer(lyr);
      assert.deepEqual(layers[0].data.getRecords(), [{foo: 'a'}])
      assert.deepEqual(layers[1].data.getRecords(), [{foo: 'b'}])
    });

    it('Split all shapes if layer has no data', function() {
      var lyr = {
        geometry_type: 'point',
        shapes: [[[0, 0]], [[0, 1]]]
      };
      var layers = api.cmd.splitLayer(lyr);
      assert.deepEqual(layers, [{
        name: 'split-1',
        data: null,
        geometry_type: 'point',
        shapes: [[[0, 0]]]
      }, {
        name: 'split-2',
        data: null,
        geometry_type: 'point',
        shapes: [[[0, 1]]]
      }]);
    });

    it('Split all features if no field is given', function() {
      var records = [{foo: 0}, {foo: -1}, {foo: 1}, {foo: 1}];
      var lyr = {
        data: new api.internal.DataTable(records),
        shapes: [[[0, -2]], [[1], [2, 4]], null, [[3, 4]]]
      };
      var layers = api.cmd.splitLayer(lyr);
      assert.equal(layers.length, 4)
      assert.equal(layers[0].name, 'split-1');
      assert.equal(layers[1].name, 'split-2')
      assert.equal(layers[2].name, 'split-3')
      assert.equal(layers[3].name, 'split-4')

      assert.deepEqual(layers[0].shapes, [[[0, -2]]])
      assert.deepEqual(layers[1].shapes, [[[1], [2, 4]]])
      assert.deepEqual(layers[2].shapes, [null])
      assert.deepEqual(layers[3].shapes, [[[3, 4]]])

      assert.deepEqual(layers[0].data.getRecords(), [{foo: 0}]);
      assert.deepEqual(layers[3].data.getRecords(), [{foo: 1}]);
    })
  })
})
