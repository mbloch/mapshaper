import api from '../mapshaper.js';
import assert from 'assert';
import { evalTemplateExpression, parseTemplate, hasFunctionCall, parseTemplateParts } from '../src/expressions/mapshaper-template-expressions';

describe('mapshaper-template-expressions.js', function () {

  describe('parseTemplateParts()', function() {
    it('test1', function() {
      var arr = parseTemplateParts('{1}{"foo":"bar"} {good({})}');
      assert.deepEqual(arr, [ '', '{1}', '{"foo":"bar"} ', '{good({})}', '' ]);
    })

    it('test2', function() {
      var arr = parseTemplateParts('-proj {getProj()}');
      assert.deepEqual(arr, [ '-proj ', '{getProj()}', '' ]);
    })
  })

  it('parseTemplate()', function() {
    var matches = parseTemplate('{"a"}');
    assert.deepEqual(matches, ['"a"']);
  })

  it('hasFunctionCall()', function() {
    assert(hasFunctionCall('doubleMe(1)', {doubleMe: val => 2 * val}))
  })

  describe('evalTemplateExpression()', function() {
    it ('interpolates values from expressions enclosed in {}', async function() {
      var val = await evalTemplateExpression('1 {2} {"3"} {sum(2, 2)} { sum(5, 0) }', null, { sum: (a, b) => a + b });
      assert.equal(val, '1 2 3 4 5');
    })

    it ('runs global functions', async function() {
      var val = await evalTemplateExpression('doubleMe({1 + 2})', null, {doubleMe: val => 2 * val});
      assert.equal(val, 6);
    })

  })
})
