import assert from 'assert';
import api from '../mapshaper.js';

var internal = api.internal;

// -add-shape extend appends the new path's arcs to an existing line, in place,
// rather than merging in a new layer, so undo has to restore the line's shape
// as well as the dataset's arcs.
describe('mapshaper-add-shape.mjs extend undo round trip', function() {

  function state(dataset) {
    var data = dataset.arcs.getVertexData();
    return JSON.stringify({
      nn: Array.from(data.nn),
      xx: Array.from(data.xx),
      yy: Array.from(data.yy),
      shapes: dataset.layers.map(function(lyr) { return lyr.shapes; }),
      records: dataset.layers.map(function(lyr) { return lyr.data ? lyr.data.getRecords() : null; })
    });
  }

  function runWithUndo(dataset, opts) {
    var tx = new internal.UndoTransaction('-add-shape');
    internal.setActiveUndoTransaction(tx);
    try {
      api.cmd.addShape(dataset.layers, dataset, opts);
    } finally {
      internal.clearActiveUndoTransaction(tx);
    }
    return tx;
  }

  function undo(tx) {
    internal.restoreCapturedUnits(
      internal.filterUnchangedRestoreUnits(tx.getCapturedUnits()));
  }

  function getDataset() {
    return internal.importGeoJSON({
      type: 'Feature',
      properties: {stroke: 'red'},
      geometry: {type: 'LineString', coordinates: [[0, 0], [10, 0]]}
    });
  }

  it('restores the line and the arcs', function() {
    var dataset = getDataset();
    var before = state(dataset);
    undo(runWithUndo(dataset, {coordinates: [10, 0, 15, 5], extend: true, stroke: 'blue'}));
    assert.equal(state(dataset), before);
  });
});
