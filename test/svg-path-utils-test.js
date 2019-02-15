
var api = require('..'),
    assert = require('assert'),
    SVG = api.internal.svg;

describe('svg-path-utils.js', function () {

  describe('findArcCenter()', function () {
    it('tests', function () {
      SVG.findArcCenter([0, 0], [10, 0], 90 * Math.PI / 180);
    })
  })
});
