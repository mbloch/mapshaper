import assert from 'assert';
import { formatEditingStatus } from '../src/gui/gui-editing-status.mjs';

describe('formatEditingStatus()', function() {
  it('says what the panel controls act on', function() {
    assert.equal(formatEditingStatus({selected: 3, total: 10}), 'Editing: 3 selected');
    assert.equal(formatEditingStatus({selected: 0, total: 10}), 'Editing: all');
    assert.equal(formatEditingStatus({selected: 0, total: 0}), 'Editing: none (empty layer)');
  });

  it('has the label panel\'s own states', function() {
    assert.equal(formatEditingStatus({selected: 0, total: 0, newLabels: true}), 'Editing: new labels');
    assert.equal(formatEditingStatus({selected: 0, total: 4, newLabels: true}), 'Editing: new labels');
    // a selection outranks an armed tool
    assert.equal(formatEditingStatus({selected: 2, total: 4, newLabels: true}), 'Editing: 2 selected');
    assert.equal(formatEditingStatus({selected: 1, total: 4, editingText: true}), 'Editing: this label');
  });
});
