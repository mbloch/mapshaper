import assert from 'assert';
import api from '../mapshaper.js';
import { getOverlayLayers } from '../src/gui/gui-overlay-styler';
import { findShapesWithVertices, getShapePaths, removeUnusedArcVertices } from '../src/gui/gui-drawing-utils';

var internal = api.internal;

// A line layer as the map presents it, with two dashed, wide lines
function activeLineLayer(styleType) {
  var records = [
    {stroke: 'red', 'stroke-width': 6, 'stroke-dasharray': '4 2'},
    {stroke: 'red', 'stroke-width': 6, 'stroke-dasharray': '4 2'}
  ];
  var displayLayer = {
    geometry_type: 'polyline',
    shapes: [[[0]], [[1]]],
    data: new internal.DataTable(records)
  };
  return {
    geometry_type: 'polyline',
    gui: {
      displayLayer: displayLayer,
      displayArcs: new internal.ArcCollection([[[0, 0], [1, 1]], [[2, 2], [3, 3]]]),
      style: styleType == 'outline' ?
        {type: 'outline', strokeColors: [null, '#334'], strokeWidth: 0.8} :
        {strokeColor: 'red', strokeWidth: 6, lineDash: '4 2'}
    }
  };
}

function layerSummary(lyr) {
  var style = lyr.gui.style;
  return {
    name: lyr.gui.displayLayer.name || null,
    ids: style.ids || null,
    strokeColor: style.strokeColor || null,
    strokeWidth: style.strokeWidth || null
  };
}

describe('curve tool knot drag overlay', function() {
  var opts = {interactionMode: 'curve_lines'};

  it('a selected line is highlighted', function() {
    var layers = getOverlayLayers(activeLineLayer(), {ids: [0], id: -1}, opts);
    assert.equal(layers.length, 1);
    assert.deepEqual(layers[0].gui.style.ids, [0]);
  });

  it('while it is redrawn, the line is a plain outline with no highlight', function() {
    var hitData = {ids: [0], id: -1, hidden_ids: [0], pending_path: [[0, 0], [1, 2]]};
    var layers = getOverlayLayers(activeLineLayer(), hitData, opts).map(layerSummary);
    assert.deepEqual(layers[0], {name: null, ids: [0], strokeColor: '#334', strokeWidth: 0.8});
    assert.equal(layers[1].name, 'pending-path');
    assert.equal(layers.length, 2);
  });

  it('on a dark basemap, the outline is white', function() {
    var hitData = {ids: [0], id: -1, hidden_ids: [0], pending_path: [[0, 0], [1, 2]]};
    var layers = getOverlayLayers(activeLineLayer(), hitData,
      {interactionMode: 'curve_lines', darkMode: true});
    assert.equal(layers[0].gui.style.strokeColor, 'white');
  });

  it('a layer drawn as an outline draws the line itself, so no outline is added', function() {
    var hitData = {ids: [0], id: -1, hidden_ids: [0], pending_path: [[0, 0], [1, 2]]};
    var layers = getOverlayLayers(activeLineLayer('outline'), hitData, opts).map(layerSummary);
    assert.deepEqual(layers.map(function(o) { return o.name; }), ['pending-path']);
  });

  it('the rest of the selection keeps its highlight', function() {
    var hitData = {ids: [0, 1], id: -1, hidden_ids: [0], pending_path: [[0, 0], [1, 2]]};
    var layers = getOverlayLayers(activeLineLayer(), hitData, opts);
    assert.deepEqual(layers[1].gui.style.ids, [1]);
  });

  it('smooth knots are drawn as circles, and corners as squares', function() {
    var hitData = {ids: [], id: -1, pending_knots: [[0, 0], [1, 1, true], [2, 0]]};
    var layers = getOverlayLayers(activeLineLayer(), hitData, opts);
    assert.equal(layers.length, 2);
    assert.deepEqual(layers[0].gui.displayLayer.shapes, [[[0, 0]], [[2, 0]]]);
    assert(!layers[0].gui.style.pointShape);
    assert.equal(layers[1].gui.displayLayer.name, 'curve-corner-knots');
    assert.deepEqual(layers[1].gui.displayLayer.shapes, [[[1, 1, true]]]);
    assert.equal(layers[1].gui.style.pointShape, 'square');
  });
});

describe('reshape tool vertex drag overlay', function() {
  var opts = {interactionMode: 'reshape_lines'};

  it('the shape under the pointer is drawn as an outline with vertices', function() {
    var layers = getOverlayLayers(activeLineLayer(), {ids: [0], id: 0}, opts);
    assert.equal(layers.length, 1);
    assert.equal(layers[0].gui.style.vertices, true);
    assert(!layers[0].gui.style.verticesOnly);
  });

  it('while a vertex is dragged: the original outline, the shapes in their own style, then the vertices', function() {
    var hitData = {ids: [0], id: 0, hidden_ids: [0, 1], hidden_paths: [[[0, 0], [1, 1]], [[2, 2], [3, 3]]],
      hit_coordinates: [1, 1], hit_type: ''};
    var layers = getOverlayLayers(activeLineLayer(), hitData, opts);
    var outline = layers[0].gui;
    var redrawn = layers[1].gui.style;
    var editing = layers[2].gui.style;
    assert.equal(layers.length, 3);
    assert.equal(outline.displayLayer.name, 'hidden-shapes');
    assert.equal(outline.displayLayer.shapes.length, 2);
    assert.deepEqual(outline.displayArcs.toArray(), [[[0, 0], [1, 1]], [[2, 2], [3, 3]]]);
    assert.equal(outline.style.strokeColor, '#334');
    assert.deepEqual(redrawn.ids, [0, 1]);
    assert.equal(redrawn.strokeWidth, 6);
    assert.equal(redrawn.lineDash, '4 2');
    assert.equal(editing.verticesOnly, true);
    assert.deepEqual(editing.vertex_overlay, [1, 1]);
  });

  it('the redrawn shapes are styled as the layer styles them, by feature id', function() {
    var lyr = activeLineLayer();
    var seen = [];
    var layers, style;
    lyr.gui.style.styler = function(style, i) { seen.push(i); };
    layers = getOverlayLayers(lyr, {ids: [], id: -1, hidden_ids: [1], hidden_paths: [[[2, 2], [3, 3]]]}, opts);
    style = layers[1].gui.style;
    style.styler({}, 0);
    assert.deepEqual(seen, [1]);
  });

  it('a layer drawn as an outline is left as it is', function() {
    var hitData = {ids: [0], id: 0, hidden_ids: [0], hidden_paths: [[[0, 0], [1, 1]]]};
    var layers = getOverlayLayers(activeLineLayer('outline'), hitData, opts);
    assert.equal(layers.length, 1);
    assert(!layers[0].gui.style.verticesOnly);
  });
});

describe('findShapesWithVertices() and getShapePaths()', function() {
  // two lines sharing arc 1
  var arcs = new internal.ArcCollection([[[0, 0], [1, 0]], [[1, 0], [2, 0], [3, 0]], [[3, 0], [3, 3]]]);
  var shapes = [[[0, 1]], [[~1, 2]], [[2]]];

  it('finds every shape with an arc containing the vertex', function() {
    // vertex 3 is [2, 0], in arc 1
    assert.deepEqual(findShapesWithVertices(shapes, [3], arcs), [0, 1]);
    // vertex 6 is [3, 3], in arc 2
    assert.deepEqual(findShapesWithVertices(shapes, [6], arcs), [1, 2]);
  });

  it('copies the paths of the shapes', function() {
    assert.deepEqual(getShapePaths(shapes, [0, 2], arcs),
      [[[0, 0], [1, 0], [2, 0], [3, 0]], [[3, 0], [3, 3]]]);
  });
});

describe('removeUnusedArcVertices()', function() {
  // a line reshaped with -update-line, moving its last vertex: the old arc is
  // left in the arc collection, unused, with a vertex where the line starts
  function reshapedLine() {
    var lyr = {geometry_type: 'polyline', name: 'lines', shapes: []};
    var dataset = {layers: [lyr], arcs: new internal.ArcCollection([[[50, 50], [60, 60]]]), info: {}};
    lyr = api.cmd.addShape([lyr], dataset, {coordinates: [0, 0, 5, 5, 10, 0]})[0];
    lyr = api.cmd.updateLine([lyr], dataset, {ids: [0], coordinates: [0, 0, 5, 5, 12, 0]})[0];
    dataset.layers = [lyr];
    return dataset;
  }

  it('the start of a reshaped line is not taken for a junction with the old arc', function() {
    var dataset = reshapedLine();
    var lyr = dataset.layers[0];
    var ids = internal.findNearestVertices([0, 0], lyr.shapes[0], dataset.arcs);
    assert.equal(ids.length, 2);
    ids = removeUnusedArcVertices(ids, dataset.arcs, dataset.layers);
    assert.equal(ids.length, 1);
    assert(internal.vertexIsArcEndpoint(ids[0], dataset.arcs));
  });

  it('a vertex shared by two lines in use is kept', function() {
    var arcs = new internal.ArcCollection([[[0, 0], [1, 0]], [[1, 0], [2, 0]]]);
    var layers = [{geometry_type: 'polyline', shapes: [[[0]], [[1]]]}];
    assert.deepEqual(removeUnusedArcVertices([1, 2], arcs, layers), [1, 2]);
  });

  it('point layers are not read as paths', function() {
    var arcs = new internal.ArcCollection([[[0, 0], [1, 0]], [[1, 0], [2, 0]]]);
    var layers = [{geometry_type: 'polyline', shapes: [[[0]]]}, {geometry_type: 'point', shapes: [[[1, 0]]]}];
    assert.deepEqual(removeUnusedArcVertices([1, 2], arcs, layers), [1]);
  });
});
