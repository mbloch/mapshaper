import assert from 'assert';
import { splitShellTokens } from '../src/cli/mapshaper-option-parsing-utils';
var split = splitShellTokens;

function test(src, dest) {
  // assert.deepEqual(await import('shell-quote').parse(src), split(src));
 assert.deepEqual(split(src), dest);
}

describe('mapshaper-chunker.js', function () {

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