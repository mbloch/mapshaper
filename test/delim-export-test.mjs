import api from '../mapshaper.js';
import assert from 'assert';
var internal = api.internal;
var utils = api.utils;
import iconv from 'iconv-lite';

describe('mapshaper-delim-export.js', function() {

  describe('getDelimValueFormatter()', function () {
    var csv = api.internal.getDelimValueFormatter(',');
    var tsv = api.internal.getDelimValueFormatter('\t');
    it('Applies quotes when needed', function () {
      assert.equal(csv('"'), '""""');
      assert.equal(csv('"yes" or "no"'), '"""yes"" or ""no"""');
      assert.equal(csv('\n\n'), '"\n\n"');
      assert.equal(csv('a\r'), '"a\r"');
      assert.equal(csv(',,'), '",,"');
      assert.equal(csv('\t'), '\t');
      assert.equal(tsv(',,'), ',,');
      assert.equal(tsv('\t'), '"\t"');
      assert.equal(tsv('a\tb'), '"a\tb"');
    })
    it('Number formatting', function () {
      assert.equal(csv(0), '0');
      assert.equal(csv(-45), '-45');
      assert.equal(csv(5.6), '5.6');
    })
    it('Decimal comma', function() {
      var csv = api.internal.getDelimValueFormatter(',', {decimal_comma: true});
      assert.equal(csv(0), '"0"');
      assert.equal(csv(5.6), '"5,6"');
      assert.equal(csv(-0.66), '"-0,66"');
    })

  })

  describe('csv export with encoding=', function () {
    // iconv-lite's latin1 output changed in version 0.4.16 (? replacement stopped working)
    // reverted to v0.4.15
    it('latin-1', function (done) {
      var buf = utils.createBuffer('foo,bar\nétranger,外国人');
      var buf2 = iconv.encode('foo,bar\nétranger,外国人', 'latin1');
      api.applyCommands('-i input.csv -o output.csv encoding=latin-1', {'input.csv': buf}, function(err, output) {
        var csv = output['output.csv'];
        var str = internal.decodeString(csv, 'latin-1');
        assert.equal(str, 'foo,bar\nétranger,???');
        done();
      });
    })
    it('ascii', function (done) {
      var buf = utils.createBuffer('foo,bar\nétranger,外国人');
      api.applyCommands('-i input.csv -o output.csv encoding=ascii', {'input.csv': buf}, function(err, output) {
        var csv = output['output.csv'];
        var str = internal.decodeString(csv, 'ascii');
        assert.equal(str, 'foo,bar\n?tranger,???')
        done();
      });
    })
    it('utf-16be', function (done) {
      var buf = utils.createBuffer('foo,bar\nétranger,外国人');
      api.applyCommands('-i input.csv -o output.csv encoding=utf-16be', {'input.csv': buf}, function(err, output) {
        var csv = output['output.csv'];
        var str = internal.decodeString(csv, 'utf-16be');
        assert.equal(str, 'foo,bar\nétranger,外国人')
        done();
      });
    })
  })

  describe('exportLayerAsDSV()', function() {
    it('>10000 rows are exported as Buffer by default', function() {
      var rows = [],
          i=0;
      while(i++ < 10001) {
        rows.push({i: i, foo: 'bar'});
      }
      var layer = {data: new internal.DataTable(rows)};
      var buf = internal.exportLayerAsDSV(layer, ',');
      var str = buf.toString();
      var lines = str.split('\n');
      assert(Buffer.isBuffer(buf));
      assert.equal(lines.length, 10002);
      assert.equal(lines[0], 'i,foo');
      assert.equal(lines[lines.length - 1], '10001,bar');
      // and as string if to_string option is passed
      assert.equal(internal.exportLayerAsDSV(layer, ',', {to_string: true}), str);
    })

    it('objects are exported as JSON', function() {
      var data = new api.internal.DataTable([{foo: {}, bar: {a: 2}}]);
      var csv = api.internal.exportLayerAsDSV({data: data}, ',');
      var target = 'foo,bar\n{},"{""a"":2}"';
      assert.equal(csv, target);
    });

    it('booleans are exported as "true" and "false"', function() {
      var data = new api.internal.DataTable([{foo: true, bar: false}]);
      var csv = api.internal.exportLayerAsDSV({data: data}, ',');
      var target = 'foo,bar\ntrue,false';
      assert.equal(csv, target);
    })

    it('arrays are exported as JSON', function() {
      var data = new api.internal.DataTable([{foo: [], bar: ["a", "b"]}]);
      var csv = api.internal.exportLayerAsDSV({data: data}, ',');
      var target = 'foo,bar\n[],"[""a"",""b""]"';
      assert.equal(csv, target);
    });
  });

  describe('field_order= option', function () {
    it('field-order=ascending sorts in case-insensitive A-Z order', function () {
      var str = 'Z,A,b,D,c\nfoo,foo,foo,foo,bar';
      var dataset = api.internal.importDelim(str, {});
      var output = api.internal.exportLayerAsDSV(dataset.layers[0], ',', {field_order: 'ascending'});
      assert.equal(output, 'A,b,c,D,Z\nfoo,foo,bar,foo,foo');
    })
  })

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

    it('quoting is applied correctly', function() {
      var a = 'a,b,c,d,e\n"""",",,","a\nb","c\r",\t';
      var b = 'a|b|c|d|e\n""""|"||"|"a\nb"|"c\r"|,';
      assert.equal(roundtrip(a), a);
      assert.equal(roundtrip(b), b);
    })

  })

})
