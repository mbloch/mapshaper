import assert from 'assert';
import {
  mergeStyleValues, getNewLabelStyle, updateNewLabelStyle, clearNewLabelStyle,
  getToggleState, NEW_LABEL_STYLE_FIELDS
} from '../src/gui/gui-label-style-state';
import api from '../mapshaper.js';
import {
  createCurveState, addKnot, moveKnot, removeLastKnot,
  findKnotNear, curveIsComplete,
  handleClick, getDblclickAction, clearGesture
} from '../src/gui/gui-label-curve-state';
import { getLabelTarget, getAddLabelCommand } from '../src/gui/gui-label-commands';
import {
  getMatchingLabelIds, getLabelSelectActions, getAllLabelIds, TEXT_STYLE_FIELDS
} from '../src/gui/gui-label-select-matchers';
import { getOptionParser } from '../src/cli/mapshaper-options';
import { parseSizeValue, getSizeFieldKeyAction } from '../src/gui/gui-size-field';
import { quoteCommandValue } from '../src/gui/gui-command-utils';
import { chooseNewLabelFont, getNearestVariant,
  variantIsRegular } from '../src/gui/gui-label-fonts';

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
      // double-click has to finish on it even though a knot is now there
      var state = createCurveState();
      click(state, [10, 10]);
      click(state, [50, 40]);
      assert.equal(click(state, [90, 10]), 'added');
      assert.equal(click(state, [90, 10]), 'ignored'); // second click of two
      assert.deepEqual(dblclick(state, [90, 10]), {action: 'finish'});
    });

    it('does nothing on a double-click of a knot that was already there', function() {
      // it cannot place a knot, since one is in the way, and finishing on it
      // would end the curve somewhere other than where the gesture began
      var state = createCurveState();
      click(state, [10, 10]);
      click(state, [50, 40]);
      click(state, [90, 10]);
      // the pointer goes back to the middle knot, so neither click adds
      assert.equal(click(state, [50, 40]), 'ignored');
      assert.equal(click(state, [50, 40]), 'ignored');
      assert.deepEqual(dblclick(state, [50, 40]), {action: 'none'});
    });

    it('still finishes after a click that placed a knot elsewhere', function() {
      var state = createCurveState();
      click(state, [10, 10]);
      click(state, [50, 40]);
      click(state, [90, 10]);
      assert.deepEqual(dblclick(state, [200, 200]), {action: 'finish'});
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
      assert.deepEqual(dblclick(state, [90, 10]), {action: 'none'});
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

      it('a curve with text and a style', async function() {
        var cmd = getAddLabelCommand([[0, 0], [5, 5], [10, 0]], {
          target: empty,
          text: "Martha's Vineyard",
          style: {'font-size': 14}
        });
        var out = await run(cmd);
        var f = JSON.parse(out['out.json']).features[0];
        assert.equal(f.geometry.type, 'MultiPoint');
        assert.deepEqual(f.geometry.coordinates, [[0, 0], [5, 5], [10, 0]]);
        assert.equal(f.properties['label-text'], "Martha's Vineyard");
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

  describe('size fields', function() {
    describe('parseSizeValue()', function() {
      it('reads a number', function() {
        assert.strictEqual(parseSizeValue('14', 1, 999), 14);
        assert.strictEqual(parseSizeValue(' 13.5 ', 1, 999), 13.5);
      });

      it('accepts a pasted css length', function() {
        // the field displays plain numbers, but values get pasted from css
        assert.strictEqual(parseSizeValue('14px', 1, 999), 14);
      });

      it('clamps to the bounds', function() {
        assert.strictEqual(parseSizeValue('0', 1, 999), 1);
        assert.strictEqual(parseSizeValue('-8', 1, 999), 1);
        assert.strictEqual(parseSizeValue('4000', 1, 999), 999);
      });

      it('rounds to a tenth, so stepping cannot accumulate float noise', function() {
        assert.strictEqual(parseSizeValue('12.34', 1, 999), 12.3);
    });

    it('keeps more of a value when the field asks for it', function() {
      // stroke widths, whose useful hairlines are quarters of a pixel
      assert.strictEqual(parseSizeValue('0.25', 0, 999, 2), 0.25);
      assert.strictEqual(parseSizeValue('0.256', 0, 999, 2), 0.26);
      assert.strictEqual(parseSizeValue('0.25', 0, 999), 0.3);
      });

      it('has no value for a field holding nothing usable', function() {
        // which includes holding nothing: blank is how a mixed selection shows,
        // and committing one must not invent a size for it
        assert.strictEqual(parseSizeValue('', 1, 999), null);
        assert.strictEqual(parseSizeValue('   ', 1, 999), null);
        assert.strictEqual(parseSizeValue('big', 1, 999), null);
        assert.strictEqual(parseSizeValue(undefined, 1, 999), null);
      });
    });

    describe('getSizeFieldKeyAction()', function() {
      it('steps on the arrows, by more with shift', function() {
        assert.deepEqual(getSizeFieldKeyAction('ArrowUp', false),
          {type: 'step', delta: 1});
        assert.deepEqual(getSizeFieldKeyAction('ArrowDown', false),
          {type: 'step', delta: -1});
        assert.deepEqual(getSizeFieldKeyAction('ArrowUp', true),
          {type: 'step', delta: 10});
        assert.deepEqual(getSizeFieldKeyAction('ArrowDown', true),
          {type: 'step', delta: -10});
      });

      it('takes the step sizes from the field', function() {
        var opts = {step: 0.5, bigStep: 5};
        assert.deepEqual(getSizeFieldKeyAction('ArrowUp', false, opts),
          {type: 'step', delta: 0.5});
        assert.deepEqual(getSizeFieldKeyAction('ArrowUp', true, opts),
          {type: 'step', delta: 5});
      });

      it('commits on enter and reverts on escape', function() {
        assert.deepEqual(getSizeFieldKeyAction('Enter', false), {type: 'commit'});
        assert.deepEqual(getSizeFieldKeyAction('Escape', false), {type: 'revert'});
      });

      it('leaves every other key alone', function() {
        // the field stops propagation for all of them anyway -- while the caret
        // is in it, Backspace must not reach the tool and take back a knot
        ['1', 'x', 'Backspace', 'Tab', 'ArrowLeft'].forEach(function(key) {
          assert.strictEqual(getSizeFieldKeyAction(key, false), null);
        });
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

      it('every field in the list is an option -add-label takes', function() {
        // The list is what the panel is allowed to set with nothing selected,
        // so a field missing from -add-label is a control that silently does
        // nothing for the next label. icon-color was one.
        var defn = getOptionParser().findCommand('add-label').done();
        var declared = defn.options.map(function(o) { return o.name; });
        var missing = NEW_LABEL_STYLE_FIELDS.filter(function(field) {
          return declared.indexOf(field) == -1;
        });
        assert.deepEqual(missing, []);
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

  describe('selecting labels from one of them', function() {
    // the real test, so that these predicates agree with the renderer about
    // what a label is
    var isLabel = api.internal.svg.featureIsLabel;

    // A label record, given the style properties that matter to a test.
    function label(style) {
      return Object.assign({'label-text': 'Reno'}, style || {});
    }

    function ids(records, id, kind) {
      return getMatchingLabelIds(records, id, kind, isLabel);
    }

    function actionNames(records, id) {
      return getLabelSelectActions(records, id, isLabel).map(function(a) {
        return a.label + ':' + a.ids.length;
      });
    }

    describe('all labels', function() {
      it('is every label on the layer', function() {
        var records = [label(), label(), label()];
        assert.deepEqual(ids(records, 1, 'all'), [0, 1, 2]);
      });

      it('Cmd-A asks for the same set without pointing at a label', function() {
        var records = [label(), {r: 3, fill: '#c00'}, label()];
        assert.deepEqual(getAllLabelIds(records, isLabel), [0, 2]);
        assert.deepEqual(getAllLabelIds(null, isLabel), []);
      });

      it('skips features that are not labels', function() {
        // a labels layer can hold plain points too -- a dots layer given label
        // text by the point panel is one -- and a point is not stylable here
        var records = [label(), {r: 3, fill: '#c00'}, label()];
        assert.deepEqual(ids(records, 0, 'all'), [0, 2]);
      });

      it('a right-click that did not land on a label matches nothing', function() {
        assert.deepEqual(ids([label(), {r: 3}], 1, 'all'), []);
      });
    });

    describe('same text style', function() {
      it('a property left unset matches the default it renders as', function() {
        // the commonest pair on a map: a label the panel has touched and one it
        // has not, which look identical
        var records = [label({'font-size': 12}), label()];
        assert.deepEqual(ids(records, 0, 'text-style'), [0, 1]);
      });

      it('a different size is a different style', function() {
        var records = [label({'font-size': 12}), label({'font-size': 18})];
        assert.deepEqual(ids(records, 0, 'text-style'), [0]);
      });

      it('an unset font is its own value', function() {
        // it is whatever the browser resolves sans-serif to, which differs by
        // machine and is a real difference from a font the user named
        var records = [label(), label({'font-family': 'Georgia'}), label()];
        assert.deepEqual(ids(records, 0, 'text-style'), [0, 2]);
      });

      it('weight and slant count, and Regular stored as nothing matches it', function() {
        var records = [
          label({'font-style': 'normal', 'font-weight': '400'}),
          label(),
          label({'font-weight': '700'})
        ];
        assert.deepEqual(ids(records, 0, 'text-style'), [0, 1]);
      });

      it('css and class count', function() {
        // either can carry anything the properties above carry and more
        var records = [label(), label({css: 'text-shadow: 1px 1px #fff'}),
          label({'class': 'big'})];
        assert.deepEqual(ids(records, 0, 'text-style'), [0]);
        assert.deepEqual(ids(records, 1, 'text-style'), [1]);
      });

      it('where the text sits does not count', function() {
        // the panel's other sections edit these, and they are usually the
        // difference between a label placed by hand and one that was not
        var records = [
          label(),
          label({'label-pos': 'ne', 'label-align': 'right', dx: 4, dy: -2,
            'text-anchor': 'end', 'label-start-offset': '40%'})
        ];
        assert.deepEqual(ids(records, 0, 'text-style'), [0, 1]);
        assert.ok(TEXT_STYLE_FIELDS.indexOf('label-pos') == -1);
        assert.ok(TEXT_STYLE_FIELDS.indexOf('label-align') == -1);
      });

      it('colour and symbol do not count either', function() {
        var records = [label(), label({fill: '#c00', icon: 'star'})];
        assert.deepEqual(ids(records, 0, 'text-style'), [0, 1]);
      });
    });

    describe('same fill color', function() {
      it('black stored as nothing is black', function() {
        var records = [label({fill: '#000000'}), label(), label({fill: '#c00'})];
        assert.deepEqual(ids(records, 0, 'fill'), [0, 1]);
      });

      it('opacity is not colour', function() {
        // the item says colour, and a label faded to 50% is the same colour
        var records = [label({fill: '#c00'}), label({fill: '#c00', opacity: 0.5})];
        assert.deepEqual(ids(records, 0, 'fill'), [0, 1]);
      });
    });

    describe('same icon', function() {
      it('is the shape, not its size or colour', function() {
        var records = [
          label({icon: 'star', 'icon-size': 5}),
          label({icon: 'star', 'icon-size': 9, 'icon-color': '#c00'}),
          label({icon: 'circle'})
        ];
        assert.deepEqual(ids(records, 0, 'icon'), [0, 1]);
      });
    });

    describe('which items are worth offering', function() {
      it('a whole menu', function() {
        var records = [
          label({fill: '#c00', icon: 'star'}),
          label({fill: '#c00', icon: 'star', 'font-size': 18}),
          label({fill: '#c00', 'font-size': 18}),
          label({'font-size': 18})
        ];
        assert.deepEqual(actionNames(records, 0),
          ['all labels:4', 'same fill color:3', 'same icon:2']);
        // label 0 is the only one in its text style, so that item is left out
        assert.deepEqual(ids(records, 0, 'text-style'), [0]);
      });

      it('an item that would select only the label pointed at is left out', function() {
        // a plain click on that label already narrows the selection to it
        var records = [label({fill: '#c00'}), label(), label()];
        assert.deepEqual(actionNames(records, 0), ['all labels:3']);
      });

      it('an item that matches every label is left out', function() {
        // "all labels" says it more plainly, and four items doing the same
        // thing says nothing about the layer
        var records = [label(), label(), label()];
        assert.deepEqual(actionNames(records, 1), ['all labels:3']);
      });

      it('same icon is not offered for a label with no symbol', function() {
        // it would select every label that has none, which nobody asked for
        var records = [label(), label(), label({icon: 'star'})];
        assert.deepEqual(actionNames(records, 0), ['all labels:3']);
        assert.deepEqual(actionNames(records, 2), ['all labels:3']);
      });

      it('a layer with one label has nothing to offer', function() {
        assert.deepEqual(actionNames([label()], 0), []);
      });

      it('the label pointed at is always in what an item selects', function() {
        var records = [label({fill: '#c00'}), label({fill: '#c00'}), label()];
        getLabelSelectActions(records, 1, isLabel).forEach(function(action) {
          assert.ok(action.ids.indexOf(1) > -1, action.label);
          // ascending, because they go to the hit control as a selection
          assert.deepEqual(action.ids, action.ids.concat().sort(function(a, b) {
            return a - b;
          }));
        });
      });
    });
  });

  describe('getToggleState()', function() {
    it('agrees on or off', function() {
      assert.equal(getToggleState([true, true]), 'on');
      assert.equal(getToggleState([false, false, false]), 'off');
    });

    it('a target that disagrees is mixed', function() {
      // The state the Icon switch has no value to show for: some of the
      // selected labels have a symbol and some do not.
      assert.equal(getToggleState([true, false]), 'mixed');
      assert.equal(getToggleState([false, false, true]), 'mixed');
    });

    it('one label is never mixed', function() {
      assert.equal(getToggleState([true]), 'on');
      assert.equal(getToggleState([false]), 'off');
    });

    it('nothing to ask about is off', function() {
      // "new labels", where the style is held by the tool rather than by any
      // feature; the panel answers from that style instead.
      assert.equal(getToggleState([]), 'off');
    });

    it('reads the values it is given rather than requiring booleans', function() {
      // it is handed icon names and undefined record fields
      assert.equal(getToggleState(['circle', 'star']), 'on');
      assert.equal(getToggleState([undefined, '']), 'off');
      assert.equal(getToggleState(['circle', undefined]), 'mixed');
    });
  });

  describe('getNearestVariant()', function() {
    function variants(list) {
      return list.map(function(pair) {
        return {style: pair[0], weight: String(pair[1]), value: pair[0] + '|' + pair[1]};
      });
    }

    var fullFamily = variants([['normal', 300], ['normal', 400], ['normal', 700],
      ['italic', 400], ['italic', 700]]);

    it('an exact match is the nearest', function() {
      var v = getNearestVariant(fullFamily, 'italic', '700');
      assert.equal(v.value, 'italic|700');
    });

    it('a label with no face of its own is Regular', function() {
      // What the panel shows for a label carrying no font-style or
      // font-weight, which is how most labels are.
      assert.equal(getNearestVariant(fullFamily, '', '').value, 'normal|400');
    });

    it('slant is kept ahead of weight', function() {
      // Light Italic in a font with no Light: Italic reads more like the
      // request than Light upright does.
      var v = getNearestVariant(fullFamily, 'italic', '300');
      assert.equal(v.value, 'italic|400');
    });

    it('slant is given up when the font has none', function() {
      var uprightOnly = variants([['normal', 400], ['normal', 700]]);
      assert.equal(getNearestVariant(uprightOnly, 'italic', '700').value, 'normal|700');
    });

    it('a font with one face answers everything with it', function() {
      var oneFace = variants([['normal', 700]]);
      assert.equal(getNearestVariant(oneFace, 'italic', '300').value, 'normal|700');
    });

    it('a tie between two weights goes to the heavier', function() {
      var gap = variants([['normal', 300], ['normal', 700]]);
      assert.equal(getNearestVariant(gap, 'normal', '500').value, 'normal|700');
    });

    it('a font with no faces has no nearest', function() {
      assert.equal(getNearestVariant([], 'normal', '400'), null);
    });
  });

  describe('chooseNewLabelFont()', function() {
    it('prefers the tool\'s font when the machine has it', function() {
      assert.equal(chooseNewLabelFont('NYTFranklin',
        ['Arial', 'Georgia', 'NYTFranklin'], 'Helvetica'), 'NYTFranklin');
    });

    it('falls back to the font unfonted text is drawn in', function() {
      assert.equal(chooseNewLabelFont('NYTFranklin',
        ['Arial', 'Georgia'], 'Helvetica'), 'Helvetica');
    });

    it('has nothing to give when neither is available', function() {
      // A browser that could not be measured: the panel then behaves as it did
      // before any of this, with no font named.
      assert.equal(chooseNewLabelFont('NYTFranklin', [], ''), '');
      assert.equal(chooseNewLabelFont('NYTFranklin', [], null), '');
    });
  });

  describe('variantIsRegular()', function() {
    it('normal 400 is what an unset face renders as', function() {
      assert.ok(variantIsRegular({style: 'normal', weight: '400'}));
      assert.ok(!variantIsRegular({style: 'italic', weight: '400'}));
      assert.ok(!variantIsRegular({style: 'normal', weight: '700'}));
      assert.ok(!variantIsRegular(null));
    });
  });

});
