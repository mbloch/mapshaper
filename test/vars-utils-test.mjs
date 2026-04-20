import assert from 'assert';
import {
  interpolateString,
  parseVarsArgs,
  isValidVarName,
  validateVarsObject
} from '../src/cli/mapshaper-vars-utils';

describe('mapshaper-vars-utils.js', function () {

  describe('isValidVarName()', function () {
    it('accepts simple identifiers', function () {
      assert.ok(isValidVarName('FOO'));
      assert.ok(isValidVarName('foo_bar'));
      assert.ok(isValidVarName('_x'));
      assert.ok(isValidVarName('a1'));
    })

    it('rejects invalid names', function () {
      assert.ok(!isValidVarName(''));
      assert.ok(!isValidVarName('1FOO'));
      assert.ok(!isValidVarName('foo-bar'));
      assert.ok(!isValidVarName('foo.bar'));
      assert.ok(!isValidVarName('foo bar'));
    })
  })

  describe('validateVarsObject()', function () {
    it('accepts a flat object of primitives', function () {
      var obj = {YEAR: 2024, NAME: 'foo', ON: true, MISSING: null};
      assert.strictEqual(validateVarsObject(obj), obj);
    })

    it('rejects non-objects and arrays', function () {
      assert.throws(function () { validateVarsObject([1, 2, 3]); });
      assert.throws(function () { validateVarsObject('string'); });
      assert.throws(function () { validateVarsObject(null); });
    })

    it('rejects invalid var names', function () {
      assert.throws(function () { validateVarsObject({'1bad': 1}); });
      assert.throws(function () { validateVarsObject({'foo-bar': 1}); });
    })

    it('rejects nested objects and other non-primitive values', function () {
      assert.throws(function () { validateVarsObject({A: {nested: 1}}); });
      assert.throws(function () { validateVarsObject({A: [1, 2]}); });
    })
  })

  describe('parseVarsArgs()', function () {
    it('parses inline assignments', function () {
      var scope = parseVarsArgs(['YEAR=2024', 'NAME=foo']);
      assert.deepEqual(scope, {YEAR: '2024', NAME: 'foo'});
    })

    it('later args override earlier ones', function () {
      var scope = parseVarsArgs(['YEAR=2024', 'YEAR=2030']);
      assert.deepEqual(scope, {YEAR: '2030'});
    })

    it('reads JSON file from cache', function () {
      var cache = {'vars.json': JSON.stringify({YEAR: 2024, NAME: 'foo'})};
      var scope = parseVarsArgs(['vars.json'], cache);
      assert.deepEqual(scope, {YEAR: 2024, NAME: 'foo'});
    })

    it('mixes JSON file and inline assignments', function () {
      var cache = {'vars.json': JSON.stringify({YEAR: 2024})};
      var scope = parseVarsArgs(['vars.json', 'NAME=foo'], cache);
      assert.deepEqual(scope, {YEAR: 2024, NAME: 'foo'});
    })

    it('inline assignment after JSON overrides JSON value', function () {
      var cache = {'vars.json': JSON.stringify({YEAR: 2024})};
      var scope = parseVarsArgs(['vars.json', 'YEAR=2030'], cache);
      assert.deepEqual(scope, {YEAR: '2030'});
    })

    it('throws on malformed JSON file', function () {
      var cache = {'bad.json': '{not valid json'};
      assert.throws(function () { parseVarsArgs(['bad.json'], cache); },
        /Failed to parse vars file/);
    })
  })

  describe('interpolateString()', function () {
    it('substitutes a single variable', function () {
      assert.equal(interpolateString('a {{X}} b', {X: '1'}), 'a 1 b');
    })

    it('substitutes multiple variables', function () {
      assert.equal(
        interpolateString('{{A}} {{B}} {{A}}', {A: 'x', B: 'y'}),
        'x y x');
    })

    it('returns input unchanged when there are no placeholders', function () {
      assert.equal(interpolateString('hello world', {}), 'hello world');
    })

    it('throws on undefined variable', function () {
      assert.throws(function () { interpolateString('{{MISSING}}', {}); },
        /Undefined variable: MISSING/);
    })

    it('throws on invalid variable name', function () {
      assert.throws(function () { interpolateString('{{1BAD}}', {}); },
        /Invalid variable reference/);
    })

    it('preserves \\{{...}} as a literal {{...}}', function () {
      assert.equal(
        interpolateString('keep \\{{X}} expand {{X}}', {X: 'val'}),
        'keep {{X}} expand val');
    })

    it('does not recurse into substituted values', function () {
      assert.equal(
        interpolateString('{{A}}', {A: '{{B}}', B: 'oops'}),
        '{{B}}');
    })

    it('coerces non-string values to strings', function () {
      assert.equal(interpolateString('{{N}}', {N: 42}), '42');
      assert.equal(interpolateString('{{B}}', {B: true}), 'true');
    })

    it('throws when null/undefined value is referenced', function () {
      assert.throws(function () { interpolateString('{{X}}', {X: null}); },
        /Undefined variable: X/);
      assert.throws(function () { interpolateString('{{X}}', {X: undefined}); },
        /Undefined variable: X/);
    })

    it('reads env vars via {{env.NAME}}', function () {
      process.env.MAPSHAPER_INTERP_TEST = 'fromenv';
      assert.equal(
        interpolateString('{{env.MAPSHAPER_INTERP_TEST}}', {}),
        'fromenv');
      delete process.env.MAPSHAPER_INTERP_TEST;
    })

    it('throws when env var is missing', function () {
      delete process.env.MAPSHAPER_NOT_SET;
      assert.throws(function () {
        interpolateString('{{env.MAPSHAPER_NOT_SET}}', {});
      }, /Undefined environment variable: MAPSHAPER_NOT_SET/);
    })

    it('returns non-string input unchanged', function () {
      assert.strictEqual(interpolateString(42, {}), 42);
      assert.strictEqual(interpolateString(null, {}), null);
    })

    it('throws when defs.X is a non-primitive (object/array/function)', function () {
      assert.throws(function () {
        interpolateString('{{X}}', {X: {a: 1}});
      }, /not a primitive/);
      assert.throws(function () {
        interpolateString('{{X}}', {X: [1, 2]});
      }, /not a primitive/);
      assert.throws(function () {
        interpolateString('{{X}}', {X: function () {}});
      }, /not a primitive/);
    })
  })
})
