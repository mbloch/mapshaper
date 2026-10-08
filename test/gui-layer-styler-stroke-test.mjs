import api from '../mapshaper.js';
import assert from 'assert';
import {
  getCanvasDisplayStyle, layerHasDrawableStyle
} from '../src/gui/gui-layer-styler.mjs';

function makeLayer(records) {
  return {geometry_type: 'polyline', data: new api.internal.DataTable(records)};
}

// The canvas styler mutates one style object from shape to shape (see
// drawStyledPaths() in gui-canvas.mjs), so each case styles every shape in
// turn with the same object.
function styleShapes(records) {
  var lyr = makeLayer(records);
  var base = getCanvasDisplayStyle(lyr);
  var drawStyle = Object.assign({}, base);
  return records.map(function(rec, i) {
    base.styler(drawStyle, i);
    return {strokeColor: drawStyle.strokeColor, strokeWidth: drawStyle.strokeWidth};
  });
}

describe('canvas stroke defaults', function() {
  it('draws a stroke with no width 1px wide, in a layer whose other shapes have widths', function() {
    var out = styleShapes([{stroke: '#ef6f6f', 'stroke-width': 3}, {stroke: '#000000'}]);
    assert.deepEqual(out[1], {strokeColor: '#000000', strokeWidth: 1});
  });

  it('does not carry a default width over to a shape with no stroke', function() {
    var out = styleShapes([{stroke: 'red'}, {}]);
    assert.deepEqual(out[0], {strokeColor: 'red', strokeWidth: 1});
    assert.equal(out[1].strokeColor, undefined);
    assert.ok(!out[1].strokeWidth);
  });

  it('draws a width with no stroke in black, and does not carry the black over', function() {
    var out = styleShapes([{'stroke-width': 2}, {}]);
    assert.deepEqual(out[0], {strokeColor: 'black', strokeWidth: 2});
    assert.equal(out[1].strokeColor, undefined);
    assert.ok(!out[1].strokeWidth);
  });

  it('keeps a width of 0', function() {
    var out = styleShapes([{stroke: 'red', 'stroke-width': 0}]);
    assert.deepEqual(out[0], {strokeColor: 'red', strokeWidth: 0});
  });

  it('treats entirely unset style columns as unstyled', function() {
    var lyr = makeLayer([
      {stroke: undefined, 'stroke-width': undefined},
      {stroke: undefined, 'stroke-width': undefined}
    ]);
    assert.equal(layerHasDrawableStyle(lyr), false);
  });

  it('keeps a layer styled when a later shape has style values', function() {
    var lyr = makeLayer([
      {stroke: undefined, 'stroke-width': undefined},
      {stroke: 'red', 'stroke-width': 2}
    ]);
    assert.equal(layerHasDrawableStyle(lyr), true);
  });
});
