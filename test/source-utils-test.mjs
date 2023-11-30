import api from '../mapshaper.js';
import assert from 'assert';
var internal = api.internal;

describe('mapshaper-source-utils.js', function () {
  describe('convertInterpolatedName()', function () {
    it('interpolate layer name', function () {
      var lyr = {
        name: 'diagram'
      };
      var name = internal.convertInterpolatedName('my-${target}', lyr);
      assert.equal(name, 'my-diagram');
    });

    it('interpolate expression', function () {
      var lyr = {
        name: 'diagram-0'
      };
      var name = internal.convertInterpolatedName('layer-${target.split("-")[1]}', lyr);
      assert.equal(name, 'layer-0');
    });

    it('interpolate string literal', function () {
      var lyr = {
        name: 'layer1'
      };
      var name = internal.convertInterpolatedName('${"points"}', lyr);
      assert.equal(name, 'points');
    });
  })
})
