import assert from 'assert';
import {
  getPointKind, describeFeatureContents, formatCount, getAnnotationTool
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

    it('a numbered marker is a symbol', function() {
      assert.equal(getPointKind({'label-text': '1', 'label-pos': 'c', icon: 'circle'}), 'symbol');
    });

    it('a symbol merged into a layer of labels is still a symbol', function() {
      assert.equal(getPointKind({'label-text': undefined, icon: 'star'}), 'symbol');
      assert.equal(getPointKind({'label-text': undefined, r: 3}), 'circle');
    });

    it('tells symbols, circles and plain points apart', function() {
      assert.equal(getPointKind({'svg-symbol': {type: 'arrow'}}), 'symbol');
      assert.equal(getPointKind({r: 4}), 'circle');
      assert.equal(getPointKind({r: 0}), 'point');
      assert.equal(getPointKind({name: 'x'}), 'point');
      assert.equal(getPointKind(null), 'point');
    });
  });

  describe('getAnnotationTool()', function() {
    var marker = {'label-text': '1', 'label-pos': 'c', icon: 'circle'};

    it('a layer with text labels goes to the label tool, and an empty label layer', function() {
      assert.equal(getAnnotationTool([marker, {'label-text': 'Paris'}], true, true), 'label');
      assert.equal(getAnnotationTool([], true, false), 'label');
    });

    it('a layer of symbols and markers goes to the symbol tool', function() {
      assert.equal(getAnnotationTool([marker, {'label-text': undefined, r: 5}], true, true), 'symbols');
      assert.equal(getAnnotationTool([{icon: 'star'}], false, true), 'symbols');
    });

    it('any other layer goes to neither', function() {
      assert.equal(getAnnotationTool([{name: 'x'}], false, false), null);
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

    it('counts circles as symbols beside other symbols, and as circles alone', function() {
      var mixed = [{icon: 'star'}, {icon: 'curve'}, {r: 2}];
      assert.equal(describeFeatureContents('point', [pt, pt, pt], mixed,
        ['icon', 'r']).text, '3 symbols');
      // markers and circles from the symbol tool, in one layer
      var markers = [{'label-text': '1', 'label-pos': 'c', icon: 'square'},
        {'label-text': undefined, r: 5}, {'label-text': 'Paris'}];
      assert.equal(describeFeatureContents('point', [pt, pt, pt], markers,
        ['label-text', 'label-pos', 'icon', 'r']).text, '1 label, 2 symbols');
      assert.equal(describeFeatureContents('point', [pt, pt], [{r: 2}, {r: 3}],
        ['r']).text, '2 circles');
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
