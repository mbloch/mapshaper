var api = require('../'),
  assert = require('assert');


describe('mapshaper-scalebar.js', function () {
  it('parseScalebarLabelToKm()', function () {
    it ('tests', function() {
      var toKm = 1.60934;
      var parse = api.internal.parseScalebarLabelToKm;
      assert(parse('1 mile'), toKm);
      assert(parse('1 MILE'), toKm);
      assert(parse('1 / 2 MILE'), 1 / 2 * toKm);
      assert(parse('1/2 MILE'), 1 / 2 * toKm);
      assert(parse('0.5 MILE'), 0.5 * toKm);
      assert(parse('1km'), 1);
      assert(parse('1 kilometer'), 1);
      assert(parse('5 kilometres'), 5);
      assert(parse('1,000 KILOMETERS'), 1000);
    })
  })
})