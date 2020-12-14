var api = require('..'),
    assert = require('assert');

describe('mapshaper-symbols.js', function () {

  describe('buildSymbol()', function () {
    it('supports type=arrow', function () {
      var input = {
        type: 'arrow',
        length: 10,
        stroke: 'blue',
        'stroke-width': 1.5
      };
      var output = api.internal.buildSymbol(input);
      var target = {
        type: 'polyline',
        coordinates: [[[0, 0], [0, -10]]],
        stroke: 'blue',
        'stroke-width': 1.5
      };
      assert.equal(output.type, 'polyline');
      // arrow changed to add head... this just tests the stem
      // TODO: test arrowhead coords
      assert.deepEqual(output.coordinates[0], [[0, 0], [0, -10]]);
    })

  })

});