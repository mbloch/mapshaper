import assert from 'assert';
import {
  getDefaultPatternControls, getPatternBackground, getPatternControls, isValidPatternControls,
  formatFillPattern, formatFillPatternExpression, refillPattern, groupStyleEdits
} from '../src/gui/gui-fill-pattern';
import { parsePattern } from '../src/svg/svg-hatch';
import api from '../mapshaper.js';

function controls(type, color, size, gap, angle) {
  return {type: type, color: color, size: size, gap: gap, angle: angle};
}

describe('gui-fill-pattern.mjs', function() {
  describe('formatFillPattern()', function() {
    it('a hatch is a gap stripe in the background and a line stripe in the colour', function() {
      assert.equal(formatFillPattern(controls('hatches', '#000', 1, 3, 45), '#eee'),
        'hatches 3px #eee 1px #000');
      assert.equal(formatFillPattern(controls('hatches', 'red', 0.5, 2, -45), 'none'),
        'hatches -45deg 2px none 0.5px red');
    });

    it('dots and squares take the background at the end', function() {
      assert.equal(formatFillPattern(controls('dots', '#000', 2, 3, 0), 'white'),
        'dots 2px #000 3px white');
      assert.equal(formatFillPattern(controls('squares', '#000', 2, 0, 45), 'white'),
        'squares 45deg 2px #000 0px white');
    });

    it('its codes parse', function() {
      ['hatches', 'dots', 'squares'].forEach(function(type) {
        [0, 30, 45, -90].forEach(function(angle) {
          var o = Object.assign(getDefaultPatternControls(type, '#123456'), {angle: angle});
          var parsed = parsePattern(formatFillPattern(o, '#abcdef'));
          assert(parsed, type + ' ' + angle);
          assert.equal(parsed.rotation, angle);
        });
      });
    });
  });

  describe('getPatternControls()', function() {
    it('reads back the settings a code was made from', function() {
      ['hatches', 'dots', 'squares'].forEach(function(type) {
        var o = controls(type, '#123456', 1.5, 4, 30);
        var code = formatFillPattern(o, '#abcdef');
        assert.deepEqual(getPatternControls(parsePattern(code), '#abcdef'), o);
      });
    });

    it('finds the gap stripe of a hatch whichever comes first', function() {
      assert.deepEqual(getPatternControls(parsePattern('hatches 1px black 3px #EEE'), '#eee'),
        controls('hatches', 'black', 1, 3, 45));
    });

    it('treats a feature with no fill as a clear background', function() {
      var code = formatFillPattern(controls('dots', 'red', 2, 3, 0), getPatternBackground(undefined));
      assert.equal(code, 'dots 2px red 3px none');
      assert(getPatternControls(parsePattern(code), ''));
      assert(getPatternControls(parsePattern('dots 2px red 3px transparent'), null));
    });

    it('a pattern the settings cannot describe is custom (null)', function() {
      // background not the feature's fill
      assert.strictEqual(getPatternControls(parsePattern('dots 2px red 3px white'), '#000'), null);
      // several colours
      assert.strictEqual(getPatternControls(parsePattern('hatches 1px red 1px white 1px blue'), 'white'), null);
      assert.strictEqual(getPatternControls(parsePattern('dots 2px red blue 3px white'), 'white'), null);
      // dashes
      assert.strictEqual(getPatternControls(parsePattern('dashes 4px 2px 1px black 4px white'), 'white'), null);
      assert.strictEqual(getPatternControls(null, 'white'), null);
    });
  });

  describe('isValidPatternControls()', function() {
    it('refuses what the parser would refuse', function() {
      assert(isValidPatternControls(controls('hatches', '#000', 1, 3, 45)));
      assert(!isValidPatternControls(controls('hatches', '#000', 1, 0, 45)));
      assert(isValidPatternControls(controls('dots', '#000', 1, 0, 0)));
      assert(!isValidPatternControls(controls('dots', '#000', 0, 3, 0)));
      assert(!isValidPatternControls(controls('dots', '', 1, 3, 0)));
      assert(!isValidPatternControls(controls('dashes', '#000', 1, 3, 0)));
    });
  });

  describe('refillPattern()', function() {
    it('moves a pattern onto a new fill, and leaves a custom one alone', function() {
      assert.equal(refillPattern(parsePattern('hatches 3px #eee 1px #000'), '#eee', '#f00'),
        'hatches 3px #f00 1px #000');
      assert.strictEqual(refillPattern(parsePattern('dots 2px red 3px white'), '#000', '#f00'), null);
    });
  });

  describe('formatFillPatternExpression()', function() {
    it('gives each feature the pattern over its own fill', async function() {
      var geojson = {type: 'FeatureCollection', features: [
        {type: 'Feature', properties: {fill: '#abc'}, geometry: {type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]]}},
        {type: 'Feature', properties: {}, geometry: {type: 'Polygon', coordinates: [[[2, 0], [2, 1], [3, 1], [2, 0]]]}}
      ]};
      var expr = formatFillPatternExpression(controls('hatches', '#000', 1, 3, 45));
      var cmd = "-i in.json -style fill-pattern='" + expr.replace(/'/g, "\\'") + "' -o out.json";
      var out = await api.applyCommands(cmd, {'in.json': geojson});
      var features = JSON.parse(out['out.json']).features;
      assert.equal(features[0].properties['fill-pattern'], 'hatches 3px #abc 1px #000');
      assert.equal(features[1].properties['fill-pattern'], 'hatches 3px none 1px #000');
    });
  });

  describe('groupStyleEdits()', function() {
    it('collects the features that get the same styles', function() {
      var a = [['fill', 'red']], b = [['fill', 'blue']];
      assert.deepEqual(groupStyleEdits([
        {id: 0, styles: a}, {id: 1, styles: b}, {id: 2, styles: [['fill', 'red']]}
      ]), [{styles: a, ids: [0, 2]}, {styles: b, ids: [1]}]);
      assert.deepEqual(groupStyleEdits([]), []);
    });
  });
});
