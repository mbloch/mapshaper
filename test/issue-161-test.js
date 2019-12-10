var api = require('../'),
    assert = require('assert');

describe('issue 161', function () {

  it ('simplification is applied to SVG output', function(done) {
    api.applyCommands('-i test/data/two_states.shp -o a.svg -simplify 10% -o b.svg', null, function(err, output) {
      assert(output['a.svg'].length > output['b.svg'].length);
      done();
    });
  });
})
