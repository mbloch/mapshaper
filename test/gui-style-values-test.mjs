import assert from 'assert';
import {
  normalizeDashArrayInput, parseOpacityValue, formatOpacityPct, formatColorOpacityPct
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
});
