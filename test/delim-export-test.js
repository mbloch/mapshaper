var api = require('../'),
    assert = require('assert');

describe('mapshaper-delim-export.js', function() {

  describe('exportDelimTable()', function() {
    it('objects are exported as JSON', function() {
      var data = new api.internal.DataTable([{foo: {}, bar: {a: 2}}]);
      var csv = api.internal.exportDelimTable({data: data}, ',');
      var target = 'foo,bar\n{},"{""a"":2}"';
      assert.equal(csv, target);
    });

    it('arrays are exported as JSON', function() {
      var data = new api.internal.DataTable([{foo: [], bar: ["a", "b"]}]);
      var csv = api.internal.exportDelimTable({data: data}, ',');
      var target = 'foo,bar\n[],"[""a"",""b""]"';
      assert.equal(csv, target);
    });
  });

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

    it('semicolons are preserved', function() {
      var input = 'a;b;c\nfoo;0.3;0';
      assert.equal(roundtrip(input), input);
    })

    it('empty strings are preserved', function() {
      var input = 'a,b,c\nfoo,3,\n,,';
      assert.equal(roundtrip(input), input);
    })

  })

})
