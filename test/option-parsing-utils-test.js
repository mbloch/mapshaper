var assert = require('assert'),
    api = require("../"),
    split = api.internal.splitShellTokens;

function test(src, dest) {
  // assert.deepEqual(require('shell-quote').parse(src), split(src));
 assert.deepEqual(split(src), dest);
}

describe('mapshaper-option-parsing-utils.js', function () {

  describe('splitShellTokens()', function () {
    it('mapshaper', function () {
      test('mapshaper', ['mapshaper']);
    })
    it(' mapshaper ', function () {
      test(' mapshaper ', ['mapshaper']);
    })
    it(' \\n ', function () {
      test(' \n ', []);
    })
    it('\'\'', function () {
      test('', []);
    })
    it('Math.round(a)<10', function () {
      test('Math.round(a)<10', ['Math.round(a)<10']);
    })
    it('\\\'Math.round(a) < 10\\\'', function () {
      test('\'Math.round(a) < 10\'', ['Math.round(a) < 10']);
    })
    it('mapshaper -each "FID = $.id + \'\'"', function () {
      test('mapshaper -each "FID = $.id + \'\'"', ['mapshaper', '-each', "FID = $.id + ''"]);
    })

    it('mapshaper \\ -info', function () {
      test('mapshaper \\ -info', ['mapshaper', '-info']);
    })
  })

})