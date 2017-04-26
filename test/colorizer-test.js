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

  it('generates a classed color scheme', function (done) {
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

  describe('getColorizerFunction()', function () {

    it('matches categories', function() {
      var f = api.internal.getColorizerFunction({nodata: 'pink', other: 'white', colors: ['red', 'blue'], categories: ['lepen', 'macron']});
      assert.equal(f('lepen'), 'red');
      assert.equal(f('macron'), 'blue');
      assert.equal(f('fillon'), 'white');
      assert.equal(f(''), 'pink');
    })

    it('colors parameter is required', function () {
      assert.throws(testInvalidOpts({categories: ['a', 'b']}))
    })

    it('mismatched colors and categories', function () {
      assert.throws(testInvalidOpts({categories: ['a', 'b'], colors: ['blue']}))
      assert.throws(testInvalidOpts({categories: ['a', 'b'], colors: ['blue', 'red', 'green']}))
    })

    it('mismatched breaks and colors', function () {
      assert.throws(testInvalidOpts({colors: ['a', 'b'], breaks: [0, 1]}))
      assert.throws(testInvalidOpts({colors: ['a', 'b'], breaks: []}))
    })

    it('invalid breaks', function () {
      assert.throws(testInvalidOpts({colors: ['red', 'blue'], breaks: [NaN]}))
      assert.throws(testInvalidOpts({colors: ['red', 'blue'], breaks: [1, 0]}))
    })


  })

})
