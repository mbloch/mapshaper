import assert from 'assert';
import api from '../mapshaper.js';
import { getHighlightWidth, getHandleRadius } from '../src/gui/gui-highlight-width';
import { getOverlayLayers } from '../src/gui/gui-overlay-styler';

var internal = api.internal;

describe('getHighlightWidth()', function() {
  var outline = {minWidth: 2, extraWidth: 1};
  var halo = {extraWidth: 5};

  it('a fine line is drawn at the minimum width', function() {
    assert.equal(getHighlightWidth(0.5, outline), 2);
    assert.equal(getHighlightWidth(0, outline), 2);
  });

  it('a line up to the reference width is widened by extraWidth', function() {
    assert.equal(getHighlightWidth(3, outline), 4);
    assert.equal(getHighlightWidth(4, halo), 9);
  });

  it('a wide line is widened by a little more, not in proportion', function() {
    var narrow = getHighlightWidth(4, halo) - 4;
    var wide = getHighlightWidth(40, halo) - 40;
    assert(wide > narrow);
    assert(wide < narrow * 2.5);
  });

  it('a missing feature width is treated as none', function() {
    assert.equal(getHighlightWidth(undefined, halo), 5);
  });
});

describe('getHandleRadius()', function() {
  it('a handle on a fine line keeps its own radius', function() {
    assert.equal(getHandleRadius(3.2, 0), 3.2);
    assert.equal(getHandleRadius(3.2, 1.5), 3.2);
  });

  it('a handle on a wide line is wider than the line, by not much more', function() {
    var r = getHandleRadius(3.2, 10.5);
    assert(r * 2 > 10.5);
    assert(r * 2 < 10.5 + 6);
    r = getHandleRadius(3.2, 46);
    assert(r * 2 > 46);
    assert(r * 2 < 46 + 10);
  });

  it('a handle grows no larger than maxRadius', function() {
    assert.equal(getHandleRadius(3.2, 46, 8), 8);
    assert.equal(getHandleRadius(3.2, 1.5, 8), 3.2);
  });
});

describe('curve knot handles', function() {
  function curveLayer() {
    var displayLayer = {
      geometry_type: 'polyline',
      shapes: [[[0]]],
      data: new internal.DataTable([{stroke: 'red', 'stroke-width': 1.5}])
    };
    return {
      geometry_type: 'polyline',
      gui: {
        displayLayer: displayLayer,
        displayArcs: new internal.ArcCollection([[[0, 0], [1, 1]]]),
        style: {type: 'styled', styler: function(style) { style.strokeWidth = 1.5; }}
      }
    };
  }
  var knots = [[0, 0], [1, 1]];

  it('take the width of the selected line', function() {
    var layers = getOverlayLayers(curveLayer(), {ids: [0], id: -1, pending_knots: knots},
      {interactionMode: 'curve_lines'});
    var knotLyr = layers[layers.length - 1];
    assert.equal(knotLyr.gui.style.fixedRadius, true);
    assert.equal(knotLyr.gui.style.lineWidth, 1.5);
  });

  it('take the width of the path being drawn, or none if it has no style', function() {
    var hitData = {ids: [], id: -1, pending_knots: knots, pending_path: knots,
      pending_path_style: {stroke: 'red', 'stroke-width': 4}};
    var layers = getOverlayLayers(curveLayer(), hitData, {interactionMode: 'curve_lines'});
    assert.equal(layers[layers.length - 1].gui.style.lineWidth, 4);
    hitData.pending_path_style = null;
    layers = getOverlayLayers(curveLayer(), hitData, {interactionMode: 'curve_lines'});
    assert.equal(layers[layers.length - 1].gui.style.lineWidth, 0);
  });
});

describe('getOverlayStyle() highlight widths', function() {
  // a line layer whose width is set for the whole layer, not by each shape,
  // as the layer styler leaves it when there are no stroke fields
  function lineLayer(styler) {
    var displayLayer = {
      geometry_type: 'polyline',
      shapes: [[[0]], [[1]]],
      data: new internal.DataTable([{}, {}])
    };
    return {
      geometry_type: 'polyline',
      gui: {
        displayLayer: displayLayer,
        displayArcs: new internal.ArcCollection([[[0, 0], [1, 1]], [[2, 2], [3, 3]]]),
        style: {type: 'styled', strokeColor: 'red', strokeWidth: 1, styler: styler}
      }
    };
  }

  function drawShapes(style, n) {
    var drawStyle = Object.assign({}, style);
    var out = [];
    for (var i=0; i<n; i++) {
      style.styler(drawStyle, i);
      out.push({featureWidth: drawStyle.featureWidth, strokeWidth: drawStyle.strokeWidth});
    }
    return out;
  }

  it('a layer-wide width is the feature width of every shape', function() {
    var lyr = lineLayer(function() {});
    var layers = getOverlayLayers(lyr, {ids: [0, 1], id: -1}, {interactionMode: 'line_style'});
    var shapes = drawShapes(layers[0].gui.style, 2);
    assert.deepEqual(shapes[0], shapes[1]);
    assert.equal(shapes[0].featureWidth, 1);
    assert.equal(shapes[0].strokeWidth, 6);
  });

  it('a hover outline over a fine line is drawn at its minimum width', function() {
    var lyr = lineLayer(function(style) { style.strokeWidth = 0.5; });
    var layers = getOverlayLayers(lyr, {ids: [0], id: 0}, {interactionMode: 'info'});
    var style = layers[0].gui.style;
    var shapes = drawShapes(style, 1);
    assert.equal(shapes[0].featureWidth, 0.5);
    assert.equal(shapes[0].strokeWidth, 2);
    assert.equal(style.highlight.halo, false);
  });

  it('a selection halo is marked as a halo', function() {
    var lyr = lineLayer(function() {});
    var layers = getOverlayLayers(lyr, {ids: [0], id: -1}, {interactionMode: 'line_style'});
    assert.equal(layers[0].gui.style.highlight.halo, true);
  });
});
