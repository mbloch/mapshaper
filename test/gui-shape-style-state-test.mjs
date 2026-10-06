import assert from 'assert';
import {
  mergeShapeStyleValues,
  getNewShapeStyle,
  updateNewShapeStyle,
  clearNewShapeStyle,
  getPendingPathStyle,
  getNewShapeCommandStyle
} from '../src/gui/gui-shape-style-state';

function mockGui() {
  var events = [];
  return {
    state: {},
    events: events,
    dispatchEvent: function(type, data) { events.push([type, data]); }
  };
}

describe('gui shape style state', function() {

  describe('mergeShapeStyleValues()', function() {
    it('sets values, and a blank value removes a field', function() {
      var style = {stroke: 'red', 'stroke-width': 2};
      var out = mergeShapeStyleValues(style, [['stroke', 'blue'], ['stroke-width', '']], 'polyline');
      assert.deepEqual(out, {stroke: 'blue'});
      assert.deepEqual(style, {stroke: 'red', 'stroke-width': 2});
    });

    it('ignores fields a shape of the type cannot have', function() {
      assert.deepEqual(mergeShapeStyleValues({}, [['fill', 'pink'], ['line-end', 'arrow']], 'polyline'),
        {'line-end': 'arrow'});
      assert.deepEqual(mergeShapeStyleValues({}, [['fill', 'pink'], ['line-end', 'arrow']], 'polygon'),
        {fill: 'pink'});
    });
  });

  describe('new shape style', function() {
    it('is kept for each geometry type, and announced when it changes', function() {
      var gui = mockGui();
      updateNewShapeStyle(gui, 'polyline', [['stroke', 'red']]);
      updateNewShapeStyle(gui, 'polygon', [['fill', 'pink']]);
      assert.deepEqual(getNewShapeStyle(gui, 'polyline'), {stroke: 'red'});
      assert.deepEqual(getNewShapeStyle(gui, 'polygon'), {fill: 'pink'});
      clearNewShapeStyle(gui, 'polyline');
      assert.deepEqual(getNewShapeStyle(gui, 'polyline'), {});
      assert.deepEqual(getNewShapeStyle(gui, 'polygon'), {fill: 'pink'});
      assert.deepEqual(gui.events.map(function(e) { return e[0]; }),
        ['new_shape_style_change', 'new_shape_style_change', 'new_shape_style_change']);
    });
  });

  describe('getPendingPathStyle()', function() {
    it('draws an unstyled path with the default outline, white on a dark basemap', function() {
      assert.deepEqual(getPendingPathStyle({}, false), {stroke: '#334', 'stroke-width': 1});
      assert.deepEqual(getPendingPathStyle({}, true), {stroke: 'white', 'stroke-width': 1});
    });

    it('draws the stroke the shape will have, but not its fill', function() {
      assert.deepEqual(getPendingPathStyle({stroke: 'red', 'stroke-width': 3, fill: 'pink'}, true),
        {stroke: 'red', 'stroke-width': 3});
    });
  });

  describe('getNewShapeCommandStyle()', function() {
    it('leaves an unstyled shape unstyled in an unstyled layer', function() {
      assert.deepEqual(getNewShapeCommandStyle({}, false, false), {});
    });

    it('gives a shape with no stroke or fill the panel\'s default stroke in a styled layer', function() {
      // six-digit hex, which the panel's color field and picker can show
      assert.deepEqual(getNewShapeCommandStyle({}, true, false), {stroke: '#000000'});
      assert.deepEqual(getNewShapeCommandStyle({}, true, true), {stroke: '#ffffff'});
      assert.deepEqual(getNewShapeCommandStyle({fill: 'pink'}, true, false), {fill: 'pink'});
    });
  });
});
