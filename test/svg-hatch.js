import { parseHatch } from '../src/svg/svg-hatch.js'
import assert from 'assert';

describe('svg-hatch.js', function () {
  describe('parseHatch()()', function () {
    it('0 #eee 2 black 1', function () {
      assert.deepEqual(parseHatch('0 #eee 2 black 1'), {
        colors: ['#eee', 'black'],
        widths: [2, 1],
        rotation: 0
      })
    })

    it('45 deg is default rotation', function () {
      assert.deepEqual(parseHatch('#444444 2 rgba(0,0,0) 2'), {
        colors: ['#444444', 'rgba(0,0,0)'],
        widths: [2, 2],
        rotation: 45
      });
    })

    it('invalid stripe width', function () {
      assert.strictEqual(parseHatch('#eee 0 black 1'), null);
    })

  })
})

