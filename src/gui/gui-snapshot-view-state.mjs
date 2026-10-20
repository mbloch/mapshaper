// The view settings a snapshot saves in its gui field, so that a snapshot
// that starts a session opens as it was saved. The layers that are shown and
// the selected layer are saved with the layers themselves (see exportLayer()).
//
// gui: {
//   preview_mode: true,             // the preview toggle is on
//   active_layer_hidden: true,      // the selected layer's eye is off
//   closed_layer_sections: ['', 'd2'] // closed sections of the Layers panel:
//                                   // '' for the Layers section, otherwise
//                                   // a frame's dataset ID
// }
// Settings at their defaults are left out, and a snapshot with none of them
// has no gui field (as in snapshots from before these settings were saved).

// view: {previewMode, activeLayerHidden, closedSections: {<key>: true}}
export function formatSnapshotGuiState(view) {
  var state = {};
  var closed = Object.keys(view.closedSections || {}).filter(function(key) {
    return !!view.closedSections[key];
  });
  if (view.previewMode) state.preview_mode = true;
  if (view.activeLayerHidden) state.active_layer_hidden = true;
  if (closed.length > 0) state.closed_layer_sections = closed;
  return Object.keys(state).length > 0 ? state : null;
}

// Returns the settings of a snapshot's gui field, as formatSnapshotGuiState()
// takes them; anything missing or malformed is left at its default
export function parseSnapshotGuiState(state) {
  var view = {previewMode: false, activeLayerHidden: false, closedSections: {}};
  if (!state || typeof state != 'object') return view;
  view.previewMode = state.preview_mode === true;
  view.activeLayerHidden = state.active_layer_hidden === true;
  if (Array.isArray(state.closed_layer_sections)) {
    state.closed_layer_sections.forEach(function(key) {
      if (typeof key == 'string') view.closedSections[key] = true;
    });
  }
  return view;
}
