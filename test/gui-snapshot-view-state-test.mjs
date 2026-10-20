import assert from 'assert';
import {
  formatSnapshotGuiState, parseSnapshotGuiState
} from '../src/gui/gui-snapshot-view-state.mjs';

describe('gui-snapshot-view-state.mjs', function () {
  var defaults = {previewMode: false, activeLayerHidden: false, closedSections: {}};

  it('saves the settings that differ from the defaults', function () {
    assert.deepEqual(formatSnapshotGuiState({
      previewMode: true, activeLayerHidden: true, closedSections: {'': true, d2: true, d3: false}
    }), {preview_mode: true, active_layer_hidden: true, closed_layer_sections: ['', 'd2']});
    assert.deepEqual(formatSnapshotGuiState({previewMode: true}), {preview_mode: true});
  });

  it('saves nothing for a view at its defaults', function () {
    assert.strictEqual(formatSnapshotGuiState(defaults), null);
    assert.strictEqual(formatSnapshotGuiState({closedSections: {d2: false}}), null);
  });

  it('reads back what it saves', function () {
    var view = {previewMode: true, activeLayerHidden: false, closedSections: {'': true, d2: true}};
    assert.deepEqual(parseSnapshotGuiState(formatSnapshotGuiState(view)), view);
  });

  it('reads older snapshots, with no gui field, as the default view', function () {
    assert.deepEqual(parseSnapshotGuiState(undefined), defaults);
    assert.deepEqual(parseSnapshotGuiState(null), defaults);
  });

  it('ignores settings it does not know or cannot read', function () {
    assert.deepEqual(parseSnapshotGuiState('x'), defaults);
    assert.deepEqual(parseSnapshotGuiState({
      preview_mode: 'yes', closed_layer_sections: ['d1', 2, null], map_extent: [0, 0, 1, 1]
    }), {previewMode: false, activeLayerHidden: false, closedSections: {d1: true}});
    assert.deepEqual(parseSnapshotGuiState({closed_layer_sections: 'd1'}), defaults);
  });
});
