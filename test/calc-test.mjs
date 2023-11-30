import assert from 'assert';
import api from '../mapshaper.js';

var evalCalcExpression = api.internal.evalCalcExpression,
    DataTable = api.internal.DataTable;

describe('mapshaper-calc.js', function () {

  describe('-calc command', function() {
    it('results are available to -each expressions', function(done) {
      var data = [{a: 1}, {a: 3}];
      var cmd = '-i data.json -calc "SUM = sum(a)" -each "pct = a / SUM * 100" -o';
      var expect = [{a: 1, pct: 25}, {a: 3, pct: 75}];
      api.applyCommands(cmd, {'data.json': data}, function(err, out) {
        assert.deepEqual(JSON.parse(out['data.json']), expect);
        done();
      });
    })

    it('+ option creates a new layer', async function() {
      var data = [{a: 1}, {a: 3}];
      var cmd = 'data.json -calc + "sum(a)" -o out.csv';
      var out = await api.applyCommands(cmd, {'data.json': data});
      assert.equal(out['out.csv'], 'expression,value,layer_name\nsum(a),4,data')
    })
  });

  describe('evalCalcExpression()', function () {
    var data1 = [{foo: -1}, {foo: 3}, {foo: 4}],
        lyr1 = {
          data: new DataTable(data1)
        };

    it ('first() captures value of first record', function() {
      var result = evalCalcExpression(lyr1, null, 'first(foo)');
      assert.equal(result, -1);
    })

    it ('every() works a bit like Array#every()', function() {
      var result = evalCalcExpression(lyr1, null, 'every(foo > -2)');
      var result2 = evalCalcExpression(lyr1, null, 'every(foo > 0)');
      assert.strictEqual(result, true);
      assert.strictEqual(result2, false);
    })

    it ('some() works a bit like Array#some()', function() {
      var result = evalCalcExpression(lyr1, null, 'some(foo > 0)');
      var result2 = evalCalcExpression(lyr1, null, 'some(foo > 10)');
      assert.strictEqual(result, true);
      assert.strictEqual(result2, false);
    })

    it ('last() captures value of last record', function() {
      var result = evalCalcExpression(lyr1, null, 'last(foo)');
      assert.equal(result, 4);
    })

    it ('mode() picks first among equals', function() {
      var result = evalCalcExpression(lyr1, null, 'mode(foo)');
      assert.equal(result, -1);
    })

    it ('mode() picks most common string value', function() {
      var lyr = {
        data: new DataTable([{bar: 'a'}, {bar: 'b'}, {bar: 'a'}, {bar: 'c'}])
      }
      var result = evalCalcExpression(lyr, null, 'mode(bar)');
      assert.equal(result, 'a');
    })

    it ('mode() picks most common numerical value', function() {
      var lyr = {
        data: new DataTable([{bar: 0}, {bar: 0}, {bar: 1}, {bar: 2}])
      }
      var result = evalCalcExpression(lyr, null, 'mode(bar)');
      assert.strictEqual(result, 0);
    })

    it ('sum()', function() {
      var result = evalCalcExpression(lyr1, null, 'sum(foo)');
      assert.equal(result, 6);
    })

   it ('sum() expects a number', function() {
      assert.throws(function() {
        evalCalcExpression(lyr1, null, 'sum("foo")');
      })
    })

    it ('average()', function() {
      var result = evalCalcExpression(lyr1, null, 'average(foo)');
      assert.equal(result, 2);
    })

    it ('mean()', function() {
      var result = evalCalcExpression(lyr1, null, 'mean(foo)');
      assert.equal(result, 2);
    })

    it ('average()', function() {
      var result = evalCalcExpression(lyr1, null, 'average(foo + 2)');
      assert.equal(result, 4);
    })

    it ('median()', function() {
      var result = evalCalcExpression(lyr1, null, 'median(foo)');
      assert.equal(result, 3);
    })

    it ('quartile1()', function() {
      var result = evalCalcExpression(lyr1, null, 'quartile1(foo)');
      assert.equal(result, 1);
    })

    it ('quartile2()', function() {
      var result = evalCalcExpression(lyr1, null, 'quartile2(foo)');
      assert.equal(result, 3);
    })

    it ('quartile3()', function() {
      var result = evalCalcExpression(lyr1, null, 'quartile3(foo)');
      assert.equal(result, 3.5);
    })


    it ('iqr()', function() {
      var result = evalCalcExpression(lyr1, null, 'iqr(foo)');
      assert.equal(result, 2.5);
    })

    it ('quantile()', function() {
      var result = evalCalcExpression(lyr1, null, 'quantile(foo, 0.5)');
      assert.equal(result, 3);
    })

    it ('min()', function() {
      var result = evalCalcExpression(lyr1, null, 'min(foo)');
      assert.equal(result, -1);
    })

    it ('max()', function() {
      var result = evalCalcExpression(lyr1, null, 'max(foo)');
      assert.equal(result, 4);
    })

    it ('count()', function() {
      var result = evalCalcExpression(lyr1, null, 'count()');
      assert.equal(result, 3);
    })

    it ('sum() / count()', function() {
      var result = evalCalcExpression(lyr1, null, 'sum(foo) / count()');
      assert.equal(result, 2);
    })

    it ('width() and height() functions', function() {
      var lyr = {
        geometry_type: 'point',
        shapes: [[[0, 1]], [[2, 0]]]
      };
      var result = evalCalcExpression(lyr, null, 'width() * height()');
      assert.equal(result, 2);
    });

    it ('sum(this.planarArea) works', function() {
      var arcs = new api.internal.ArcCollection([[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]);
      var lyr = {
        geometry_type: 'polygon',
        arcs: arcs,
        shapes: [[[0]]]
      };
      var result = evalCalcExpression(lyr, arcs, 'sum(this.planarArea)');
      assert.equal(result, 1);
    });


    it ('where= expression excludes a record', function() {
      var data2 = [
          {foo: -1, bar: true},
          {foo: 3, bar: false},
          {foo: 4, bar: true},
          {foo: 0, bar: true}];
      var lyr2 = {
            data: new api.internal.DataTable(data2)
          };

      var result = api.cmd.calc([lyr2], null,
          {to_layer: true, expression: 'average(foo)', where: '!!bar'});
      assert.deepEqual(result.layers[0].data.getRecords(), [{
        value: 1,
        where: '!!bar',
        expression: 'average(foo)'
      }]);
    })
  })

})
