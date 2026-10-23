import assert from 'assert';
import { getSharedStyleValues, getChangedStyleKeys } from '../src/gui/gui-selection-style';
import { getNewShapeStyle, updateNewShapeStyle, syncNewShapeStyle } from '../src/gui/gui-shape-style-state';
import { getNewLabelStyle, syncNewLabelStyle } from '../src/gui/gui-label-style-state';
import { syncSymbolStyle } from '../src/gui/gui-selection-style';
import { getDefaultIconStyle, getDefaultCurveStyle } from '../src/gui/gui-symbol-style';
import { getDefaultMarkerTextStyle } from '../src/gui/gui-marker-style';

function newSymbolStyle() {
  return {icon: getDefaultIconStyle(), curve: getDefaultCurveStyle(),
    text: Object.assign(getDefaultMarkerTextStyle(), {autoNumber: false})};
}

function mockGui() {
  var events = [];
  return {
    state: {},
    events: events,
    dispatchEvent: function(type) { events.push(type); }
  };
}

describe('gui-selection-style.mjs', function() {
  describe('getSharedStyleValues()', function() {
    it('takes the values every record agrees on', function() {
      var recs = [{stroke: 'red', 'stroke-width': 2}, {stroke: 'red', 'stroke-width': 3}];
      assert.deepEqual(getSharedStyleValues(recs, ['stroke', 'stroke-width']),
        [['stroke', 'red']]);
    });

    it('says a field none of them has is unset', function() {
      var recs = [{stroke: 'red'}, {stroke: 'red', fill: ''}];
      assert.deepEqual(getSharedStyleValues(recs, ['stroke', 'fill']),
        [['stroke', 'red'], ['fill', '']]);
    });

    it('leaves out a field that only some of them have', function() {
      var recs = [{stroke: 'red'}, {}];
      assert.deepEqual(getSharedStyleValues(recs, ['stroke']), []);
    });

    it('compares numbers and numeric strings as equal', function() {
      var recs = [{'stroke-width': 2}, {'stroke-width': '2'}];
      assert.deepEqual(getSharedStyleValues(recs, ['stroke-width']), [['stroke-width', 2]]);
    });

    it('says nothing for no records', function() {
      assert.deepEqual(getSharedStyleValues([], ['stroke']), []);
    });
  });

  describe('getChangedStyleKeys()', function() {
    it('treats unset values as equal', function() {
      assert.deepEqual(getChangedStyleKeys({a: undefined, b: 1}, {a: '', b: '1', c: 2}), ['c']);
    });
  });

  describe('syncNewShapeStyle()', function() {
    it('copies the style of a selected line', function() {
      var gui = mockGui();
      assert.equal(syncNewShapeStyle(gui, 'polyline', [{stroke: 'red', 'stroke-width': 3, name: 'a'}]), true);
      assert.deepEqual(getNewShapeStyle(gui, 'polyline'), {stroke: 'red', 'stroke-width': 3});
    });

    it('keeps its own value for a property the selection disagrees about', function() {
      var gui = mockGui();
      updateNewShapeStyle(gui, 'polyline', [['stroke', 'blue'], ['stroke-width', 1]]);
      syncNewShapeStyle(gui, 'polyline', [
        {stroke: 'red', 'stroke-width': 3},
        {stroke: 'green', 'stroke-width': 3}]);
      assert.deepEqual(getNewShapeStyle(gui, 'polyline'), {stroke: 'blue', 'stroke-width': 3});
    });

    it('unsets a property the selection agrees is unset', function() {
      var gui = mockGui();
      updateNewShapeStyle(gui, 'polyline', [['stroke', 'blue'], ['stroke-dasharray', '4 2']]);
      syncNewShapeStyle(gui, 'polyline', [{stroke: 'blue'}]);
      assert.deepEqual(getNewShapeStyle(gui, 'polyline'), {stroke: 'blue'});
    });

    it('keeps lines and polygons apart', function() {
      var gui = mockGui();
      syncNewShapeStyle(gui, 'polygon', [{fill: 'red', stroke: 'black'}]);
      assert.deepEqual(getNewShapeStyle(gui, 'polygon'), {fill: 'red', stroke: 'black'});
      assert.deepEqual(getNewShapeStyle(gui, 'polyline'), {});
    });

    it('does not take non-style fields', function() {
      var gui = mockGui();
      syncNewShapeStyle(gui, 'polyline', [{stroke: 'red', name: 'Main St', 'label-text': 'x'}]);
      assert.deepEqual(getNewShapeStyle(gui, 'polyline'), {stroke: 'red'});
    });

    it('announces only a change', function() {
      var gui = mockGui();
      syncNewShapeStyle(gui, 'polyline', [{stroke: 'red'}]);
      assert.equal(gui.events.length, 1);
      assert.equal(syncNewShapeStyle(gui, 'polyline', [{stroke: 'red'}]), false);
      assert.equal(gui.events.length, 1);
    });
  });

  describe('syncSymbolStyle()', function() {
    it('copies the style of a selected icon', function() {
      var style = newSymbolStyle();
      syncSymbolStyle(style, {icons: [{icon: 'star', 'icon-size': 16, 'icon-fill': 'red',
        'icon-rotation': 15}]});
      assert.deepEqual(style.icon, {shape: 'star', size: 16, fill: 'red', stroke: '',
        strokeWidth: 0, rotation: 15});
    });

    it('keeps its own value for what the icons disagree about', function() {
      var style = newSymbolStyle();
      syncSymbolStyle(style, {icons: [
        {icon: 'star', 'icon-size': 16, 'icon-fill': 'red'},
        {icon: 'square', 'icon-size': 16, 'icon-fill': 'blue'}]});
      assert.equal(style.icon.shape, 'circle');
      assert.equal(style.icon.fill, getDefaultIconStyle().fill);
      assert.equal(style.icon.size, 16);
    });

    it('takes no rotation from a circle, which shows none', function() {
      var style = newSymbolStyle();
      style.icon.rotation = 30;
      syncSymbolStyle(style, {icons: [{r: 5, fill: 'red'}]});
      assert.equal(style.icon.shape, 'circle');
      assert.equal(style.icon.size, 10);
      assert.equal(style.icon.rotation, 30);
    });

    it('takes curve ends from open curves and fill from closed ones', function() {
      var style = newSymbolStyle();
      syncSymbolStyle(style, {
        openCurves: [{stroke: 'red', 'stroke-width': 3, 'line-start': 'dot', 'line-end': 'dot'}],
        closedCurves: [{stroke: 'red', 'stroke-width': 3, fill: 'yellow'}]
      });
      assert.deepEqual(style.curve, {stroke: 'red', strokeWidth: 3, arrowheads: 'both',
        arrowShape: 'dot', arrowSize: '', fade: 0, taper: 0, fill: 'yellow'});
    });

    it('keeps the head shape when the curves have no heads', function() {
      var style = newSymbolStyle();
      syncSymbolStyle(style, {openCurves: [{stroke: 'red'}]});
      assert.equal(style.curve.arrowheads, 'none');
      assert.equal(style.curve.arrowShape, 'arrow');
    });

    it('takes the text style of a marker but not its text', function() {
      var style = newSymbolStyle();
      var marker = {'label-text': '7', 'label-pos': 'c', icon: 'circle', 'icon-size': 24,
        'icon-fill': '#c00', 'font-size': 14, 'font-family': 'Georgia', fill: '#ff0'};
      syncSymbolStyle(style, {icons: [marker], markers: [marker]});
      assert.equal(style.icon.size, 24);
      assert.equal(style.text.text, '');
      assert.equal(style.text.font, 'Georgia');
      assert.equal(style.text.size, 14);
      assert.equal(style.text.color, '#ff0');
    });
  });

  describe('syncNewLabelStyle()', function() {
    it('copies the style of a selected label, but not its text', function() {
      var gui = mockGui();
      syncNewLabelStyle(gui, [{'label-text': 'Hi', 'font-size': 20, fill: 'red', 'label-pos': 'n'}]);
      assert.deepEqual(getNewLabelStyle(gui), {'label-pos': 'n', 'font-size': 20, fill: 'red'});
    });

    it('does not take where a dragged label was put', function() {
      var gui = mockGui();
      syncNewLabelStyle(gui, [{'label-text': 'Hi', 'font-size': 20, dx: 12, dy: -4,
        'text-anchor': 'start'}]);
      // a dragged label has no label-pos, and the next one stays centred
      assert.deepEqual(getNewLabelStyle(gui), {'label-pos': 'c', 'font-size': 20});
    });

    it('keeps its own value for a property the selection disagrees about', function() {
      var gui = mockGui();
      syncNewLabelStyle(gui, [{'font-size': 20, fill: 'red'}]);
      syncNewLabelStyle(gui, [{'font-size': 14, fill: 'blue'}, {'font-size': 16, fill: 'blue'}]);
      assert.deepEqual(getNewLabelStyle(gui), {'label-pos': 'c', 'font-size': 20, fill: 'blue'});
    });

    it('unsets a property the selection agrees is unset', function() {
      var gui = mockGui();
      syncNewLabelStyle(gui, [{'font-size': 20, 'halo-color': 'white', 'halo-width': 2}]);
      syncNewLabelStyle(gui, [{'font-size': 20}]);
      assert.deepEqual(getNewLabelStyle(gui), {'label-pos': 'c', 'font-size': 20});
    });
  });
});
