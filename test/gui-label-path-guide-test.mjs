import assert from 'assert';
import api from '../mapshaper.js';
import {
  getLabelPathGuideLayers,
  setPendingLabelPath, getPendingLabelPath, clearPendingLabelPath
} from '../src/gui/gui-label-path-guide';

var CURVE = [[0, 0], [50, 40], [100, 0]];

// The parts of a display layer's gui context that the guide borrows.
function activeLayer(shapes, records) {
  return {
    name: 'labels',
    geometry_type: 'point',
    gui: {
      geographic: true,
      style: {dotSize: 2},
      source: {dataset: {arcs: null}},
      displayArcs: null,
      arcCounts: new Uint8Array(3),
      bounds: 'stale',
      displayLayer: {
        name: 'labels',
        geometry_type: 'point',
        shapes: shapes,
        data: new api.internal.DataTable(records ||
          shapes.map(function() { return {'label-text': 'x'}; }))
      }
    }
  };
}

function lineLayer(layers) {
  return layers.filter(function(lyr) {
    return lyr.gui.displayLayer.geometry_type == 'polyline';
  })[0];
}

function knotLayer(layers) {
  return layers.filter(function(lyr) {
    return lyr.gui.displayLayer.geometry_type == 'point';
  })[0];
}

describe('gui label path guide', function() {

  afterEach(function() {
    clearPendingLabelPath();
  });

  describe('the pending path', function() {
    it('starts absent', function() {
      assert.equal(getPendingLabelPath(), null);
    });

    it('holds knots and corners while a curve is being drawn', function() {
      setPendingLabelPath(CURVE, [1]);
      assert.deepEqual(getPendingLabelPath(),
        {knots: CURVE, corners: [1], preview: null});
    });

    it('is absent again when the curve is abandoned', function() {
      setPendingLabelPath(CURVE);
      clearPendingLabelPath();
      assert.equal(getPendingLabelPath(), null);
    });

    it('treats an empty knot list as no path', function() {
      setPendingLabelPath([]);
      assert.equal(getPendingLabelPath(), null);
    });
  });

  describe('getLabelPathGuideLayers()', function() {
    it('draws nothing when there is no curve', function() {
      assert.deepEqual(getLabelPathGuideLayers(activeLayer([CURVE]), []), []);
    });

    it('draws nothing without an active layer', function() {
      assert.deepEqual(getLabelPathGuideLayers(null, [{knots: CURVE}]), []);
    });

    it('draws a line and a handle per knot', function() {
      var layers = getLabelPathGuideLayers(activeLayer([CURVE]),
        [{knots: CURVE, corners: []}]);
      assert.equal(layers.length, 2);
      assert.equal(lineLayer(layers).gui.displayLayer.shapes.length, 1);
      assert.equal(knotLayer(layers).gui.displayLayer.shapes.length, 3);
    });

    it('gives a one-knot curve handles but no line', function() {
      var layers = getLabelPathGuideLayers(activeLayer([CURVE]),
        [{knots: [[3, 4]], corners: []}]);
      assert.equal(layers.length, 1);
      assert.equal(knotLayer(layers).gui.displayLayer.shapes.length, 1);
    });

    it('puts each curve in its own shape, so they draw as separate lines', function() {
      var layers = getLabelPathGuideLayers(activeLayer([CURVE]), [
        {knots: CURVE, corners: []},
        {knots: [[200, 0], [300, 50]], corners: []}
      ]);
      var lyr = lineLayer(layers);
      assert.equal(lyr.gui.displayLayer.shapes.length, 2);
      assert.deepEqual(lyr.gui.displayLayer.shapes[0], [[0]]);
      assert.deepEqual(lyr.gui.displayLayer.shapes[1], [[1]]);
      assert.equal(lyr.gui.displayArcs.size(), 2);
    });

    it('draws the line through the fitted curve, not the knots', function() {
      var layers = getLabelPathGuideLayers(activeLayer([CURVE]),
        [{knots: CURVE, corners: []}]);
      var arcs = lineLayer(layers).gui.displayArcs;
      assert.ok(arcs.getPointCount() > CURVE.length * 4,
        'the curve was flattened into many vertices');
    });

    it('starts and ends the line on the end knots', function() {
      var layers = getLabelPathGuideLayers(activeLayer([CURVE]),
        [{knots: CURVE, corners: []}]);
      var arcs = lineLayer(layers).gui.displayArcs;
      var first = arcs.getVertex2(0);
      var last = arcs.getVertex2(arcs.getPointCount() - 1);
      assert.deepEqual([first[0], first[1]], CURVE[0]);
      assert.deepEqual([last[0], last[1]], CURVE[2]);
    });

    it('flattens to the same detail however large the coordinates are', function() {
      // tolerance is a fraction of the curve's own size, so the guide is as
      // smooth in metres as it is in degrees -- and does not depend on the view,
      // which is what lets these layers be cached across pan and zoom
      function count(scale) {
        var knots = CURVE.map(function(p) { return [p[0] * scale, p[1] * scale]; });
        return getLabelPathGuideLayers(activeLayer([knots]),
          [{knots: knots, corners: []}]).filter(function(lyr) {
            return lyr.gui.displayLayer.geometry_type == 'polyline';
          })[0].gui.displayArcs.getPointCount();
      }
      assert.equal(count(1), count(100000));
    });

    it('marks a handle as a corner by filling it and enlarging it', function() {
      // on a gentle arc the handle is the only visible confirmation, because a
      // corner only changes the curve where the knots turn sharply
      var layers = getLabelPathGuideLayers(activeLayer([CURVE]),
        [{knots: CURVE, corners: [1]}]);
      var style = knotLayer(layers).gui.style;
      var smooth = {};
      var corner = {};
      style.styler(smooth, 0);
      style.styler(corner, 1);
      assert.equal(smooth.fillColor, '#ffffff', 'a smooth knot is hollow');
      assert.equal(corner.fillColor, '#cc6acc', 'a corner knot is filled');
      assert.ok(corner.radius > smooth.radius, 'a corner knot is larger');
    });

    it('resets the handle size between knots', function() {
      // the styler mutates one reusable style object, so a corner must not
      // leave its radius behind for the next knot
      var layers = getLabelPathGuideLayers(activeLayer([CURVE]),
        [{knots: CURVE, corners: [1]}]);
      var style = knotLayer(layers).gui.style;
      var out = {};
      style.styler(out, 1);
      style.styler(out, 2);
      assert.equal(out.fillColor, '#ffffff');
      assert.equal(out.radius, 3.2);
    });

    it('styles handles per knot across several curves', function() {
      var layers = getLabelPathGuideLayers(activeLayer([CURVE]), [
        {knots: CURVE, corners: []},
        {knots: [[200, 0], [250, 30], [300, 0]], corners: [1]}
      ]);
      var style = knotLayer(layers).gui.style;
      var fills = [0, 1, 2, 3, 4, 5].map(function(i) {
        var out = {};
        style.styler(out, i);
        return out.fillColor;
      });
      assert.deepEqual(fills, ['#ffffff', '#ffffff', '#ffffff',
        '#ffffff', '#cc6acc', '#ffffff']);
    });

    it('marks the layers as overlays', function() {
      var layers = getLabelPathGuideLayers(activeLayer([CURVE]),
        [{knots: CURVE, corners: []}]);
      layers.forEach(function(lyr) {
        assert.ok(lyr.gui.style.overlay, lyr.gui.displayLayer.name);
      });
    });

    it('does not reproject the synthesized coordinates again', function() {
      // they are taken from the display layer, so they are in the display CRS
      // already; getArcsForRendering() would otherwise project them twice
      var layers = getLabelPathGuideLayers(activeLayer([CURVE]),
        [{knots: CURVE, corners: []}]);
      layers.forEach(function(lyr) {
        assert.equal(lyr.gui.geographic, false);
      });
    });

    it('does not inherit cached state that describes the label layer', function() {
      // arcCounts and bounds belong to the layer the guide was built from and
      // would be wrong for the synthesized geometry
      var layers = getLabelPathGuideLayers(activeLayer([CURVE]),
        [{knots: CURVE, corners: []}]);
      layers.forEach(function(lyr) {
        assert.equal(lyr.gui.arcCounts, null);
        assert.equal(lyr.gui.bounds, null);
      });
    });

    it('leaves the active layer untouched', function() {
      var active = activeLayer([CURVE]);
      var style = active.gui.style;
      getLabelPathGuideLayers(active, [{knots: CURVE, corners: []}]);
      assert.equal(active.gui.style, style);
      assert.equal(active.gui.geographic, true);
      assert.equal(active.gui.displayLayer.shapes.length, 1);
    });
  });
});
