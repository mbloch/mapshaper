var api = require('../'),
    assert = require('assert');

describe('mapshaper-stringify.js', function () {
  describe('getFormattedStringify', function () {
    it('Numerical arrays in an approved list are formatted with spaces', function () {
      var obj = {
        bbox: [-1,0,1,2]
      };
      var stringify = api.internal.getFormattedStringify(['bbox']);
      assert.equal(stringify(obj), '{\n\t"bbox": [-1, 0, 1, 2]\n}');
    })
  })
})
