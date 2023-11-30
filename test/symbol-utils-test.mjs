
import { findArcCenter } from '../src/symbols/mapshaper-symbol-utils';
import api from '../mapshaper.js';
import assert from 'assert';


describe('mapshaper-symbol-utils.js', function () {

  describe('findArcCenter()', function () {
    it('tests', function () {
      findArcCenter([0, 0], [10, 0], 90 * Math.PI / 180);
    })
  })
});
