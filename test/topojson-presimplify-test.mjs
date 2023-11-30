import assert from 'assert';
import api from '../mapshaper.js';
var topojson = api.internal.topojson;

describe('topojson-presimplify.js', function () {
  describe('getPresimplifyFunction(100000)', function () {
    var fromZ = topojson.getPresimplifyFunction(100000);
    it('Infinity -> 0', function () {
      assert.equal(fromZ(Infinity), 0);
    })

    it('0 -> 0', function() {
      assert.equal(fromZ(0), 0);
    })

    it('1 -> 100', function() {
      assert.equal(fromZ(100), 10);
    });

    it('5 -> 500', function() {
      assert.equal(fromZ(500), 50);
    });
  })
})
