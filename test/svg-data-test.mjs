import api from '../mapshaper.js';
import assert from 'assert';
var SVG = api.internal.svg;
var internal = api.internal;


describe('svg-data (mapshaper-svg.js)', function () {

  describe('-o svg-data', function () {
    it('-o svg-data=* exports all fields', function (done) {
      var geojson = {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [1, 1]
        },
        properties: {
          r: 5,
          id: 'r5w',
          value: 32,
          name: 'Sullivan',
          CODE: 32 // skipped
        }
      };
      var cmd = "-i point.json -o svg-data=* format=svg";
      api.applyCommands(cmd, {'point.json': geojson}, function(err, out) {
        var svg = out['point.svg'];
        assert(svg.indexOf('data-id="r5w"') > -1);
        assert(svg.indexOf('data-name="Sullivan"') > -1);
        assert(svg.indexOf('data-value="32"') > -1);
        done();
      });
    })
  })

  describe('validateSvgDataFields()', function () {
    it('error if one or more fields are missing from all layers', function () {
      var layer = {
        data: new internal.DataTable([{foo: 'bar'}])
      }
      assert.throws(function() {
        internal.validateSvgDataFields([layer], ['baz'])
      })
    })
    it('no error if one or more layer contains all fields', function () {
      var layers = [{
        data: new internal.DataTable([{foo: 'bar'}])
      }, {
        data: new internal.DataTable([{bar: 'foo'}])
      }]
      internal.validateSvgDataFields(layers, ['foo', 'bar']);
      assert(true); // no error was thrown
    })
  })

  describe('exportDataAttributesForSVG()', function () {

    it('invalid data-* attribute names are removed', function () {
      var records = [{
        "23": 'a',
        "": 'b',
        "xml": 'c',
        "CODE": 'd',
        "👍ok": 'e'
      }];
      var expect = [{'data-code': 'd'}]; // UC names are lowercased
      var fields = Object.keys(records[0]);
      var out = api.internal.exportDataAttributesForSVG(records, fields);
      assert.deepEqual(out, expect)
    })

    it('falsy data values', function() {
      var records = [{
        "a": '',
        "b": null,
        "c": undefined,
        "d": NaN
      }];
      var expect = [{
        "data-a": '',
        "data-b": 'null',
        "data-c": 'undefined',
        "data-d": 'NaN'
      }];
      var fields = Object.keys(records[0]);
      var out = api.internal.exportDataAttributesForSVG(records, fields);
      assert.deepEqual(out, expect)
    })


    it('special characters in attribute values', function() {
      var records = [{
        "a": '"a"',
        "b": '<TBD>',
        "c": "it's",
        "d": 'this & that'
      }];
      var fields = Object.keys(records[0]);
      var out = api.internal.exportDataAttributesForSVG(records, fields);
      // special characters are replaced downstream
      var str = SVG.stringifyProperties(out[0]);
      var expect = ' data-a="&quot;a&quot;" data-b="&lt;TBD&gt;" data-c="it&apos;s" data-d="this &amp; that"';
      assert.equal(str, expect)
    })

  })
})
