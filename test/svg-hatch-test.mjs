import { parsePattern, getHashId, decodePatternId } from '../src/svg/svg-hatch'
import assert from 'assert';

describe('svg-hatch.js', function () {
  describe('decodePatternId()', function () {
    function roundTrip(code) {
      return decodePatternId(getHashId(code));
    }

    it('recovers the codes the pattern panel writes', function () {
      [
        'hatches 3px #aaaaaa 1px #000000',
        'hatches -45deg 2.5px none 0.25px #ff0000',
        'dots 2px #000000 3px #bbbbbb',
        'dots 45deg 2px #000 3px none',
        'squares 2px #123456 0px #abcdef'
      ].forEach(function(code) {
        assert.equal(roundTrip(code), code);
      });
    });

    it('recovers the documented forms, including ones with no type name', function () {
      [
        'hatches 45deg 2px red 2px grey',
        'dots 2px blue 2px red 5px white',
        'squares 3px black 1px white',
        'dashes 4px 3px 1px black 4px white',
        'dashes 30deg 4px 3px 1px black #c00 4px white',
        '90deg 5 green 2 gold 9 black',
        '0 2 #eee 1 black'
      ].forEach(function(code) {
        assert.equal(roundTrip(code), code);
      });
    });

    it('puts back the # of a colour made of digits, which would read as a number', function () {
      assert.equal(roundTrip('dots 2px #123456 3px #000000'), 'dots 2px #123456 3px #000000');
      assert.deepEqual(parsePattern(roundTrip('dots 2px #123456 3px #000')).colors, ['#123456']);
      assert.equal(roundTrip('hatches 1 #111 3 #999'), 'hatches 1 #111 3 #999');
    });

    it('rebuilds colour functions', function () {
      assert.equal(roundTrip('2 #444444 2 rgba(0,0,0,0.5)'), '2 #444444 2 rgba(0,0,0,0.5)');
      assert.equal(roundTrip('dots 2px rgb(10, 20, 30) 3px hsl(120, 50%, 50%)'),
        'dots 2px rgb(10,20,30) 3px hsl(120,50%,50%)');
      assert.equal(roundTrip('hatches 2px rgb(0 0 0 / 50%) 2px white'),
        'hatches 2px rgb(0 0 0 / 50%) 2px white');
    });

    it('is null for an id that is not one of ours', function () {
      assert.strictEqual(decodePatternId('pattern1'), null);
      assert.strictEqual(decodePatternId('hash_'), null);
      assert.strictEqual(decodePatternId('hash_zigzag_2px'), null);
      assert.strictEqual(decodePatternId(''), null);
    });
  });

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

