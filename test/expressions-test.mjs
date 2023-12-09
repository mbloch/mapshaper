import assert from 'assert';
import api from '../mapshaper.js';

describe('mapshaper-expressions.js', function () {

  describe('getBaseContext()', function () {
    it('console is exposed', function () {
      var env = api.internal.getBaseContext();
      assert.strictEqual(env.console, console);
    })

    it('global properties are masked', function () {
      var env = api.internal.getBaseContext();
      assert.strictEqual(env.mapshaper, undefined);
      assert.strictEqual(env.global, undefined);
    })

    it('build-in functions and libraries are not masked', function () {
      var env = api.internal.getBaseContext();
      assert.strictEqual(env.Math, undefined);
      assert.strictEqual(env.parseInt, undefined);
      assert.strictEqual(env.String, undefined);
    })
  })

  describe('compileFeatureExpression()', function () {
    it('returns residual value', function () {
      var lyr = {};
      var f = api.internal.compileFeatureExpression('1', lyr, null);
      assert.equal(f(0), 1);
    })

    it('returns residual value 2', function () {
      var lyr = {};
      var f = api.internal.compileFeatureExpression('"a"', lyr, null);
      assert.equal(f(0), "a");
    })

    it('throws error on undefined variable', function () {
      var lyr = {};
      var f = api.internal.compileFeatureExpression('foo', lyr, null);
      assert.throws(function() {
        f(0);
      });
    })

    it('throws error on undefined variable 2', function () {
      var lyr = {};
      var f = api.internal.compileFeatureExpression('foo == true', lyr, null);
      assert.throws(function() {
        f(0);
      });
    })

  })

  describe('getAssignedVars()', function () {
    it('simple assigment', function () {
      assert.deepEqual(api.internal.getAssignedVars('foo=1'), ['foo']);
    })

    it('arrow functions not detected as getAssignmentObjects', function () {
      assert.deepEqual(api.internal.getAssignedVars('foo=arr.map(s => {return s;})'), ['foo']);
    })

    it('multiple assigment', function () {
      assert.deepEqual(api.internal.getAssignedVars('foo=bar = baz = 1'), ['foo', 'bar', 'baz']);
    })

    it('several assignments', function () {
      assert.deepEqual(api.internal.getAssignedVars('foo = 1, bar = 3; baz = "a"'), ['foo', 'bar', 'baz']);
    })

    it('other operators containing =', function () {
      assert.deepEqual(api.internal.getAssignedVars('foo== 0,bar >= 2'), []);
    })

    it('don\'t capture dot assignments', function () {
      assert.deepEqual(api.internal.getAssignedVars('d.a = "a"'), []);
    })

    it('capture only dot assignments', function () {
      assert.deepEqual(
        api.internal.getAssignedVars('d.a = "a",ab.cd=3.0, ac = 8, bv = 8', true),
        ['d.a', 'ab.cd']);
    })

    it('ignore repeat assignments', function () {
      assert.deepEqual(api.internal.getAssignedVars('foo=1, foo=2'), ['foo']);
    })

  })

  // REMOVED
  // describe('getAssignmentObjects()', function() {
  //   it('capture names of objects', function () {
  //     assert.deepEqual(
  //       api.internal.getAssignmentObjects('d.a = "a", d.b = "b", a.c = "c"'),
  //       ['d', 'a']);
  //   })

  //   it('ignore this.<property> assignments', function () {
  //     assert.deepEqual(
  //       api.internal.getAssignmentObjects('d.a = "a", this.coordinates = [[0, 0]], this.properties.a = "b"'),
  //       ['d']);
  //   })
  // })

})
