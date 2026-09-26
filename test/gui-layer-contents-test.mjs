import assert from 'assert';
import {
  getPointKind, describeFeatureContents, formatCount
} from '../src/gui/gui-layer-contents';

describe('gui layer contents', function() {

  describe('formatCount()', function() {
    it('pluralizes and adds thousands separators', function() {
      assert.equal(formatCount(1, 'polygon'), '1 polygon');
      assert.equal(formatCount(0, 'polyline'), '0 polylines');
      assert.equal(formatCount(1234567, 'data record'), '1,234,567 data records');
    });
  });

  describe('getPointKind()', function() {
    it('a label wins over a symbol or circle drawn with it', function() {
      assert.equal(getPointKind({'label-text': 'Paris', r: 3}), 'label');
    });

    it('a label with no text yet is still a label', function() {
      assert.equal(getPointKind({'label-text': ''}), 'label');
    });

    it('tells symbols, circles and plain points apart', function() {
      assert.equal(getPointKind({'svg-symbol': {type: 'arrow'}}), 'symbol');
      assert.equal(getPointKind({r: 4}), 'circle');
      assert.equal(getPointKind({r: 0}), 'point');
      assert.equal(getPointKind({name: 'x'}), 'point');
      assert.equal(getPointKind(null), 'point');
    });
  });

  describe('describeFeatureContents()', function() {
    var pt = [[0, 0]];

    it('names a point layer of one kind by that kind', function() {
      var o = describeFeatureContents('point', [pt, pt],
        [{'label-text': 'a'}, {'label-text': 'b'}], ['label-text']);
      assert.deepEqual(o, {text: '2 labels', nulls: 0, title: null});
    });

    it('lists each kind in a mixed point layer', function() {
      var records = [{'label-text': 'a'}, {name: 'b'}, {name: 'c'}, {r: 2}];
      var o = describeFeatureContents('point', [pt, pt, pt, pt], records,
        ['label-text', 'name', 'r']);
      assert.equal(o.text, '1 label, 1 circle, 2 points');
    });

    it('treats a point layer without data as plain points', function() {
      assert.equal(describeFeatureContents('point', [pt, pt, pt], null, []).text,
        '3 points');
    });

    it('names the features an empty layer is set up for', function() {
      assert.equal(describeFeatureContents('point', [], [], ['label-text']).text,
        '0 labels');
      assert.equal(describeFeatureContents('point', [], [], []).text, '0 points');
    });

    it('leaves null shapes out of the counts and puts them in the tooltip', function() {
      var records = [{'label-text': 'a'}, {'label-text': 'b'}, {name: 'c'}];
      var o = describeFeatureContents('point', [pt, null, []], records, ['label-text']);
      assert.deepEqual(o, {
        text: '1 label',
        nulls: 2,
        title: '1 label, 2 without geometry'
      });
    });

    it('counts polygons and polylines that have geometry', function() {
      var o = describeFeatureContents('polygon', [[[0]], null, [[1]]], null, []);
      assert.deepEqual(o, {
        text: '2 polygons',
        nulls: 1,
        title: '2 polygons, 1 without geometry'
      });
      assert.equal(describeFeatureContents('polyline', [[[0]]], null, []).title, null);
    });
  });
});
