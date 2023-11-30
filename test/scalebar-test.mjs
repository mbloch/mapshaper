import api from '../mapshaper.js';
import assert from 'assert';


describe('mapshaper-scalebar.js', function () {
  it('parseScalebarLabelToKm()', function () {
    var toKm = 1.60934;
    var parse = api.internal.parseScalebarLabelToKm;
    assert.equal(parse('1 mile'), toKm);
    assert.equal(parse('1 MILE'), toKm);
    assert.equal(parse('1 / 2 MILE'), 1 / 2 * toKm);
    assert.equal(parse('1/2 MILE'), 1 / 2 * toKm);
    assert.equal(parse('0.5 MILE'), 0.5 * toKm);
    assert.equal(parse('1km'), 1);
    assert.equal(parse('1 kilometer'), 1);
    assert.equal(parse('5 kilometres'), 5);
    assert.equal(parse('1,000 KILOMETERS'), 1000);
  })

  it('formatDistanceLabelAsMiles()', function() {
    var format = api.internal.formatDistanceLabelAsMiles;
    assert.equal(format('1,000'), '1,000 MILES')
    assert.equal(format('1'), '1 MILE')
    assert.equal(format('1.5'), '1.5 MILES')
    assert.equal(format('1/8'), '1/8 MILE')
  })
})
