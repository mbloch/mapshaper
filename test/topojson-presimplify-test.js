var assert = require('assert'),
    api = require("../"),
    topojson = api.internal.topojson;


describe('topojson-presimplify.js', function () {
  describe('getZScaler(100)', function () {
    var fromZ = topojson.getZScaler(100);
    it('Infinity -> 0', function () {
      assert.equal(fromZ(Infinity), 0);
    })

    it('0 -> 0', function() {
      assert.equal(fromZ(0), 0);
    })

    it('1 -> 100', function() {
      assert.equal(fromZ(1), 100);
    });

    it('5 -> 500', function() {
      assert.equal(fromZ(5), 500);
    });
  })
})
