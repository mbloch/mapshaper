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

  describe('interpolateString() -- legacy single-store form', function () {
    // The two-argument form treats its second argument as the expression
    // scope (defs). New callers should use the three-argument form.

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

  describe('interpolateString() -- two-store form', function () {
    // The three-argument form takes (str, vars, defs). vars is the
    // templating scope (-vars / -defaults) and is checked first; defs
    // is the expression scope (-define / -calc / -include / ...) and
    // acts as a fallback so values set by those commands are still
    // referenceable from {{X}}.

    it('reads from vars when the name is in vars', function () {
      assert.equal(
        interpolateString('{{X}}', {X: 'from-vars'}, {X: 'from-defs'}),
        'from-vars');
    })

    it('falls back to defs when the name is missing from vars', function () {
      assert.equal(
        interpolateString('{{Y}}', {X: 'a'}, {Y: 'from-defs'}),
        'from-defs');
    })

    it('vars=null falls back to defs only', function () {
      assert.equal(
        interpolateString('{{X}}', null, {X: 'from-defs'}),
        'from-defs');
    })

    it('errors if the name is in neither store', function () {
      assert.throws(function () {
        interpolateString('{{MISSING}}', {X: 'a'}, {Y: 'b'});
      }, /Undefined variable: MISSING/);
    })

    it('null/undefined in vars errors rather than falling back', function () {
      // An explicit null in vars (only reachable via -vars file.json) is
      // treated as "set to null" and errors on read. We don't fall through
      // to defs in this case because the user said they wanted null.
      assert.throws(function () {
        interpolateString('{{X}}', {X: null}, {X: 'from-defs'});
      }, /Undefined variable: X/);
    })

    it('non-primitive in vars rejected even with defs fallback present', function () {
      // vars is hit first; the non-primitive check applies to the
      // resolved store, so this errors rather than silently falling
      // through. (vars values come from -vars/-defaults which already
      // validate primitive-only at write time, so this case shouldn't
      // arise in practice -- the test just pins the behavior.)
      assert.throws(function () {
        interpolateString('{{X}}', {X: {a: 1}}, {X: 'safe'});
      }, /not a primitive/);
    })

    it('non-primitive in defs (no vars hit) is rejected', function () {
      assert.throws(function () {
        interpolateString('{{X}}', {}, {X: function () {}});
      }, /not a primitive/);
    })
  })
})
