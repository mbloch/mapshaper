import assert from 'assert';
import {
  copyObjectStyle, canPasteStyle, getPasteStyleCommand
} from '../src/gui/gui-style-clipboard';

describe('gui-style-clipboard.mjs', function () {

  describe('lines and polygons', function () {
    it('pastes the fields that differ, unsetting the ones the source lacks', function () {
      var style = copyObjectStyle({id: 0, kind: 'line', rec: {stroke: 'red', 'stroke-width': 2}});
      var cmd = getPasteStyleCommand(style, [
        {id: 1, kind: 'line', rec: {stroke: 'blue', 'stroke-width': 2, 'stroke-dasharray': '4'}},
        {id: 2, kind: 'line', rec: {stroke: 'red', 'stroke-width': 2}}
      ]);
      assert.equal(cmd, "-style stroke='red' stroke-dasharray= ids=1");
    });

    it('groups targets that need the same change into one command', function () {
      var style = copyObjectStyle({id: 0, kind: 'line', rec: {stroke: 'red'}});
      var cmd = getPasteStyleCommand(style, [
        {id: 1, kind: 'line', rec: {stroke: 'blue'}},
        {id: 3, kind: 'line', rec: {stroke: 'blue'}}
      ]);
      assert.equal(cmd, "-style stroke='red' ids=1,3");
    });

    it('takes only the shared stroke fields from a line to a polygon', function () {
      var style = copyObjectStyle({id: 0, kind: 'line',
        rec: {stroke: 'red', 'stroke-width': 3, 'line-end': 'arrow'}});
      var cmd = getPasteStyleCommand(style, [
        {id: 4, kind: 'polygon', rec: {fill: 'yellow', stroke: 'black'}}
      ]);
      assert.equal(cmd, "-style stroke='red' stroke-width=3 ids=4");
    });

    it('is empty when every target has the style already', function () {
      var style = copyObjectStyle({id: 0, kind: 'polygon', rec: {fill: 'red'}});
      assert.equal(getPasteStyleCommand(style, [{id: 1, kind: 'polygon', rec: {fill: 'red'}}]), '');
    });
  });

  describe('labels', function () {
    it('leaves out where a label sits', function () {
      var style = copyObjectStyle({id: 0, kind: 'label',
        rec: {'font-size': 14, dx: 5, dy: 2, 'text-anchor': 'start', 'label-pos': 'n'}});
      var cmd = getPasteStyleCommand(style, [
        {id: 1, kind: 'label', rec: {'font-size': 10, dx: -3}}
      ]);
      assert.equal(cmd, "-labels font-size=14 label-pos='n' ids=1");
    });

    it('takes no position from a label without one, and gives none to a path label', function () {
      var unplaced = copyObjectStyle({id: 0, kind: 'label', rec: {'font-size': 14}});
      var placed = copyObjectStyle({id: 0, kind: 'label', rec: {'font-size': 14, 'label-pos': 'n'}});
      assert.equal(getPasteStyleCommand(unplaced, [
        {id: 1, kind: 'label', rec: {'label-pos': 's'}}
      ]), '-labels font-size=14 ids=1');
      assert.equal(getPasteStyleCommand(placed, [
        {id: 2, kind: 'label', rec: {}, pathLabel: true}
      ]), '-labels font-size=14 ids=2');
    });

    it('rewraps a block whose font changes', function () {
      var style = copyObjectStyle({id: 0, kind: 'label', rec: {'font-family': 'Arial'}});
      var cmd = getPasteStyleCommand(style, [
        {id: 1, kind: 'label', rec: {'label-text': 'a b', 'font-family': 'Georgia'}}
      ], {
        getRewrappedText: function(obj, values) {
          return values['font-family'] == 'Arial' ? 'a\nb' : null;
        }
      });
      assert.equal(cmd, "-labels font-family='Arial' ids=1 -labels text='a\\nb' ids=1");
    });
  });

  describe('symbols', function () {
    it('restyles icons with -symbols', function () {
      var style = copyObjectStyle({id: 0, kind: 'icon',
        rec: {icon: 'star', 'icon-size': 20, 'icon-fill': '#ff0000'}});
      var cmd = getPasteStyleCommand(style, [
        {id: 1, kind: 'icon', rec: {r: 5, fill: '#000000'}}
      ]);
      assert.equal(cmd.indexOf('-symbols ids=1 type=star'), 0);
      assert(/fill=#ff0000/.test(cmd));
    });

    it('pastes a marker\'s text style onto markers, not onto plain symbols', function () {
      var marker = {icon: 'circle', 'icon-size': 20, 'icon-fill': '#333333',
        'label-text': '1', 'label-pos': 'c', 'font-size': 12, fill: '#ffffff'};
      var style = copyObjectStyle({id: 0, kind: 'icon', rec: marker, marker: true});
      var cmd = getPasteStyleCommand(style, [
        {id: 1, kind: 'icon', rec: Object.assign({}, marker, {fill: '#000000', 'label-text': '2'}), marker: true},
        {id: 2, kind: 'icon', rec: {r: 5, fill: '#333333'}}
      ]);
      assert(/^-symbols ids=2 /.test(cmd));
      assert(/ -labels fill='#ffffff' ids=1$/.test(cmd));
    });

    it('does not offer a shape without room for text to a marker', function () {
      var style = copyObjectStyle({id: 0, kind: 'icon', rec: {icon: 'star', 'icon-size': 20}});
      assert.equal(canPasteStyle(style, {kind: 'icon', rec: {}, marker: true}), false);
      assert.equal(canPasteStyle(style, {kind: 'icon', rec: {}}), true);
    });

    it('gives a closed curve no ends and an open one no fill', function () {
      var style = copyObjectStyle({id: 0, kind: 'curve',
        rec: {stroke: 'red', 'line-end': 'arrow', fill: 'yellow'}});
      assert.equal(getPasteStyleCommand(style, [
        {id: 1, kind: 'curve', rec: {stroke: 'blue'}, closed: true},
        {id: 2, kind: 'curve', rec: {stroke: 'blue'}}
      ]), "-style stroke='red' fill='yellow' ids=1 -style stroke='red' line-end='arrow' ids=2");
    });
  });

  it('only pastes between compatible kinds', function () {
    var label = copyObjectStyle({id: 0, kind: 'label', rec: {'font-size': 12}});
    var curve = copyObjectStyle({id: 0, kind: 'curve', rec: {stroke: 'red'}});
    assert.equal(canPasteStyle(label, {kind: 'icon', rec: {}}), false);
    assert.equal(canPasteStyle(curve, {kind: 'line', rec: {}}), false);
    assert.equal(getPasteStyleCommand(label, [{id: 1, kind: 'line', rec: {}}]), '');
  });
});
