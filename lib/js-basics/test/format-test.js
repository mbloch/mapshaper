var api = require('../'),
  assert = require('assert'),
  Utils = api.Utils;

describe('textutils.js', function () {
  describe('addThousandsSep()', function () {
    it("positive integers", function() {
      assert.equal('0', Utils.addThousandsSep('0'));
      assert.equal('10', Utils.addThousandsSep('10'));
      assert.equal('100', Utils.addThousandsSep('100'));
      assert.equal('1,000', Utils.addThousandsSep('1000'));
      assert.equal('10,000', Utils.addThousandsSep('10000'));
      assert.equal('100,000', Utils.addThousandsSep('100000'));
      assert.equal('1,000,000', Utils.addThousandsSep('1000000'));
    })

    it("negative integers", function() {
      assert.equal('-1', Utils.addThousandsSep('-1'));
      assert.equal('-10', Utils.addThousandsSep('-10'));
      assert.equal('-100', Utils.addThousandsSep('-100'));
      assert.equal('-1,000', Utils.addThousandsSep('-1000'));
      assert.equal('-10,000', Utils.addThousandsSep('-10000'));
      assert.equal('-100,000', Utils.addThousandsSep('-100000'));
      assert.equal('-1,000,000', Utils.addThousandsSep('-1000000'));
    })

    it("decimal numbers", function() {
      assert.equal('0.0', Utils.addThousandsSep('0.0'));
      assert.equal('100.21', Utils.addThousandsSep('100.21'));
      assert.equal('1,000.011', Utils.addThousandsSep('1000.011'));
      assert.equal('-10,000.011', Utils.addThousandsSep('-10000.011'));
   }) 

  })

  describe('formatNumber()', function () {
    it('correct decimals and comma sep.', function () {
      assert.equal('1,000.3', Utils.formatNumber(1000.26, 1))
    })
  })
})


describe('format.js', function () {

  describe("Utils.format", function() {
    it("%f", function() {
      assert.equal("1", Utils.format("%f", 1));
      assert.equal("1", Utils.format("%f", 1));
      assert.equal("1.5", Utils.format("%f", 1.5));
      assert.equal("1.005", Utils.format("%f", 1.005));
    })

    it("%.3f", function() {
      assert.equal("0.002", Utils.format("%.3f", 0.002));
      assert.equal("0.000", Utils.format("%.3f", 0));
      assert.equal("1.500", Utils.format("%.3f", 1.49999999));
    })
  })
})