var api = require('../'),
    assert = require('assert');

describe('mapshaper-delim-export.js', function() {

  describe('import/export roundtrip', function() {
    function roundtrip(str) {
      var dataset = api.internal.importDelim(str, {});
      var output = api.internal.exportDelim(dataset, {});
      return output[0].content;
    }
    it('strings and numbers are preserved', function() {
      var input = 'a,b,c\nfoo,0,3';
      assert.equal(roundtrip(input), input);
    })

    it('empty strings are preserved', function() {
      var input = 'a,b,c\nfoo,3,\n,,';
      assert.equal(roundtrip(input), input);
    })

  })

})
