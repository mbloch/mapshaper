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
