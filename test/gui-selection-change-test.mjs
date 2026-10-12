import assert from 'assert';
import { getSelectionChangeTest } from '../src/gui/gui-selection-change.mjs';

describe('gui-selection-change.mjs', function () {
  it('reports the first call as a change', function () {
    var changed = getSelectionChangeTest();
    assert.equal(changed([]), true);
  });

  it('ignores repeats of the same selection', function () {
    var changed = getSelectionChangeTest();
    changed([2, 5]);
    assert.equal(changed([2, 5]), false);
    assert.equal(changed([2, 5]), false);
  });

  it('reports added, removed and reordered ids', function () {
    var changed = getSelectionChangeTest();
    changed([2, 5]);
    assert.equal(changed([2, 5, 7]), true);
    assert.equal(changed([2, 7]), true);
    assert.equal(changed([7, 2]), true);
    assert.equal(changed([]), true);
  });

  it('is not affected by later changes to the array it was given', function () {
    var changed = getSelectionChangeTest();
    var ids = [1];
    changed(ids);
    ids.push(2);
    assert.equal(changed([1]), false);
  });
});
