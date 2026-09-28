import assert from 'assert';
import { normalizeDashArrayInput } from '../src/gui/gui-style-values';
import { parseStyleLiteral } from '../src/svg/svg-properties';

describe('gui-style-values.mjs', function() {
  describe('normalizeDashArrayInput()', function() {
    it('leaves a value -style accepts as it is', function() {
      assert.equal(normalizeDashArrayInput('4'), '4');
      assert.equal(normalizeDashArrayInput('6 3'), '6 3');
    });

    it('turns commas and runs of whitespace into single spaces', function() {
      assert.equal(normalizeDashArrayInput(' 4,  2 '), '4 2');
      assert.equal(normalizeDashArrayInput('4,2,1'), '4 2 1');
      assert.equal(normalizeDashArrayInput('4\t2'), '4 2');
    });

    it('a blank field is the empty string', function() {
      assert.equal(normalizeDashArrayInput(''), '');
      assert.equal(normalizeDashArrayInput('  '), '');
      assert.equal(normalizeDashArrayInput(' , '), '');
    });

    it('its output is a literal stroke-dasharray, when the lengths are', function() {
      assert.equal(parseStyleLiteral('stroke-dasharray', normalizeDashArrayInput('4, 2')), '4 2');
      assert.strictEqual(parseStyleLiteral('stroke-dasharray', normalizeDashArrayInput('dotted')), undefined);
    });
  });
});
