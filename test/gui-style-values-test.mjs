import assert from 'assert';
import {
  normalizeDashArrayInput, parseOpacityValue, formatOpacityPct, formatColorOpacityPct,
  getNextStrokeWidth
} from '../src/gui/gui-style-values';
import { parseStyleLiteral } from '../src/svg/svg-properties';

describe('gui-style-values.mjs', function() {
  describe('parseOpacityValue()', function() {
    it('reads a percentage as a fraction', function() {
      assert.strictEqual(parseOpacityValue('50%'), 0.5);
      assert.strictEqual(parseOpacityValue(' 0 '), 0);
      assert.strictEqual(parseOpacityValue('150%'), 1);
    });

    it('a blank field is no value, not zero', function() {
      assert.strictEqual(parseOpacityValue(''), null);
      assert.strictEqual(parseOpacityValue(' % '), null);
      assert.strictEqual(parseOpacityValue('half'), null);
    });
  });

  describe('formatOpacityPct()', function() {
    it('no value shows as blank', function() {
      assert.equal(formatOpacityPct(''), '');
      assert.equal(formatOpacityPct(null), '');
      assert.equal(formatOpacityPct(undefined), '');
      assert.equal(formatOpacityPct(0), '0%');
      assert.equal(formatOpacityPct(0.25), '25%');
    });
  });

  describe('formatColorOpacityPct()', function() {
    it('an unset opacity is blank with no colour and 100% with one', function() {
      assert.equal(formatColorOpacityPct(undefined, false), '');
      assert.equal(formatColorOpacityPct('', false), '');
      assert.equal(formatColorOpacityPct(undefined, true), '100%');
    });

    it('a set opacity shows whether or not there is a colour', function() {
      assert.equal(formatColorOpacityPct(0.5, true), '50%');
      assert.equal(formatColorOpacityPct(0.5, false), '50%');
      assert.equal(formatColorOpacityPct(0, false), '0%');
    });
  });

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

  describe('getNextStrokeWidth()', function() {
    function walk(value, direction, n) {
      var out = [];
      while (n-- > 0) out.push(value = getNextStrokeWidth(value, direction));
      return out;
    }

    it('steps down through the widths it steps up through', function() {
      var up = walk(0, 1, 12);
      assert.deepEqual(up, [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 5, 6, 7]);
      assert.deepEqual(walk(7, -1, 12), up.slice(0, -1).reverse().concat(0));
    });

    it('steps from between widths to the next one each way', function() {
      assert.equal(getNextStrokeWidth(5.5, 1), 6);
      assert.equal(getNextStrokeWidth(5.5, -1), 5);
      assert.equal(getNextStrokeWidth(4.5, -1), 4);
      assert.equal(getNextStrokeWidth(2.5, -1), 2);
      assert.equal(getNextStrokeWidth(0, -1), 0);
    });
  });
});
