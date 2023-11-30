import api from '../mapshaper.js';
import assert from 'assert';

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
      api.internal.stashVar('defs', {});
      assert.doesNotThrow(function() {
        api.cmd.colorizer({name: 'rgb', colors: ['black'], categories: ['foo']});
      });
      assert.throws(function() {
        api.cmd.colorizer({name: 'stroke', colors: ['black'], categories: ['foo']});
      });
      assert.throws(function() {
        api.cmd.colorizer({name: 'r', colors: ['black'], categories: ['foo']});
      });
      assert.throws(function() {
        api.cmd.colorizer({name: 'stroke-width', colors: ['black'], categories: ['foo']});
      });
      assert.throws(function() {
        api.cmd.colorizer({name: 'fill', colors: ['black'], categories: ['foo']});
      });
      assert.throws(function() {
        api.cmd.colorizer({name: 'opacity', colors: ['black'], categories: ['foo']});
      });
      api.internal.clearStash();
    });
  })


  describe('getColorizerFunction()', function () {

    it('matches categories', function() {
      var f = api.internal.getColorizerFunction({nodata: 'pink', other: 'white', colors: ['red', 'blue'], categories: ['lepen', 'macron']});
      assert.equal(f('lepen'), 'red');
      assert.equal(f('macron'), 'blue');
      assert.equal(f('fillon'), 'white');
      assert.equal(f(''), 'pink');
    })

    it('random colors are consistent when called with a value', function() {
      var f = api.internal.getColorizerFunction({colors: ['red', 'blue'], random: true});
      var n = 1000;
      var obj = {};
      var obj2 = {};
      while (n-- > 0) {
        obj[f('foo')] = true;
        obj2[f(n)] = true;
      }
      assert.equal(Object.keys(obj).length, 1);
      assert.deepEqual(Object.keys(obj2).sort(), ['blue', 'red']);
    });

    it('random colors are pseudorandom when function is called without a value', function() {
      var f = api.internal.getColorizerFunction({colors: ['red', 'blue', 'green'], random: true});
      var n = 1000;
      var obj = {};
      while (n-- > 0) {
        obj[f()] = true;
      }
      assert.deepEqual(Object.keys(obj).sort(), ['blue', 'green', 'red'])
    });

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
      // assert.throws(testInvalidOpts({colors: ['red', 'blue'], breaks: [1, 0]}))
    })

  })

})
