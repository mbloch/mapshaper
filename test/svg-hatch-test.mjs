import { parsePattern } from '../src/svg/svg-hatch'
import assert from 'assert';

describe('svg-hatch.js', function () {
  describe('parsePattern()', function () {

    it('dot pattern', function() {
      assert.deepEqual(parsePattern('dots 1px black 3px white'), {
        tileSize: [4, 4],
        type: 'dots',
        colors: ['black'],
        background: 'white',
        spacing: 3,
        size: 1,
        rotation: 0
      })
    })

    it('dot pattern with "dot"', function() {
      assert.deepEqual(parsePattern('dot 1px black 3px white'), {
        tileSize: [4, 4],
        type: 'dots',
        colors: ['black'],
        background: 'white',
        spacing: 3,
        size: 1,
        rotation: 0
      })
    })

   it('squares pattern', function() {
      assert.deepEqual(parsePattern('squares 2px black #c00 3px white'), {
        tileSize: [10, 10],
        type: 'squares',
        colors: ['black', '#c00'],
        background: 'white',
        spacing: 3,
        size: 2,
        rotation: 0
      })
    })
    it('0 2 #eee 1 black', function () {
      assert.deepEqual(parsePattern('0 2 #eee 1 black'), {
        tileSize: [3, 10],
        type: 'hatches',
        colors: ['#eee', 'black'],
        widths: [2, 1],
        rotation: 0
      })
    })

    it('45 deg is default rotation', function () {
      assert.deepEqual(parsePattern('2 #444444 2 rgba(0,0,0)'), {
        tileSize: [4, 10],
        type: 'hatches',
        colors: ['#444444', 'rgba(0,0,0)'],
        widths: [2, 2],
        rotation: 45
      });
    })

    it('supports more than 2 stripes', function () {
      assert.deepEqual(parsePattern('90deg 5 green 2 gold 9 black'), {
        tileSize: [16, 10],
        type: 'hatches',
        colors: ['green', 'gold', 'black'],
        widths: [5, 2, 9],
        rotation: 90
      });
    })

    it('invalid stripe width', function () {
      assert.strictEqual(parsePattern('0 #eee 1 black'), null);
    })

    it('invalid argument order', function () {
      assert.strictEqual(parsePattern('#eee 0 black 1'), null);
    })
  })
})

