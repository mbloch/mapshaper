import assert from 'assert';
import api from '../mapshaper.js';
import { getLabelCueState, labelCuesApply } from '../src/gui/gui-label-hit-cues';
import { withoutLabelledFeatures } from '../src/gui/gui-overlay-styler';

var internal = api.internal;

function pointLayer(records) {
  return {
    geometry_type: 'point',
    shapes: records.map(function(rec, i) { return [[i, i]]; }),
    data: new internal.DataTable(records)
  };
}

describe('gui label hit cues', function() {

  describe('getLabelCueState()', function() {
    it('inspect mode: the hovered label is hovered, nothing is selected', function() {
      assert.deepEqual(getLabelCueState({mode: 'info', ids: [2, 5], id: 2}),
        {selected: [], hoverId: 2});
    });

    it('inspect mode: the pinned label is selected', function() {
      assert.deepEqual(getLabelCueState({mode: 'info', ids: [2], id: 2, pinned: true}),
        {selected: [2], hoverId: -1});
    });

    it('selection mode: the hit ids are selected, the hover is outside them', function() {
      assert.deepEqual(getLabelCueState({mode: 'selection', ids: [1, 3], id: 4}),
        {selected: [1, 3], hoverId: 4});
      assert.deepEqual(getLabelCueState({mode: 'selection', ids: [1, 3], id: 3}),
        {selected: [1, 3], hoverId: -1});
    });

    it('nothing hit', function() {
      assert.deepEqual(getLabelCueState({mode: 'info', ids: [], id: -1}),
        {selected: [], hoverId: -1});
    });
  });

  describe('labelCuesApply()', function() {
    var labels = pointLayer([{'label-text': 'a'}]);
    var points = pointLayer([{name: 'a'}]);

    it('applies to label layers in inspect and selection modes', function() {
      assert(labelCuesApply('info', labels));
      assert(labelCuesApply('selection', labels));
    });

    it('not in other modes, on other layers, or on a hidden layer', function() {
      assert(!labelCuesApply('label', labels));
      assert(!labelCuesApply('point_style', labels));
      assert(!labelCuesApply('info', points));
      assert(!labelCuesApply('info', null));
      assert(!labelCuesApply('info', Object.assign({hidden: true}, labels)));
    });
  });

  describe('withoutLabelledFeatures()', function() {
    it('keeps only features with no label text', function() {
      var lyr = pointLayer([{'label-text': 'a'}, {'label-text': ''},
        {'label-text': 0}, {'label-text': null}]);
      assert.deepEqual(withoutLabelledFeatures(lyr, {ids: [0, 1, 2, 3], id: 1}),
        {ids: [1, 3], id: 1});
      assert.deepEqual(withoutLabelledFeatures(lyr, {ids: [0], id: 0, pinned: true}),
        {ids: [], id: -1, pinned: true});
    });
  });
});
