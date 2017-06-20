var api = require('../'),
  assert = require('assert');

describe('mapshaper-colorizer.js', function () {
  function colorizer(opts) {
    return api.internal.getColorizerFunction(opts);
  }

  function testInvalidOpts(opts) {
    return function() {
      colorizer(opts);
    }
  }

  describe('-colorizer command', function () {

    it('colors= and breaks= options define a sequential color scheme', function (done) {
      var data = [{pct:0}, {pct:10}, {pct:12}, {pct:20}, {pct: 99}, {pct: NaN}];
      var expected = [{pct:0, col: 'white'}, {pct:10, col: 'pink'},
        {pct:12, col: 'pink'}, {pct:20, col: 'yellow'}, {pct: 99, col: 'yellow'},
        {pct: null, col: 'grey'}];
      api.applyCommands('-i d.json -colorizer name=getColor breaks=10,20 colors=white,pink,yellow nodata=grey -each "col=getColor(pct)" -o',
          {'d.json': data}, function(err, output) {
            var result = JSON.parse(output['d.json']);
            assert.deepEqual(result, expected);
            done();
          });
    });

    it('svg style properties are reserved words', function() {
      assert.doesNotThrow(function() {
        api.colorizer({name: 'rgb', colors: ['black'], categories: ['foo']});
      });
      assert.throws(function() {
        api.colorizer({name: 'stroke', colors: ['black'], categories: ['foo']});
      });
      assert.throws(function() {
        api.colorizer({name: 'r', colors: ['black'], categories: ['foo']});
      });
      assert.throws(function() {
        api.colorizer({name: 'stroke-width', colors: ['black'], categories: ['foo']});
      });
      assert.throws(function() {
        api.colorizer({name: 'fill', colors: ['black'], categories: ['foo']});
      });
      assert.throws(function() {
        api.colorizer({name: 'opacity', colors: ['black'], categories: ['foo']});
      });

    });
  })

  describe('getSequentialColorFunction()', function () {
    it('non-numeric data should not be coerced to numbers', function () {
      var f = api.internal.getSequentialColorFunction(['red', 'blue'], [10]);
      assert.strictEqual(f(0), 'red');
      assert.strictEqual(f(null), null);
      assert.strictEqual(f(), null);
      assert.strictEqual(f(NaN), null);
      assert.strictEqual(f([0]), null);
      assert.strictEqual(f("0"), null);
      assert.strictEqual(f(""), null);
      assert.strictEqual(f([]), null);
      assert.strictEqual(f({}), null);
    })

    it('all color classes are reachable', function () {
      var f = api.internal.getSequentialColorFunction(['red', 'white', 'blue'], [0, 10]);
      assert.strictEqual(f(-1), 'red');
      assert.strictEqual(f(0), 'white');
      assert.strictEqual(f(5), 'white');
      assert.strictEqual(f(10), 'blue');
      assert.strictEqual(f(15), 'blue');
    })
  })

  describe('getColorizerFunction()', function () {

    it('matches categories', function() {
      var f = api.internal.getColorizerFunction({nodata: 'pink', other: 'white', colors: ['red', 'blue'], categories: ['lepen', 'macron']});
      assert.equal(f('lepen'), 'red');
      assert.equal(f('macron'), 'blue');
      assert.equal(f('fillon'), 'white');
      assert.equal(f(''), 'pink');
    })

    it('default no-data color is white', function() {
      var f = api.internal.getColorizerFunction({colors: ['red', 'blue'], categories: ['lepen', 'macron']});
      assert.equal(f(''), 'white');
    })

    it('error if colors parameter is missing', function () {
      assert.throws(testInvalidOpts({categories: ['a', 'b']}))
    })

    it('error if mismatched colors and categories', function () {
      assert.throws(testInvalidOpts({categories: ['a', 'b'], colors: ['blue']}))
      assert.throws(testInvalidOpts({categories: ['a', 'b'], colors: ['blue', 'red', 'green']}))
    })

    it('error if mismatched breaks and colors', function () {
      assert.throws(testInvalidOpts({colors: ['a', 'b'], breaks: [0, 1]}))
      assert.throws(testInvalidOpts({colors: ['a', 'b'], breaks: []}))
    })

    it('error if invalid breaks', function () {
      assert.throws(testInvalidOpts({colors: ['red', 'blue'], breaks: [NaN]}))
      assert.throws(testInvalidOpts({colors: ['red', 'blue'], breaks: [1, 0]}))
    })

  })

})
