import api from '../mapshaper.js';
import assert from 'assert';
import { captureLogCallsAsync } from './helpers';
import {
  RESERVED_GLOBALS,
  getShadowedNames,
  formatShadowWarning
} from '../src/expressions/mapshaper-expression-globals';

// Tests for the "field name shadows a JS global / mapshaper helper" warning.
//
// The warning fires inside getFeatureExpressionContext(), so it covers every
// command that ultimately calls compileFeatureExpression() (-each, -filter,
// -calc, -sort, etc.). Field names that match a curated list of stable
// ECMAScript built-ins (Math, JSON, Date, ...) or any helper bound in the
// per-command env (sprintf, round, count, sum, ...) trigger a single
// warnOnce() per (layer, shadowed-set) pair.
describe('Expression context: shadowed-field warning', function() {

  function runAndCapture(cmd, input) {
    return captureLogCallsAsync(function() {
      return api.applyCommands(cmd, input || {});
    }).then(function(captured) {
      return {output: captured.result, log: captured.log};
    });
  }

  function shadowLines(log) {
    // Match either "shadow" (plural fields) or "shadows" (singular field).
    return log.filter(function(line) {
      return /shadows? JS globals or mapshaper helpers/.test(line);
    });
  }

  describe('getShadowedNames() (unit)', function() {

    it('detects ECMAScript built-ins from the curated list', function() {
      var hits = getShadowedNames(['Math', 'JSON', 'Date', 'STATE_FIPS']);
      assert.deepEqual(hits, ['Math', 'JSON', 'Date']);
    });

    it('returns [] when nothing shadows', function() {
      assert.deepEqual(getShadowedNames(['STATE_FIPS', 'POPULATION']), []);
    });

    it('does not flag normal/Census-ish field names that aren\'t real globals', function() {
      // These are extremely common field names and would all be false
      // positives if we used Object.getOwnPropertyNames(globalThis).
      var hits = getShadowedNames(['NAME', 'LENGTH', 'TOP', 'STATUS', 'TYPE',
        'find', 'print', 'name', 'length', 'top', 'parent']);
      assert.deepEqual(hits, []);
    });

    it('also picks up names provided via the env argument', function() {
      var env = {sprintf: function() {}, round: function() {}};
      var hits = getShadowedNames(['ROUND', 'sprintf', 'STATE'], env);
      assert.deepEqual(hits, ['sprintf']);
    });

    it('accepts an array of additional names too', function() {
      var hits = getShadowedNames(['count', 'sum', 'POP'], ['count', 'sum', 'median']);
      assert.deepEqual(hits, ['count', 'sum']);
    });

    it('handles an empty/null fields list gracefully', function() {
      assert.deepEqual(getShadowedNames(null), []);
      assert.deepEqual(getShadowedNames([]), []);
    });

    it('exposes RESERVED_GLOBALS containing the headline cases', function() {
      ['Math', 'JSON', 'Date', 'Number', 'Array', 'Object',
        'parseInt', 'NaN', 'undefined'].forEach(function(name) {
        assert.ok(RESERVED_GLOBALS.indexOf(name) !== -1,
          'expected ' + name + ' to be in RESERVED_GLOBALS');
      });
    });

    it('formatShadowWarning includes the field name, layer, and remediation hint', function() {
      var msg = formatShadowWarning(['Math'], 'states');
      assert.match(msg, /\bField name "Math"/);
      assert.match(msg, /layer "states"/);
      assert.match(msg, /hides the global\/helper binding/);
      assert.match(msg, /-rename-fields/);
    });

    it('formatShadowWarning uses plural "names" for multi-shadow case', function() {
      var msg = formatShadowWarning(['Math', 'count'], 'demo');
      assert.match(msg, /\bField names "Math", "count"/);
    });

    it('formatShadowWarning omits the layer phrase when none is provided', function() {
      var msg = formatShadowWarning(['Math'], null);
      assert.ok(msg.indexOf('layer') === -1, 'should not mention "layer" when name is missing');
      assert.match(msg, /\bField name "Math" shadow/);
    });
  });

  describe('end-to-end: warning fires for the right cases', function() {
    // warnOnce is module-level state, so tests must use distinct layer names
    // to avoid one test silently dedup'ing another's warning. Each test gets
    // a unique layer name via this helper.
    var seq = 0;
    function uniq(prefix) {
      seq += 1;
      return prefix + '_' + seq;
    }

    it('warns when an expression layer has a field named Math', function() {
      var name = uniq('shadow_math');
      var cmd = '-i a.json -rename-layers ' + name + ' -each "x = 1"';
      var input = {'a.json': [{Math: 3, NAME: 'Foo'}]};
      return runAndCapture(cmd, input).then(function(res) {
        var hits = shadowLines(res.log);
        assert.equal(hits.length, 1);
        assert.match(hits[0], /"Math"/);
        assert.match(hits[0], new RegExp('layer "' + name + '"'));
      });
    });

    it('warns once even when several -each commands run on the same layer', function() {
      var name = uniq('shadow_dedup');
      var cmd = '-i a.json -rename-layers ' + name + ' ' +
        '-each "x = 1" -each "y = 2" -each "z = 3"';
      var input = {'a.json': [{Math: 1}]};
      return runAndCapture(cmd, input).then(function(res) {
        assert.equal(shadowLines(res.log).length, 1,
          'warnOnce should dedupe identical messages across consecutive commands');
      });
    });

    it('warns separately when a different layer has its own shadowed field', function() {
      var alpha = uniq('shadow_alpha');
      var beta = uniq('shadow_beta');
      var cmd =
        '-i a.json -rename-layers ' + alpha + ' -each "x = 1" ' +
        '-i b.json -rename-layers ' + beta + ' -each "x = 1"';
      var input = {
        'a.json': [{Math: 1}],
        'b.json': [{JSON: 1}]
      };
      return runAndCapture(cmd, input).then(function(res) {
        var hits = shadowLines(res.log);
        assert.equal(hits.length, 2);
        assert.ok(hits.some(function(h) {
          return new RegExp(alpha + '.*Math').test(h);
        }));
        assert.ok(hits.some(function(h) {
          return new RegExp(beta + '.*JSON').test(h);
        }));
      });
    });

    it('combines several shadowed fields into a single warning', function() {
      var name = uniq('shadow_multi');
      var cmd = '-i a.json -rename-layers ' + name + ' -each "x = 1"';
      var input = {'a.json': [{Math: 1, JSON: 2, Date: 3, NAME: 'ok'}]};
      return runAndCapture(cmd, input).then(function(res) {
        var hits = shadowLines(res.log);
        assert.equal(hits.length, 1);
        assert.match(hits[0], /"Math"/);
        assert.match(hits[0], /"JSON"/);
        assert.match(hits[0], /"Date"/);
        assert.ok(!/"NAME"/.test(hits[0]),
          'NAME is not a JS global, must not appear in the warning');
      });
    });

    it('does NOT warn when no field shadows a global or helper', function() {
      var name = uniq('shadow_clean');
      var cmd = '-i a.json -rename-layers ' + name + ' -each "x = 1"';
      var input = {'a.json': [{NAME: 'Foo', name: 'Bar', POPULATION: 100, STATE_FIPS: '06'}]};
      return runAndCapture(cmd, input).then(function(res) {
        assert.equal(shadowLines(res.log).length, 0);
      });
    });

    it('-calc suppresses the shadow warning (it sets opts.no_warn)', function() {
      var name = uniq('shadow_calc');
      // `count` would otherwise be flagged because -calc binds count(),
      // sum(), etc. as helpers. -calc deliberately sets no_warn for its
      // own expression context, so the shadow warning is intentionally
      // silenced here -- a user running -calc is explicitly working in
      // helper-name territory.
      var cmd = '-i a.json -rename-layers ' + name + ' -calc "sum(POP)"';
      var input = {'a.json': [{POP: 10, count: 5}, {POP: 20, count: 8}]};
      return runAndCapture(cmd, input).then(function(res) {
        assert.equal(shadowLines(res.log).length, 0);
      });
    });

    it('flags helper shadows for -each (no_warn is NOT set there)', function() {
      var name = uniq('shadow_helpers');
      var cmd = '-i a.json -rename-layers ' + name + ' -each "x = 1"';
      // round() and sprintf() are bound by addFeatureExpressionUtils() for
      // every feature-expression command, so a field named "round" or
      // "sprintf" would silently break those helpers.
      var input = {'a.json': [{round: 1, sprintf: 2}]};
      return runAndCapture(cmd, input).then(function(res) {
        var hits = shadowLines(res.log);
        assert.equal(hits.length, 1);
        assert.match(hits[0], /"round"/);
        assert.match(hits[0], /"sprintf"/);
      });
    });

    it('does not warn for a layer with no attribute fields', function() {
      var name = uniq('shadow_empty');
      // GeoJSON points with no properties -> no fields -> nothing to
      // shadow. Make sure we don't accidentally crash or warn.
      var cmd = '-i a.json -rename-layers ' + name + ' -each "x = 1"';
      var input = {'a.json': {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: null,
          geometry: {type: 'Point', coordinates: [0, 0]}
        }]
      }};
      return runAndCapture(cmd, input).then(function(res) {
        assert.equal(shadowLines(res.log).length, 0);
      });
    });
  });
});
