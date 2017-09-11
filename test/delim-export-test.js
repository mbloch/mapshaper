var api = require('../'),
    internal = api.internal,
    assert = require('assert');

describe('mapshaper-delim-export.js', function() {

  describe('csv export with encoding=', function () {
    // iconv-lite's latin1 output changed in version 0.4.16 (? replacement stopped working)
    // reverted to v0.4.15
    it('latin-1', function (done) {
      var iconv = require('iconv-lite');
      var buf = new Buffer('foo,bar\nétranger,外国人');
      var buf2 = iconv.encode('foo,bar\nétranger,外国人', 'latin1');
      api.applyCommands('-i input.csv -o output.csv encoding=latin-1', {'input.csv': buf}, function(err, output) {
        var csv = output['output.csv'];
        var str = internal.decodeString(csv, 'latin-1');
        assert.equal(str, 'foo,bar\nétranger,???');
        done();
      });
    })
    it('ascii', function (done) {
      var buf = new Buffer('foo,bar\nétranger,外国人');
      api.applyCommands('-i input.csv -o output.csv encoding=ascii', {'input.csv': buf}, function(err, output) {
        var csv = output['output.csv'];
        var str = internal.decodeString(csv, 'ascii');
        assert.equal(str, 'foo,bar\n?tranger,???')
        done();
      });
    })
    it('utf-16be', function (done) {
      var buf = new Buffer('foo,bar\nétranger,外国人');
      api.applyCommands('-i input.csv -o output.csv encoding=utf-16be', {'input.csv': buf}, function(err, output) {
        var csv = output['output.csv'];
        var str = internal.decodeString(csv, 'utf-16be');
        assert.equal(str, 'foo,bar\nétranger,外国人')
        done();
      });
    })
  })

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
