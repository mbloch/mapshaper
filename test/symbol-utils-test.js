
import { findArcCenter } from '../src/symbols/mapshaper-symbol-utils';
var api = require('..'),
    assert = require('assert');

describe('mapshaper-symbol-utils.js', function () {

  describe('findArcCenter()', function () {
    it('tests', function () {
      findArcCenter([0, 0], [10, 0], 90 * Math.PI / 180);
    })
  })
});
