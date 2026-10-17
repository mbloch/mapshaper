import {
  markDatasetInfoChanged,
  noteDatasetInfoWillChange
} from '../undo/mapshaper-undo-tracking';

// Frame membership
//
// A content dataset belongs to a frame if dataset.info.frame holds the ID of
// the frame's dataset (see mapshaper-dataset-ids.mjs). The reference is kept
// in info so that it travels with derived data: copyDatasetInfo() and
// splitApartLayers() copy it. It is never inherited from a dataset that is
// merged into another one (see mergeDatasetInfo()).

export function getFrameRef(dataset) {
  return dataset && dataset.info && dataset.info.frame || null;
}

// @id ID of a frame dataset, or null to make the dataset unframed
export function setFrameRef(dataset, id) {
  var info = dataset.info || (dataset.info = {});
  if (getFrameRef(dataset) == (id || null)) return;
  noteDatasetInfoWillChange(dataset, {operation: 'setFrameRef'});
  if (id) {
    info.frame = id;
  } else {
    delete info.frame;
  }
  markDatasetInfoChanged(dataset, {operation: 'setFrameRef'});
}

// The frame reference that all of @datasets share, or null if they don't
// all share one
export function getSharedFrameRef(datasets) {
  var ref = datasets.length > 0 ? getFrameRef(datasets[0]) : null;
  return datasets.every(function(dataset) {
    return getFrameRef(dataset) == ref;
  }) ? ref : null;
}
