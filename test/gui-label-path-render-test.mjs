import assert from 'assert';
import api from '../mapshaper.js';
import { Transform } from '../src/geom/mapshaper-transform';
import {
  renderSymbols, repositionSymbols, updateLabelPaths, markLabelPathScale
} from '../src/gui/gui-svg-symbols';

var Bounds = api.internal.Bounds;

// Stand-in for MapExtent. viewScale maps CRS units to screen pixels;
// symbolScale is the frame's on-screen size over its nominal size, and is 1
// when no frame is defined.
function makeExt(viewScale, symbolScale, bounds) {
  var t = new Transform();
  t.mx = viewScale;
  t.my = -viewScale;
  t.bx = 0;
  t.by = 200;
  return {
    getTransform: function() { return t; },
    getSymbolScale: function() { return symbolScale; },
    translateCoords: function(x, y) { return t.transform(x, y); },
    getBounds: function() { return bounds || new Bounds(-1e4, -1e4, 1e4, 1e4); }
  };
}

function makeLayer(shapes, records) {
  return {
    name: 'labels',
    geometry_type: 'point',
    shapes: shapes,
    data: new api.internal.DataTable(records)
  };
}

function curvedLabel(text, extra) {
  return Object.assign({'label-text': text}, extra || {});
}

var CURVE = [[0, 0], [50, 40], [100, 0]];

// The fit check needs a text measurement, which only the GUI can take -- and
// the GUI renderer reaches the label code through internal, so that is the copy
// of the module to install one on. Undone after each test by the hook below.
function measureAsWiderThanAnyPath() {
  api.internal.svg.setTextMeasureFunction(function() { return 9999; });
  api.internal.svg.clearTextWidthCache();
}

function defs(str) {
  return str.match(/<path [^>]*\/>/g) || [];
}

function pathData(str, id) {
  var m = str.match(new RegExp('<path id="' + id + '" d="([^"]*)"'));
  return m && m[1];
}

// Minimal stand-ins for the DOM nodes the reposition path touches. The test
// environment has no document, and these functions only ever use these methods.
function fakeNode(attrs) {
  var o = Object.assign({}, attrs);
  return {
    attrs: o,
    getAttribute: function(k) { return k in o ? String(o[k]) : null; },
    setAttribute: function(k, v) { o[k] = v; },
    hasAttribute: function(k) { return k in o; }
  };
}

function fakeContainer(children) {
  var node = fakeNode({});
  node.querySelectorAll = function() { return children; };
  return node;
}

describe('gui label path rendering', function() {

  afterEach(function() {
    api.internal.svg.setTextMeasureFunction(null);
    api.internal.svg.clearTextWidthCache();
  });

  describe('renderSymbols()', function() {
    it('renders a curved label once, referencing a path in <defs>', function() {
      var lyr = makeLayer([CURVE], [curvedLabel('Sierra')]);
      var str = renderSymbols(lyr, makeExt(1, 1), 'L1');
      assert.equal(defs(str).length, 1);
      assert.ok(/<textPath[^>]*>Sierra<\/textPath>/.test(str), str);
      assert.ok(str.includes('xlink:href="#L1-lp-0"'), str);
    });

    it('namespaces path ids with the layer render id', function() {
      // two layers rendered into one document must not collide
      var lyr = makeLayer([CURVE], [curvedLabel('Sierra')]);
      assert.ok(renderSymbols(lyr, makeExt(1, 1), 'L1').includes('id="L1-lp-0"'));
      assert.ok(renderSymbols(lyr, makeExt(1, 1), 'L2').includes('id="L2-lp-0"'));
    });

    it('identifies a baseline with data-label-path, never data-id', function() {
      // gui-label-tool looks symbols up with querySelector('[data-id="N"]')
      // and no tag filter, so a <defs> path carrying data-id would shadow the
      // <text> it belongs to -- and <defs> comes first in the container
      var lyr = makeLayer([CURVE], [curvedLabel('Sierra')]);
      var str = renderSymbols(lyr, makeExt(1, 1), 'L1');
      assert.ok(defs(str)[0].includes('data-label-path="0"'), defs(str)[0]);
      assert.ok(!defs(str)[0].includes('data-id'), defs(str)[0]);
    });

    it('leaves an anchored label as positioned text', function() {
      var lyr = makeLayer([[[20, 20]]], [curvedLabel('Reno')]);
      var str = renderSymbols(lyr, makeExt(1, 1), 'L1');
      assert.equal(defs(str).length, 0);
      assert.ok(!str.includes('<defs>'), str);
      assert.ok(/<text [^>]*>Reno<\/text>/.test(str), str);
    });

    describe('a label with no text yet', function() {
      // The state a label is in between being created and being typed into.
      // Without a rendered node there is nothing to see, nothing to click and
      // nowhere to put a caret, so a label the user just placed would be
      // invisible and unrecoverable.
      var ZWSP = '\u200b';

      it('renders an anchored label as text holding a zero-width space', function() {
        var lyr = makeLayer([[[20, 20]]], [curvedLabel('')]);
        var str = renderSymbols(lyr, makeExt(1, 1), 'L1');
        assert.ok(/<text [^>]*>\u200b<\/text>/.test(str), str);
        assert.ok(str.includes('data-id="0"'), str);
      });

      it('renders a path label with its curve intact', function() {
        var lyr = makeLayer([CURVE], [curvedLabel('')]);
        var str = renderSymbols(lyr, makeExt(1, 1), 'L1');
        assert.equal(defs(str).length, 1);
        assert.ok(/<textPath[^>]*>\u200b<\/textPath>/.test(str), str);
      });

      it('puts no mark on the map', function() {
        // a zero-width space has no ink and no advance
        var lyr = makeLayer([[[20, 20]]], [curvedLabel('')]);
        var str = renderSymbols(lyr, makeExt(1, 1), 'L1');
        assert.equal(str.split(ZWSP).length - 1, 1);
        assert.ok(!/>\s*\S/.test(str.replace(/<[^>]*>/g, '').replace(ZWSP, '')), str);
      });

      it('leaves the stored text alone', function() {
        // the placeholder is a rendering detail; writing it into the data would
        // save it to the file
        var records = [curvedLabel('')];
        var lyr = makeLayer([[[20, 20]]], records);
        renderSymbols(lyr, makeExt(1, 1), 'L1');
        assert.strictEqual(records[0]['label-text'], '');
      });

      it('is not confused with a point that is not a label at all', function() {
        var lyr = makeLayer([[[20, 20]]], [{r: 4, fill: 'pink'}]);
        var str = renderSymbols(lyr, makeExt(1, 1), 'L1');
        assert.ok(!str.includes(ZWSP), str);
        assert.ok(!str.includes('<text'), str);
      });
    });

    it('keeps a label that does not fit, and marks it', function() {
      // export drops these; hiding one in the editor would make it unfindable
      var lyr = makeLayer([CURVE], [curvedLabel('Sierra')]);
      measureAsWiderThanAnyPath();
      var str = renderSymbols(lyr, makeExt(1, 1), 'L1');
      assert.ok(/<textPath[^>]*>Sierra<\/textPath>/.test(str), str);
      assert.ok(/class="[^"]*label-overflow[^"]*"/.test(str), str);
    });

    it('keeps the symbol class alongside a state class', function() {
      // repositionSymbols finds elements by .mapshaper-svg-symbol, so the
      // overflow class must be added to it rather than replace it
      var lyr = makeLayer([CURVE], [curvedLabel('Sierra')]);
      measureAsWiderThanAnyPath();
      var cls = renderSymbols(lyr, makeExt(1, 1), 'L1').match(/<text class="([^"]*)"/)[1];
      assert.ok(cls.split(' ').indexOf('mapshaper-svg-symbol') > -1, cls);
      assert.ok(cls.split(' ').indexOf('label-overflow') > -1, cls);
    });

    it('mixes anchored and curved labels in one layer', function() {
      var lyr = makeLayer([CURVE, [[20, 20]]],
        [curvedLabel('Sierra'), curvedLabel('Reno')]);
      var str = renderSymbols(lyr, makeExt(1, 1), 'L1');
      assert.equal(defs(str).length, 1);
      assert.equal((str.match(/<text[ >]/g) || []).length, 2); // not <textPath
      assert.ok(str.includes('data-id="1"'), str);
    });

    describe('zoom', function() {
      it('with a frame, leaves the baseline alone and rescales the group', function() {
        // the property the whole approach exists for: zooming a framed layer
        // multiplies the view scale and the symbol scale together, so the path
        // never has to be recomputed and the text scales with it
        var lyr = makeLayer([CURVE], [curvedLabel('Sierra')]);
        var out = renderSymbols(lyr, makeExt(1, 1), 'L1');
        var zoomed = renderSymbols(lyr, makeExt(4, 4), 'L1');
        assert.equal(pathData(zoomed, 'L1-lp-0'), pathData(out, 'L1-lp-0'));
        assert.ok(zoomed.includes('scale(4)'), zoomed);
      });

      it('with no frame, rebuilds the baseline', function() {
        var lyr = makeLayer([CURVE], [curvedLabel('Sierra')]);
        var out = renderSymbols(lyr, makeExt(1, 1), 'L1');
        var zoomed = renderSymbols(lyr, makeExt(4, 1), 'L1');
        assert.notEqual(pathData(zoomed, 'L1-lp-0'), pathData(out, 'L1-lp-0'));
      });
    });
  });

  describe('repositionSymbols()', function() {
    function reposition(shapes, records, bounds) {
      var el = fakeNode({'data-id': 0});
      var lyr = makeLayer(shapes, records);
      repositionSymbols([el], lyr, makeExt(1, 1, bounds));
      return el;
    }

    it('hides an anchored label that is out of view', function() {
      var el = reposition([[[900, 900]]], [curvedLabel('Reno')],
        new Bounds(0, 0, 100, 100));
      assert.equal(el.getAttribute('display'), 'none');
    });

    it('keeps a curved label whose anchor is out of view but whose curve is not', function() {
      // the anchor is the first knot, so testing only that point would hide a
      // label that is still mostly on screen
      var el = reposition([[[-50, 50], [50, 50]]], [curvedLabel('Sierra')],
        new Bounds(0, 0, 100, 100));
      assert.equal(el.getAttribute('display'), null);
      assert.ok(el.getAttribute('transform'), 'it is still positioned');
    });

    it('keeps a curved label that spans the whole view', function() {
      var el = reposition([[[-500, 50], [500, 50]]], [curvedLabel('Sierra')],
        new Bounds(0, 0, 100, 100));
      assert.equal(el.getAttribute('display'), null);
    });

    it('hides a curved label that is entirely out of view', function() {
      var el = reposition([[[500, 500], [600, 600]]], [curvedLabel('Sierra')],
        new Bounds(0, 0, 100, 100));
      assert.equal(el.getAttribute('display'), 'none');
    });
  });

  describe('updateLabelPaths()', function() {
    function setup(viewScale, symbolScale) {
      var path = fakeNode({id: 'L1-lp-0', 'data-label-path': 0, d: 'stale'});
      var container = fakeContainer([path]);
      var lyr = makeLayer([CURVE], [curvedLabel('Sierra')]);
      var ext = makeExt(viewScale, symbolScale);
      markLabelPathScale(container, ext);
      return {path: path, container: container, lyr: lyr};
    }

    it('does nothing while the scale it was built at still applies', function() {
      var o = setup(1, 1);
      updateLabelPaths(o.container, o.lyr, makeExt(1, 1));
      assert.equal(o.path.getAttribute('d'), 'stale');
    });

    it('does nothing when a framed layer is zoomed', function() {
      var o = setup(1, 1);
      updateLabelPaths(o.container, o.lyr, makeExt(8, 8));
      assert.equal(o.path.getAttribute('d'), 'stale');
    });

    it('rebuilds when an unframed layer is zoomed', function() {
      var o = setup(1, 1);
      updateLabelPaths(o.container, o.lyr, makeExt(4, 1));
      assert.ok(o.path.getAttribute('d').startsWith('M 0 0 C'), o.path.getAttribute('d'));
      assert.ok(o.path.getAttribute('d').includes('400'), 'rebuilt at the new scale');
    });

    it('rebuilds only once for a given scale', function() {
      var o = setup(1, 1);
      updateLabelPaths(o.container, o.lyr, makeExt(4, 1));
      o.path.setAttribute('d', 'sentinel');
      updateLabelPaths(o.container, o.lyr, makeExt(4, 1));
      assert.equal(o.path.getAttribute('d'), 'sentinel');
    });

    it('is a no-op for a layer with no label paths', function() {
      var container = fakeContainer([]);
      updateLabelPaths(container, makeLayer([[[0, 0]]], [curvedLabel('Reno')]),
        makeExt(4, 1));
      assert.equal(container.getAttribute('data-label-path-scale'), null);
    });
  });
});
