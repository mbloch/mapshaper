import assert from 'assert';
import { parseColorInput, formatColorInput, colorInputFormats } from '../src/gui/gui-color-input';

describe('gui-color-input.mjs', function() {
  describe('parseColorInput()', function() {
    it('six-digit hex, with or without "#", in any case', function() {
      assert.equal(parseColorInput('#33AA77'), '#33aa77');
      assert.equal(parseColorInput('33aa77'), '#33aa77');
      assert.equal(parseColorInput('  #33aa77 '), '#33aa77');
    });

    it('short hex', function() {
      assert.equal(parseColorInput('#3a7'), '#33aa77');
      assert.equal(parseColorInput('3a7'), '#33aa77');
    });

    it('hex with alpha drops the alpha', function() {
      assert.equal(parseColorInput('#3a78'), '#33aa77');
      assert.equal(parseColorInput('33aa7780'), '#33aa77');
    });

    it('named colors', function() {
      assert.equal(parseColorInput('steelblue'), '#4682b4');
      assert.equal(parseColorInput('White'), '#ffffff');
    });

    it('rgb() and rgba(), comma or space syntax, numbers or percents', function() {
      assert.equal(parseColorInput('rgb(255, 128, 0)'), '#ff8000');
      assert.equal(parseColorInput('rgba(255,128,0,0.5)'), '#ff8000');
      assert.equal(parseColorInput('rgb(255 128 0 / 50%)'), '#ff8000');
      assert.equal(parseColorInput('rgb(100%, 50%, 0%)'), '#ff8000');
    });

    it('hsl() and hsla()', function() {
      assert.equal(parseColorInput('hsl(0, 100%, 50%)'), '#ff0000');
      assert.equal(parseColorInput('hsl(120deg 100% 25%)'), '#008000');
      assert.equal(parseColorInput('hsla(240, 100%, 50%, 0.3)'), '#0000ff');
      assert.equal(parseColorInput('hsl(0.5turn 100% 50%)'), '#00ffff');
      assert.equal(parseColorInput('hsl(-120, 100%, 50%)'), '#0000ff');
    });

    it('rejects what is not a color', function() {
      ['', 'not a color', '#12', '#12345', '1234567', 'rgb(1,2)', 'rgb(a,b,c)',
        'hsl(0, 100%)', 'notacolorname', '#ggg'].forEach(function(str) {
        assert.strictEqual(parseColorInput(str), null, str);
      });
    });
  });

  describe('oklch() input', function() {
    it('reads L, C and h, as numbers or percents', function() {
      var hex = '#001e56';
      assert.equal(parseColorInput(formatColorInput(hex, 'oklch')), hex);
      assert.equal(parseColorInput('oklch(0.2574 0.1079 260.49)'), hex);
      assert.equal(parseColorInput('oklch(25.74% 26.975% 260.49deg)'), hex);
      assert.equal(parseColorInput('oklch(1 0 none)'), '#ffffff');
      assert.equal(parseColorInput('oklch(0.5 0.1 120 / 0.5)'), parseColorInput('oklch(0.5 0.1 120)'));
    });

    it('brings a color outside sRGB in by reducing chroma', function() {
      var hex = parseColorInput('oklch(0.75 0.4 190)');
      assert(/^#[0-9a-f]{6}$/.test(hex));
    });

    it('rejects malformed values', function() {
      ['oklch(0.5 0.1)', 'oklch(a b c)', 'oklch(0.5, 0.1, 120'].forEach(function(str) {
        assert.strictEqual(parseColorInput(str), null, str);
      });
    });
  });

  describe('formatColorInput()', function() {
    it('shows a color in each format', function() {
      assert.equal(formatColorInput('#001e56', 'hex'), '#001e56');
      assert.equal(formatColorInput('#001e56', 'rgb'), 'rgb(0, 30, 86)');
      assert.equal(formatColorInput('#ff8000', 'hsl'), 'hsl(30.1, 100%, 50%)');
      assert.equal(formatColorInput('#001e56', 'oklch'), 'oklch(0.2574 0.1079 260.49)');
      assert.equal(formatColorInput('#808080', 'oklch'), 'oklch(0.5999 0.0000 0)');
    });

    it('every format reads back as the same color', function() {
      var seed = 1;
      function rand() {
        seed = (seed * 16807) % 2147483647;
        return seed % 256;
      }
      for (var i=0; i<500; i++) {
        var hex = '#' + [rand(), rand(), rand()].map(function(v) {
          return v.toString(16).padStart(2, '0');
        }).join('');
        colorInputFormats.forEach(function(format) {
          var str = formatColorInput(hex, format.name);
          assert.equal(parseColorInput(str), hex, format.name + ' ' + str);
        });
      }
    });
  });
});
