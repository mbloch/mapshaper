var api = require('../'),
  assert = require('assert');

describe('mapshaper-colorizer.js', function () {

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
})
