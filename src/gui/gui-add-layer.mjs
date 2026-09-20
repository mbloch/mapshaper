import { internal } from './gui-core';
import {
  addUndoTransactionToHistory,
  createUndoTransaction
} from './gui-app-undo';

// Creates an empty layer directly, which a tool can do in the middle of opening
// because it takes effect before the call returns. This is for the layer a tool
// makes to have somewhere to put its first feature, in a session that has
// nothing loaded (see gui-edit-points.mjs, gui-draw-lines2.mjs and
// gui-label-tool2.mjs).
//
// A layer the user asked for is created by the "Draw" links in the layer panel
// instead (gui-add-layer-links.mjs), which run -add-layer: the command puts the
// layer in the session history, where a hand-made layer has to appear for the
// session to replay.
export function addEmptyLayer(gui, name, type) {
  var targ = gui.model.getActiveLayer();
  var crsInfo = targ && internal.getDatasetCrsInfo(targ.dataset);
  var undoTransaction = createUndoTransaction(gui, 'add empty layer');
  var dataset = {
    layers: [{
      name: name || undefined,
      geometry_type: type,
      shapes: []
    }],
    info: {}
  };
  if (type == 'polygon' || type == 'polyline') {
    dataset.arcs = new internal.ArcCollection();
  }
  if (crsInfo) {
    internal.setDatasetCrsInfo(dataset, crsInfo);
  }
  if (undoTransaction) {
    undoTransaction.captureCatalogBefore(gui.model, {operation: 'addEmptyLayer'});
  }
  gui.model.addDataset(dataset);
  gui.model.updated({select: true});
  addUndoTransactionToHistory(gui, undoTransaction, {
    flags: {select: true},
    entryPrefix: 'add-layer'
  });
}
