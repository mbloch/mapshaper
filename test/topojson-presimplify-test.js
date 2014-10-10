var assert = require('assert'),
    api = require("../"),
    topojson = api.internal.topojson;


describe('topojson-presimplify.js', function () {
  describe('getZScaler(5000, 500)', function () {
    var fromZ = topojson.getZScaler(5000, 500);
    it('Infinity -> 1', function () {
      assert.equal(fromZ(Infinity), 1);
    })

    it('0 -> 1', function() {
      assert.equal(fromZ(0), 1);
    })

    it('1 -> 10', function() {
      assert.equal(fromZ(1), 10);
    });

    it('5 -> 2', function() {
      assert.equal(fromZ(5), 2);
    });
  })
})
