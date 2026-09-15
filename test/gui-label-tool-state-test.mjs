import assert from 'assert';
import {
  mergeStyleValues, getNewLabelStyle, updateNewLabelStyle, clearNewLabelStyle,
  NEW_LABEL_STYLE_FIELDS
} from '../src/gui/gui-label-style-state';
import api from '../mapshaper.js';
import {
  createCurveState, addKnot, moveKnot, removeLastKnot, toggleCorner, isCorner,
  findKnotNear, curveIsComplete, getInteriorCorners,
  handleClick, getDblclickAction, clearGesture
} from '../src/gui/gui-label-curve-state';
import { getLabelTarget, getAddLabelCommand } from '../src/gui/gui-label-commands';
import { quoteCommandValue } from '../src/gui/gui-command-utils';

var layerHasLabels = api.internal.layerHasLabels;

function withKnots(pts) {
  var state = createCurveState();
  pts.forEach(function(p) { addKnot(state, p); });
  return state;
}

describe('gui label tool state', function() {

  describe('createCurveState() and addKnot()', function() {
    it('starts empty and incomplete', function() {
      var state = createCurveState();
      assert.deepEqual(state.knots, []);
      assert.ok(!curveIsComplete(state));
    });

    it('needs two knots to be worth keeping', function() {
      var state = withKnots([[10, 10]]);
      assert.ok(!curveIsComplete(state));
      addKnot(state, [50, 50]);
      assert.ok(curveIsComplete(state));
    });

    it('rejects a click on top of the previous knot', function() {
      // this is also what absorbs the second click of the double-click that
      // finishes a curve
      var state = withKnots([[10, 10]]);
      assert.equal(addKnot(state, [11, 11]), false);
      assert.equal(state.knots.length, 1);
      assert.equal(addKnot(state, [30, 10]), true);
      assert.equal(state.knots.length, 2);
    });

    it('allows a knot near an earlier one that is not the last', function() {
      // a curve may legitimately loop back on itself
      var state = withKnots([[10, 10], [80, 10]]);
      assert.equal(addKnot(state, [11, 11]), true);
      assert.equal(state.knots.length, 3);
    });

    it('rejects a point that is not finite', function() {
      var state = createCurveState();
      assert.equal(addKnot(state, [NaN, 0]), false);
      assert.equal(addKnot(state, null), false);
      assert.equal(addKnot(state, [Infinity, 1]), false);
      assert.equal(state.knots.length, 0);
    });

    it('copies the point, so a reused event object cannot mutate it', function() {
      var state = createCurveState();
      var p = [5, 6];
      addKnot(state, p);
      p[0] = 999;
      assert.deepEqual(state.knots[0], [5, 6]);
    });
  });

  describe('moveKnot()', function() {
    it('moves a placed knot', function() {
      var state = withKnots([[0, 0], [50, 0]]);
      assert.equal(moveKnot(state, 0, [10, 20]), true);
      assert.deepEqual(state.knots[0], [10, 20]);
    });

    it('ignores an index that is not there', function() {
      var state = withKnots([[0, 0]]);
      assert.equal(moveKnot(state, 3, [10, 20]), false);
      assert.equal(moveKnot(state, -1, [10, 20]), false);
      assert.equal(state.knots.length, 1);
    });

    it('may move a knot on top of its neighbor', function() {
      // the minimum distance applies to placing a knot, not to dragging one --
      // the curve fitter drops duplicates
      var state = withKnots([[0, 0], [50, 0]]);
      assert.equal(moveKnot(state, 1, [0, 0]), true);
    });
  });

  describe('removeLastKnot()', function() {
    it('removes the most recent knot', function() {
      var state = withKnots([[0, 0], [50, 0]]);
      assert.equal(removeLastKnot(state), true);
      assert.deepEqual(state.knots, [[0, 0]]);
    });

    it('reports nothing to remove on an empty curve', function() {
      assert.equal(removeLastKnot(createCurveState()), false);
    });

    it('drops the corner flag of the removed knot', function() {
      // otherwise the flag would apply to whichever knot next took that index
      var state = withKnots([[0, 0], [50, 40], [100, 0]]);
      toggleCorner(state, 2);
      removeLastKnot(state);
      addKnot(state, [100, 80]);
      assert.ok(!isCorner(state, 2), 'the new knot did not inherit the flag');
    });

    it('keeps corner flags on knots that remain', function() {
      var state = withKnots([[0, 0], [50, 40], [100, 0]]);
      toggleCorner(state, 1);
      removeLastKnot(state);
      assert.ok(isCorner(state, 1));
    });
  });

  describe('toggleCorner()', function() {
    it('turns a corner on and off', function() {
      var state = withKnots([[0, 0], [50, 40], [100, 0]]);
      assert.ok(!isCorner(state, 1));
      toggleCorner(state, 1);
      assert.ok(isCorner(state, 1));
      toggleCorner(state, 1);
      assert.ok(!isCorner(state, 1));
    });

    it('ignores a knot that is not there', function() {
      var state = withKnots([[0, 0]]);
      assert.equal(toggleCorner(state, 5), false);
      assert.deepEqual(state.corners, []);
    });
  });

  describe('getInteriorCorners()', function() {
    it('drops the end knots, which are already one-sided', function() {
      var state = withKnots([[0, 0], [50, 40], [100, 0]]);
      toggleCorner(state, 0);
      toggleCorner(state, 1);
      toggleCorner(state, 2);
      assert.deepEqual(getInteriorCorners(state), [1]);
    });

    it('sorts them, however they were clicked', function() {
      var state = withKnots([[0, 0], [20, 10], [40, 20], [60, 10], [80, 0]]);
      toggleCorner(state, 3);
      toggleCorner(state, 1);
      assert.deepEqual(getInteriorCorners(state), [1, 3]);
    });
  });

  describe('findKnotNear()', function() {
    it('finds a knot within the threshold', function() {
      var state = withKnots([[0, 0], [50, 50]]);
      assert.equal(findKnotNear(state, [52, 51]), 1);
      assert.equal(findKnotNear(state, [1, 2]), 0);
    });

    it('finds nothing beyond the threshold', function() {
      var state = withKnots([[0, 0], [50, 50]]);
      assert.equal(findKnotNear(state, [25, 25]), -1);
    });

    it('prefers the nearest knot', function() {
      var state = withKnots([[0, 0], [40, 0], [80, 0]]);
      assert.equal(findKnotNear(state, [39, 1]), 1);
    });

    it('finds nothing on an empty curve', function() {
      assert.equal(findKnotNear(createCurveState(), [0, 0]), -1);
    });
  });

  // The rules here are subtle because a double-click arrives as two clicks and
  // then a dblclick, so both handlers see the same position.
  describe('pointer gestures', function() {
    // clicks and double-clicks as the tool delivers them, at a threshold of 8
    function click(state, p) {
      return handleClick(state, p, 8, 4);
    }

    function dblclick(state, p) {
      return getDblclickAction(state, p, 8);
    }

    it('places a knot on a click in empty space', function() {
      var state = createCurveState();
      assert.equal(click(state, [10, 10]), 'added');
      assert.equal(click(state, [80, 40]), 'added');
      assert.deepEqual(state.knots, [[10, 10], [80, 40]]);
    });

    it('ignores a click on a knot that is already there', function() {
      var state = createCurveState();
      click(state, [10, 10]);
      click(state, [80, 40]);
      assert.equal(click(state, [11, 11]), 'ignored');
      assert.equal(state.knots.length, 2);
    });

    it('finishes on a double-click in empty space', function() {
      // the opening click of the gesture places the last knot, and the
      // double-click must still finish rather than mark it as a corner
      var state = createCurveState();
      click(state, [10, 10]);
      click(state, [50, 40]);
      assert.equal(click(state, [90, 10]), 'added');
      assert.equal(click(state, [90, 10]), 'ignored'); // second click of two
      assert.deepEqual(dblclick(state, [90, 10]), {action: 'finish'});
      assert.deepEqual(state.corners, []);
    });

    it('makes a corner on a double-click of an existing knot', function() {
      var state = createCurveState();
      click(state, [10, 10]);
      click(state, [50, 40]);
      click(state, [90, 10]);
      // the pointer goes back to the middle knot, so neither click adds
      assert.equal(click(state, [50, 40]), 'ignored');
      assert.equal(click(state, [50, 40]), 'ignored');
      assert.deepEqual(dblclick(state, [50, 40]), {action: 'corner', index: 1});
    });

    it('still finishes after a click that placed a knot elsewhere', function() {
      var state = createCurveState();
      click(state, [10, 10]);
      click(state, [50, 40]);
      click(state, [90, 10]);
      assert.deepEqual(dblclick(state, [200, 200]), {action: 'finish'});
    });

    it('makes a corner even right after placing a knot elsewhere', function() {
      var state = createCurveState();
      click(state, [10, 10]);
      click(state, [50, 40]);
      click(state, [90, 10]); // this gesture placed knot 2
      click(state, [50, 40]); // now the pointer is on knot 1
      assert.deepEqual(dblclick(state, [50, 40]), {action: 'corner', index: 1});
    });

    it('does nothing on a double-click with no curve started', function() {
      assert.deepEqual(dblclick(createCurveState(), [10, 10]), {action: 'none'});
    });

    it('does not treat a knot as just-placed once the gesture is cleared', function() {
      // backspace shifts the indexes, so the tool clears the gesture
      var state = createCurveState();
      click(state, [10, 10]);
      click(state, [50, 40]);
      click(state, [90, 10]);
      clearGesture(state);
      assert.deepEqual(dblclick(state, [90, 10]), {action: 'corner', index: 2});
    });
  });

  describe('getLabelTarget()', function() {
    function layer(o) {
      return Object.assign({name: 'L', shapes: [[[0, 0]]]}, o);
    }

    function labelLayer(records) {
      return layer({
        geometry_type: 'point',
        data: new api.internal.DataTable(records || [{'label-text': 'a'}])
      });
    }

    function target(lyr) {
      return getLabelTarget(lyr, layerHasLabels);
    }

    it('adds to a layer that already has labels', function() {
      assert.deepEqual(target(labelLayer()), {mode: 'existing', target: 'L'});
    });

    it('adds to a label layer whose labels are all blank', function() {
      // this is what a freshly created label looks like before it is typed into
      assert.deepEqual(target(labelLayer([{'label-text': ''}])),
        {mode: 'existing', target: 'L'});
    });

    it('adds to an empty point layer', function() {
      assert.deepEqual(target(layer({geometry_type: 'point', shapes: []})),
        {mode: 'existing', target: 'L'});
    });

    it('makes a new layer for a point layer of non-label points', function() {
      var lyr = layer({
        geometry_type: 'point',
        data: new api.internal.DataTable([{r: 3}])
      });
      assert.deepEqual(target(lyr),
        {mode: 'new', newLayerName: 'labels', target: 'L'});
    });

    it('makes a new layer for a point layer with no attributes at all', function() {
      assert.deepEqual(target(layer({geometry_type: 'point'})),
        {mode: 'new', newLayerName: 'labels', target: 'L'});
    });

    it('makes a new layer for polygons and polylines', function() {
      assert.deepEqual(target(layer({geometry_type: 'polygon'})),
        {mode: 'new', newLayerName: 'labels', target: 'L'});
      assert.deepEqual(target(layer({geometry_type: 'polyline'})),
        {mode: 'new', newLayerName: 'labels', target: 'L'});
    });

    it('makes a new layer for a table with no geometry', function() {
      assert.deepEqual(target(layer({geometry_type: null})),
        {mode: 'new', newLayerName: 'labels', target: 'L'});
    });

    it('makes a new layer when there is no active layer', function() {
      assert.deepEqual(target(null),
        {mode: 'new', newLayerName: 'labels', target: null});
    });
  });

  describe('getAddLabelCommand()', function() {
    var existing = {mode: 'existing', target: 'places'};
    // a new layer beside a polygon layer called 'poly'
    var fresh = {mode: 'new', newLayerName: 'labels', target: 'poly'};
    // a new layer when nothing is loaded yet
    var empty = {mode: 'new', newLayerName: 'labels', target: null};

    it('writes an anchored label as a single coordinate pair', function() {
      assert.equal(getAddLabelCommand([[-119.5, 37.8]], {target: existing}),
        "-add-label coordinates=-119.5,37.8 target='places'");
    });

    it('writes a curve as a flat coordinate list', function() {
      assert.equal(
        getAddLabelCommand([[0, 1], [2, 3], [4, 5]], {target: existing}),
        "-add-label coordinates=0,1,2,3,4,5 target='places'");
    });

    it('creates a new layer with no-replace, targeting the active layer', function() {
      // target= cannot name the new layer: it is resolved before the command
      // runs, when that layer does not exist yet
      assert.equal(getAddLabelCommand([[0, 1]], {target: fresh}),
        "-add-label coordinates=0,1 no-replace name='labels' target='poly'");
    });

    it('omits target when there is no layer to target', function() {
      assert.equal(getAddLabelCommand([[0, 1]], {target: empty}),
        "-add-label coordinates=0,1 no-replace name='labels'");
    });

    it('omits text when it is empty, since that is the default', function() {
      var cmd = getAddLabelCommand([[0, 1]], {target: existing, text: ''});
      assert.ok(!cmd.includes('text='), cmd);
    });

    it('quotes text, so an apostrophe survives', function() {
      var cmd = getAddLabelCommand([[0, 1]],
        {target: existing, text: "Martha's Vineyard"});
      assert.ok(cmd.includes("text='Martha\\'s Vineyard'"), cmd);
    });

    it('passes corners through', function() {
      var cmd = getAddLabelCommand([[0, 1], [2, 3], [4, 5]],
        {target: existing, corners: [1]});
      assert.ok(cmd.includes('corners=1'), cmd);
    });

    it('omits corners when there are none', function() {
      var cmd = getAddLabelCommand([[0, 1], [2, 3]], {target: existing, corners: []});
      assert.ok(!cmd.includes('corners'), cmd);
    });

    it('passes style properties through', function() {
      var cmd = getAddLabelCommand([[0, 1]],
        {target: existing, style: {'font-size': 14, fill: 'red'}});
      assert.ok(cmd.includes("font-size='14'"), cmd);
      assert.ok(cmd.includes("fill='red'"), cmd);
    });

    it('does not quote coordinates, which must parse as numbers', function() {
      var cmd = getAddLabelCommand([[-1.5, 2]], {target: existing});
      assert.ok(cmd.includes('coordinates=-1.5,2'), cmd);
    });

    describe('the commands it writes actually run', function() {
      async function run(cmd, input) {
        return api.applyCommands(cmd + ' -o out.json',
          input ? {'in.json': JSON.stringify(input)} : undefined);
      }

      it('an anchored label', async function() {
        var out = await run(getAddLabelCommand([[-119.5, 37.8]], {target: empty}));
        var f = JSON.parse(out['out.json']).features[0];
        assert.deepEqual(f.geometry.coordinates, [-119.5, 37.8]);
      });

      it('a curve with text, corners and a style', async function() {
        var cmd = getAddLabelCommand([[0, 0], [5, 5], [10, 0]], {
          target: empty,
          text: "Martha's Vineyard",
          corners: [1],
          style: {'font-size': 14}
        });
        var out = await run(cmd);
        var f = JSON.parse(out['out.json']).features[0];
        assert.equal(f.geometry.type, 'MultiPoint');
        assert.deepEqual(f.geometry.coordinates, [[0, 0], [5, 5], [10, 0]]);
        assert.equal(f.properties['label-text'], "Martha's Vineyard");
        assert.equal(f.properties['label-corners'], '1');
        assert.equal(f.properties['font-size'], '14');
      });

      it('adding to an existing label layer', async function() {
        var input = {
          type: 'Feature',
          properties: {'label-text': 'first'},
          geometry: {type: 'Point', coordinates: [0, 0]}
        };
        var cmd = '-i in.json name=places ' +
          getAddLabelCommand([[1, 1]], {target: {mode: 'existing', target: 'places'}});
        var out = await run(cmd, input);
        assert.equal(JSON.parse(out['out.json']).features.length, 2);
      });

      it('creating a layer beside a polygon target', async function() {
        var input = {
          type: 'Feature',
          properties: {},
          geometry: {type: 'Polygon', coordinates: [[[0, 0], [0, 9], [9, 9], [0, 0]]]}
        };
        var cmd = '-i in.json name=poly ' +
          getAddLabelCommand([[1, 1]], {target: fresh}) +
          ' -o out.json target=labels';
        var out = await api.applyCommands(cmd, {'in.json': JSON.stringify(input)});
        var f = JSON.parse(out['out.json']).features[0];
        assert.deepEqual(f.geometry.coordinates, [1, 1]);
      });
    });
  });

  describe('quoteCommandValue()', function() {
    it('quotes and escapes', function() {
      assert.equal(quoteCommandValue('plain'), "'plain'");
      assert.equal(quoteCommandValue("it's"), "'it\\'s'");
      assert.equal(quoteCommandValue(''), "''");
      assert.equal(quoteCommandValue(14), "'14'");
    });

    it('round-trips through the command parser', async function() {
      var cases = ["Martha's Vineyard", 'a b', 'a"b', "it's 'here'", 'plain'];
      for (var i = 0; i < cases.length; i++) {
        var out = await api.applyCommands('-add-label coordinates=0,0 text=' +
          quoteCommandValue(cases[i]) + ' -o out.json');
        assert.equal(JSON.parse(out['out.json']).features[0].properties['label-text'],
          cases[i]);
      }
    });
  });

  describe('the style new labels are created with', function() {
    // a stand-in for the GUI, which is only a state bag and an event sink here
    function fakeGui() {
      var events = [];
      return {
        state: {},
        events: events,
        dispatchEvent: function(type, e) { events.push([type, e]); }
      };
    }

    describe('mergeStyleValues()', function() {
      it('adds the values the panel produces', function() {
        assert.deepEqual(
          mergeStyleValues({}, [['font-size', 14], ['fill', '#c00']]),
          {'font-size': 14, fill: '#c00'});
      });

      it('leaves the original alone', function() {
        var style = {'font-size': 12};
        mergeStyleValues(style, [['font-size', 14]]);
        assert.deepEqual(style, {'font-size': 12});
      });

      it('removes a field rather than setting it blank', function() {
        // how the panel says "no icon" and "no inline css"; carrying these
        // through to -add-label would write properties that mean nothing
        assert.deepEqual(mergeStyleValues({css: 'a', icon: 'star'},
          [['css', ''], ['icon', ''], ['icon-size', 0]]), {});
      });

      it('ignores a property -add-label cannot set', function() {
        // it would appear to do nothing, which is worse than doing nothing
        assert.deepEqual(mergeStyleValues({}, [['label-text', 'Reno']]), {});
        assert.ok(NEW_LABEL_STYLE_FIELDS.indexOf('label-text') == -1);
      });
    });

    it('starts at the tool default', function() {
      // A label with no position sits with its baseline on its anchor, which
      // puts the point at the foot of the text rather than in it.
      assert.deepEqual(getNewLabelStyle(fakeGui()), {'label-pos': 'c'});
    });

    it('accumulates across several panel edits', function() {
      var gui = fakeGui();
      updateNewLabelStyle(gui, [['font-family', 'Georgia']]);
      updateNewLabelStyle(gui, [['font-size', 14]]);
      assert.deepEqual(getNewLabelStyle(gui),
        {'label-pos': 'c', 'font-family': 'Georgia', 'font-size': 14});
      clearNewLabelStyle(gui);
      assert.deepEqual(getNewLabelStyle(gui), {'label-pos': 'c'});
    });

    it('a position chosen in the panel replaces the default', function() {
      var gui = fakeGui();
      updateNewLabelStyle(gui, [['label-pos', 'ne']]);
      assert.deepEqual(getNewLabelStyle(gui), {'label-pos': 'ne'});
    });
  });

});
