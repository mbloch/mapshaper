import assert from 'assert';
import { getFormattedStringify } from '../src/geojson/mapshaper-stringify';


describe('mapshaper-stringify.js', function () {
  describe('getFormattedStringify', function () {
    it('Numerical arrays in an approved list are formatted with spaces', function () {
      var obj = {
        bbox: [-1,0,1,2]
      };
      var stringify = getFormattedStringify(['bbox']);
      assert.equal(stringify(obj), '{\n  "bbox": [-1, 0, 1, 2]\n}');
    })
  })
})
