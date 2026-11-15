import assert from 'assert';
import api from '../mapshaper.js';
import { filterSelectionForMode } from '../src/gui/gui-selection-carry';

var DataTable = api.internal.DataTable;

// 0: text label, 1: numbered marker, 2: plain point, 3: null shape
function getPointLayer() {
  return {
    geometry_type: 'point',
    shapes: [[[0, 0]], [[1, 1]], [[2, 2]], null],
    data: new DataTable([
      {'label-text': 'Paris'},
      {'label-text': '1', 'label-pos': 'c', icon: 'circle'},
      {},
      {'label-text': 'Nowhere'}
    ])
  };
}

describe('gui-selection-carry.mjs', function () {
  describe('filterSelectionForMode()', function () {
    it('keeps features with geometry in the selection and style modes', function () {
      var lyr = getPointLayer();
      ['selection', 'info', 'point_style', 'line_style', 'polygon_style'].forEach(function(mode) {
        assert.deepEqual(filterSelectionForMode([2, 0, 1, 3], mode, lyr), [2, 0, 1]);
      });
    });

    it('keeps only what the label tool edits: anything but a marker', function () {
      assert.deepEqual(filterSelectionForMode([0, 1, 2, 3], 'label', getPointLayer()), [0, 2]);
    });

    it('keeps only what the symbol tool edits: anything but a text label', function () {
      assert.deepEqual(filterSelectionForMode([0, 1, 2, 3], 'symbols', getPointLayer()), [1, 2]);
    });

    it('drops the selection in modes that do not select', function () {
      var lyr = getPointLayer();
      ['edit_points', 'edit_lines', 'reshape_polygons', 'curve_lines', 'snip_lines',
        'vertices', 'box', 'ruler', 'off', 'label_style'].forEach(function(mode) {
        assert.deepEqual(filterSelectionForMode([0, 2], mode, lyr), []);
      });
    });

    it('drops ids that are out of range', function () {
      assert.deepEqual(filterSelectionForMode([-1, 2, 4], 'selection', getPointLayer()), [2]);
    });

    it('handles a layer without data or geometry', function () {
      var lyr = {geometry_type: 'polygon', shapes: [[[0]], [[1]]]};
      assert.deepEqual(filterSelectionForMode([1, 0], 'polygon_style', lyr), [1, 0]);
      assert.deepEqual(filterSelectionForMode([0], 'selection', {data: new DataTable(1)}), []);
      assert.deepEqual(filterSelectionForMode([0], 'selection', null), []);
    });
  });
});
