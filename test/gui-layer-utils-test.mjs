import api from '../mapshaper.js';
import assert from 'assert';
import { showNewLayers } from '../src/gui/gui-layer-utils';

describe('gui-layer-utils.mjs', function () {
  describe('showNewLayers()', function () {
    function points() {
      return {geometry_type: 'point', shapes: [[[0, 0]]]};
    }

    it('makes a layer whose visibility was never set visible', function () {
      var lyr = points();
      showNewLayers([{layer: lyr, dataset: {}}]);
      assert.strictEqual(lyr.pinned, true);
    });

    it('leaves a new active layer unpinned, so that it hides when another layer becomes active', function () {
      var lyr = points(), other = points();
      showNewLayers([{layer: lyr, dataset: {}}, {layer: other, dataset: {}}], {layer: lyr, dataset: {}});
      assert.strictEqual(lyr.pinned, false);
      assert.strictEqual(other.pinned, true);
    });

    it('hides the previous active layer when a new layer with features becomes active', function () {
      var prev = Object.assign(points(), {pinned: false}), lyr = points();
      showNewLayers([{layer: prev, dataset: {}}, {layer: lyr, dataset: {}}],
        {layer: lyr, dataset: {}}, {layer: prev, dataset: {}});
      assert.strictEqual(prev.pinned, false);
    });

    it('keeps the previous active layer visible when an empty layer is made to draw in', function () {
      var prev = Object.assign(points(), {pinned: false});
      var lyr = {geometry_type: 'polyline', shapes: []};
      showNewLayers([{layer: prev, dataset: {}}, {layer: lyr, dataset: {}}],
        {layer: lyr, dataset: {}}, {layer: prev, dataset: {}});
      assert.strictEqual(prev.pinned, true);
    });

    it('does not show a previous active layer that was hidden with its eye icon', function () {
      var prev = Object.assign(points(), {pinned: false, hidden: true});
      var lyr = {geometry_type: 'point', shapes: []};
      showNewLayers([{layer: prev, dataset: {}}, {layer: lyr, dataset: {}}],
        {layer: lyr, dataset: {}}, {layer: prev, dataset: {}});
      assert.strictEqual(prev.pinned, false);
    });

    it('leaves a layer that was hidden, or saved hidden in a snapshot, hidden', function () {
      var lyr = Object.assign(points(), {pinned: false});
      showNewLayers([{layer: lyr, dataset: {}}]);
      assert.strictEqual(lyr.pinned, false);
    });

    it('leaves a data-only layer alone, since it has nothing to draw', function () {
      var lyr = {data: new api.internal.DataTable([{a: 1}])};
      showNewLayers([{layer: lyr, dataset: {}}]);
      assert.strictEqual(lyr.pinned, undefined);
    });
  });
});
